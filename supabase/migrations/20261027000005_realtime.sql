-- Realtime. Supabase Realtime delivers a row change only to subscribers who
-- may SELECT that row under RLS. Anonymous visitors and reporters cannot read
-- public.reports, so each gets a small trigger-maintained table that is safe
-- for them to read and subscribe to.

-- Approved, redacted reports only. Readable by everyone.
create table public.public_reports (
  id uuid primary key references public.reports (id) on delete cascade,
  phone_e164 text not null,
  category text not null,
  incident_date date not null,
  public_summary text not null,
  reviewed_at timestamptz
);

create index public_reports_phone_idx on public.public_reports (phone_e164);
create index public_reports_reviewed_idx on public.public_reports (reviewed_at desc);

-- Status only, so reporters never receive moderator notes or identities.
create table public.report_updates (
  report_id uuid primary key references public.reports (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  status public.report_status not null,
  updated_at timestamptz not null default now()
);

create index report_updates_reporter_idx on public.report_updates (reporter_id);

alter table public.public_reports enable row level security;
alter table public.report_updates enable row level security;

grant select on public.public_reports to anon, authenticated;
create policy public_reports_select_all on public.public_reports
  for select to anon, authenticated using (true);

grant select on public.report_updates to authenticated;
create policy report_updates_select_own on public.report_updates
  for select to authenticated using (reporter_id = (select auth.uid()));

create function private.sync_realtime_tables() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' then
    insert into public.public_reports (id, phone_e164, category, incident_date, public_summary, reviewed_at)
    select new.id, p.normalized_e164, c.name, new.incident_date, new.public_summary, new.reviewed_at
    from public.phone_numbers p, public.report_categories c
    where p.id = new.phone_number_id and c.id = new.category_id
    on conflict (id) do update set
      phone_e164 = excluded.phone_e164,
      category = excluded.category,
      incident_date = excluded.incident_date,
      public_summary = excluded.public_summary,
      reviewed_at = excluded.reviewed_at;
  else
    delete from public.public_reports where id = new.id;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.report_updates (report_id, reporter_id, status, updated_at)
    values (new.id, new.reporter_id, new.status, now())
    on conflict (report_id) do update set status = excluded.status, updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_realtime_tables() from public, anon, authenticated;

create trigger reports_sync_realtime
  after insert or update on public.reports
  for each row execute function private.sync_realtime_tables();

-- Backfill rows that existed before this migration.
insert into public.public_reports (id, phone_e164, category, incident_date, public_summary, reviewed_at)
select r.id, p.normalized_e164, c.name, r.incident_date, r.public_summary, r.reviewed_at
from public.reports r
join public.phone_numbers p on p.id = r.phone_number_id
join public.report_categories c on c.id = r.category_id
where r.status = 'approved'
on conflict (id) do nothing;

insert into public.report_updates (report_id, reporter_id, status, updated_at)
select id, reporter_id, status, updated_at from public.reports
on conflict (report_id) do nothing;

-- Publish changes. reports and appeals are readable by moderators only, so
-- other subscribers receive nothing from them. Skipped where the publication
-- does not exist (the PGlite test harness).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.public_reports, public.report_updates, public.reports, public.appeals;
  end if;
end;
$$;
