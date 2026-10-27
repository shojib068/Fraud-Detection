-- Realtime tables: public_reports mirrors approved reports only, and
-- report_updates lets each reporter follow only their own reports.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mod@test.local');
insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'moderator');

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
insert into ids select 'r1', (public.submit_report(
  '+8801711000001', (select id from public.report_categories order by name limit 1),
  current_date - 1, 'Caller asked for my bKash OTP. My NID is 1234567890.') ->> 'id')::uuid;
reset role;

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'public_reports'
  ),
  'public_reports is published to Realtime'
);
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'public_reports'),
  array['category', 'id', 'incident_date', 'phone_e164', 'public_summary', 'reviewed_at'],
  'public_reports holds only public fields'
);
select is(
  (select count(*)::int from public.public_reports), 0, 'pending reports are not in public_reports'
);
select is(
  (select status::text from public.report_updates where report_id = (select v from ids where k = 'r1')),
  'pending', 'submission is recorded in report_updates'
);

-- Approve.
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
do $$ begin
  perform public.moderate_report((select v from ids where k = 'r1'), 'approve', null,
    'Caller asked for a mobile banking OTP.');
end $$;
reset role;

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select is(
  (select public_summary from public.public_reports where id = (select v from ids where k = 'r1')),
  'Caller asked for a mobile banking OTP.', 'approval publishes the redacted summary'
);
select is(
  (select phone_e164 from public.public_reports where id = (select v from ids where k = 'r1')),
  '+8801711000001', 'public row carries the number for search'
);
select throws_ok(
  'select * from public.report_updates', '42501', null, 'anon cannot read report_updates'
);
select throws_ok(
  'delete from public.public_reports', '42501', null, 'anon cannot change public_reports'
);
reset role;

-- Reporter sees own status updates only.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select is(
  (select status::text from public.report_updates), 'approved', 'reporter sees the new status'
);
reset role;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.report_updates), 0, 'other users see no status updates');
reset role;

-- Redact, then remove.
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
do $$ begin
  perform public.moderate_report((select v from ids where k = 'r1'), 'redact', null,
    'Caller asked for a one-time PIN.');
end $$;
reset role;
select is(
  (select public_summary from public.public_reports where id = (select v from ids where k = 'r1')),
  'Caller asked for a one-time PIN.', 'redaction updates the public row'
);

set local role authenticated;
do $$ begin
  perform public.moderate_report((select v from ids where k = 'r1'), 'remove', 'Contains personal data');
end $$;
reset role;
select is(
  (select count(*)::int from public.public_reports), 0, 'removal deletes the public row'
);
select is(
  (select status::text from public.report_updates where report_id = (select v from ids where k = 'r1')),
  'removed', 'removal is recorded in report_updates'
);
select ok(
  not exists (select 1 from public.public_reports where public_summary like '%1234567890%'),
  'the raw description never reaches public_reports'
);

select * from finish();
rollback;
