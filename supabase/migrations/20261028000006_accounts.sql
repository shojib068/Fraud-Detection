-- Username + password accounts and admin account tools.
-- The app signs users up with Supabase Auth using an internal address
-- <username>@users.shieldnum.invalid (see src/lib/username.ts), with
-- "Confirm email" turned off, so no email is ever sent.

-- ---------------------------------------------------------------------------
-- Usernames
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column username text unique check (username ~ '^[a-z0-9_]{3,20}$');

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if v_username is not null and v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 characters: a-z, 0-9 or _' using errcode = '22023';
  end if;
  insert into public.profiles (id, username) values (new.id, v_username);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep reports when their author's account is deleted.
-- ---------------------------------------------------------------------------
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references auth.users (id) on delete set null;

create or replace function private.sync_realtime_tables() returns trigger
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

  -- Reports whose author was deleted have nobody to notify.
  if new.reporter_id is not null
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    insert into public.report_updates (report_id, reporter_id, status, updated_at)
    values (new.id, new.reporter_id, new.status, now())
    on conflict (report_id) do update set status = excluded.status, updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

-- Orphaned reports have a null reporter_id; compare null-safely so nobody
-- else can appeal them.
create or replace function public.submit_appeal(p_report_id uuid, p_kind public.appeal_kind, p_reason text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_report public.reports%rowtype;
  v_appeal_id uuid;
begin
  if char_length(v_reason) not between 20 and 2000 then
    raise exception 'Reason must be 20 to 2000 characters' using errcode = '22023';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  if p_kind = 'reporter_appeal' then
    if v_report.reporter_id is distinct from v_uid or v_report.status not in ('rejected', 'removed') then
      raise exception 'Only your own rejected or removed reports can be appealed' using errcode = '42501';
    end if;
  elsif p_kind = 'correction_request' then
    if v_report.status <> 'approved' then
      raise exception 'Corrections can be requested only for published reports' using errcode = '42501';
    end if;
  end if;

  if exists (select 1 from public.appeals
             where report_id = p_report_id and requester_id = v_uid and status = 'open') then
    raise exception 'You already have an open request for this report' using errcode = 'P0001', hint = 'duplicate';
  end if;

  insert into public.appeals (report_id, requester_id, kind, reason)
  values (p_report_id, v_uid, p_kind, v_reason)
  returning id into v_appeal_id;

  if p_kind = 'reporter_appeal' then
    update public.reports set status = 'appealed' where id = p_report_id;
  end if;

  perform private.log_event('appeal.submitted', 'appeal', v_appeal_id);
  return v_appeal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin tools
-- ---------------------------------------------------------------------------
create function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
begin
  if not private.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

drop function public.admin_list_users(text);
create function public.admin_list_users(p_query text default null) returns table (
  id uuid,
  username text,
  email text,
  created_at timestamptz,
  roles public.app_role[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select u.id, pr.username, u.email::text, u.created_at,
         coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}')
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
  where p_query is null
     or pr.username ilike '%' || p_query || '%'
     or u.email ilike '%' || p_query || '%'
  group by u.id, pr.username, u.email, u.created_at
  order by u.created_at desc
  limit 200;
end;
$$;

-- Deletes an account. Their reports and evidence stay, unlinked (reporter_id null).
create function public.admin_delete_user(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
begin
  if p_user = v_uid then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;
  delete from auth.users where id = p_user;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  perform private.log_event('user.deleted', 'user', p_user);
end;
$$;

-- Sets a new password for a user who forgot theirs (there is no reset email).
create function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_password is null or char_length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  perform private.log_event('user.password_reset', 'user', p_user);
end;
$$;

create function public.admin_list_numbers(p_query text default null) returns table (
  number text,
  total_reports integer,
  approved_reports integer,
  pending_reports integer,
  last_reported timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select p.normalized_e164,
         count(r.id)::int,
         (count(r.id) filter (where r.status = 'approved'))::int,
         (count(r.id) filter (where r.status in ('pending', 'needs_info', 'appealed')))::int,
         max(r.created_at)
  from public.phone_numbers p
  left join public.reports r on r.phone_number_id = p.id
  where p_query is null or p.normalized_e164 like '%' || p_query || '%'
  group by p.normalized_e164
  order by max(r.created_at) desc nulls last
  limit 200;
end;
$$;

-- Deletes a number and every report about it. Returns the evidence object
-- paths so the client can remove the files through the Storage API.
create function public.admin_delete_number(p_e164 text) returns text[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_phone_id uuid;
  v_paths text[];
begin
  perform private.require_admin();
  select id into v_phone_id from public.phone_numbers where normalized_e164 = p_e164;
  if not found then
    raise exception 'Number not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(e.storage_path), '{}') into v_paths
  from public.report_evidence e
  join public.reports r on r.id = e.report_id
  where r.phone_number_id = v_phone_id;

  -- Cascades to evidence rows, history, actions, appeals and realtime tables.
  delete from public.reports where phone_number_id = v_phone_id;
  delete from public.phone_numbers where id = v_phone_id;

  perform private.log_event('number.deleted', 'phone_number', v_phone_id);
  return v_paths;
end;
$$;

-- Admins may delete evidence files (used after admin_delete_number).
create policy evidence_delete_admin on storage.objects
  for delete to authenticated using (
    bucket_id = 'evidence' and (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.require_admin() from public, anon, authenticated;
revoke all on function public.admin_list_users(text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.admin_list_numbers(text) from public, anon;
revoke all on function public.admin_delete_number(text) from public, anon;

grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_list_numbers(text) to authenticated;
grant execute on function public.admin_delete_number(text) to authenticated;
