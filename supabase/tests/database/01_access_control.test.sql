-- Access-control matrix: anon, reporters, moderators and admins.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

-- Fixtures ------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mod@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'admin@test.local');
insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'moderator'),
  ('44444444-4444-4444-4444-444444444444', 'admin');

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;

-- Trigger created profile and base role for each new user.
select is(
  (select count(*)::int from public.user_roles
   where role = 'user' and user_id in (select id from auth.users where email like '%@test.local')),
  4, 'every new auth user gets the base user role'
);

-- Alice and Bob each submit a report.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
insert into ids select 'alice_report', (public.submit_report(
  '+8801711000001', (select id from public.report_categories order by name limit 1),
  current_date - 1, 'Caller asked for my bKash OTP pretending to be an agent.') ->> 'id')::uuid;

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into ids select 'bob_report', (public.submit_report(
  '+8801811000002', (select id from public.report_categories order by name limit 1),
  current_date - 2, 'Caller promised a lottery prize and asked for a fee.') ->> 'id')::uuid;
reset role;

select is(
  (select status::text from public.reports where id = (select v from ids where k = 'alice_report')),
  'pending', 'new reports are stored as pending'
);

-- Anon ----------------------------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select throws_ok('select * from public.reports', '42501', null, 'anon cannot read reports');
select throws_ok('select * from public.report_evidence', '42501', null, 'anon cannot read evidence');
select throws_ok('select * from public.audit_logs', '42501', null, 'anon cannot read audit logs');
select throws_ok('select * from public.user_roles', '42501', null, 'anon cannot read roles');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.phone_numbers', '42501', null, 'anon cannot read phone numbers');
select throws_ok('select * from public.moderation_actions', '42501', null, 'anon cannot read moderation actions');
select throws_ok('select * from public.report_status_history', '42501', null, 'anon cannot read status history');
select throws_ok('select * from public.appeals', '42501', null, 'anon cannot read appeals');
select ok((select count(*) from public.report_categories) = 7, 'anon can read active categories');
select is(
  (public.search_number('+8801711000001') ->> 'approved_count')::int, 0,
  'pending reports are not counted in public search'
);
select throws_ok(
  $$select public.submit_report('+8801711000009', gen_random_uuid(), current_date, 'xxxxxxxxxxxxxxxxxxxxxxxxx')$$,
  '42501', null, 'anon cannot submit reports'
);
select throws_ok($$select public.my_reports()$$, '42501', null, 'anon cannot call my_reports');
reset role;

-- Reporters -----------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.reports), 0, 'reporters cannot read the reports table directly');
select is(jsonb_array_length(public.my_reports()), 1, 'alice sees exactly her own report');
select ok(
  public.my_reports()::text not like '%moderator_note%',
  'my_reports does not expose moderator notes'
);
select throws_ok(
  $$insert into public.user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin')$$,
  '42501', null, 'users cannot grant themselves roles'
);
select throws_ok(
  $$update public.user_roles set role = 'admin' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'users cannot change their roles'
);
select throws_ok(
  $$select public.moderate_report((select v from ids where k = 'alice_report'), 'approve', null, 'Summary text here')$$,
  '42501', null, 'users cannot moderate'
);
select throws_ok(
  $$select public.set_user_role('11111111-1111-1111-1111-111111111111', 'admin')$$,
  '42501', null, 'users cannot call set_user_role'
);
select throws_ok(
  $$update public.reports set status = 'approved'$$,
  '42501', null, 'users cannot update reports directly'
);
select throws_ok(
  $$insert into public.report_evidence (report_id, storage_path, mime_type, file_size)
    values ((select v from ids where k = 'bob_report'),
            '11111111-1111-1111-1111-111111111111/x/a.png', 'image/png', 100)$$,
  '42501', null, 'users cannot attach evidence to another user''s report'
);
select lives_ok(
  $$insert into public.report_evidence (report_id, storage_path, mime_type, file_size)
    values ((select v from ids where k = 'alice_report'),
            '11111111-1111-1111-1111-111111111111/' || (select v from ids where k = 'alice_report') || '/a.png',
            'image/png', 1000)$$,
  'users can attach evidence to their own pending report'
);
select throws_ok(
  $$insert into public.report_evidence (report_id, storage_path, mime_type, file_size)
    values ((select v from ids where k = 'alice_report'),
            '11111111-1111-1111-1111-111111111111/' || (select v from ids where k = 'alice_report') || '/b.gif',
            'image/gif', 1000)$$,
  '23514', null, 'evidence must be jpeg, png or webp'
);
select throws_ok(
  $$select public.admin_list_users()$$, '42501', null, 'users cannot list accounts'
);

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.report_evidence), 0, 'bob cannot see alice''s evidence');
select ok(
  public.my_reports()::text not like '%' || (select v from ids where k = 'alice_report')::text || '%',
  'bob does not see alice''s report'
);
reset role;

-- Moderators and admins -------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from public.reports where id in (select v from ids)),
  2, 'moderators can read the review queue'
);
select throws_ok(
  $$select public.set_user_role('11111111-1111-1111-1111-111111111111', 'moderator')$$,
  '42501', null, 'moderators cannot assign roles'
);
reset role;

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$select public.set_user_role('11111111-1111-1111-1111-111111111111', 'moderator')$$,
  'admins can assign roles'
);
select throws_ok(
  $$select public.set_user_role('44444444-4444-4444-4444-444444444444', 'user')$$,
  '42501', null, 'admins cannot remove their own admin role'
);
reset role;

select * from finish();
rollback;
