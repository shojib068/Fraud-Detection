-- Username accounts and admin tools: usernames, deleting users (reports
-- kept), resetting passwords, listing and deleting numbers.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Usernames from sign-up metadata -------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@users.shieldnum.invalid', '{"username":"Alice_1"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@users.shieldnum.invalid', '{"username":"bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'mod@users.shieldnum.invalid', '{"username":"mod"}'),
  ('44444444-4444-4444-4444-444444444444', 'admin@users.shieldnum.invalid', '{"username":"admin"}');
insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'moderator'),
  ('44444444-4444-4444-4444-444444444444', 'admin');

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;

select is(
  (select username from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'alice_1', 'username is saved lowercased from sign-up metadata'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'x@users.shieldnum.invalid', '{"username":"no spaces!"}')$$,
  '22023', null, 'invalid usernames are rejected at sign-up'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'y@users.shieldnum.invalid', '{"username":"BOB"}')$$,
  '23505', null, 'usernames are unique regardless of case'
);

-- Fixtures: alice's approved report, bob's report with evidence ---------------------
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
insert into ids select 'r1', (public.submit_report(
  '+8801711000001', (select id from public.report_categories order by name limit 1),
  current_date - 1, 'Caller asked for my bKash OTP pretending to be an agent.') ->> 'id')::uuid;
reset role;

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
insert into ids select 'r2', (public.submit_report(
  '+8801711000002', (select id from public.report_categories order by name limit 1),
  current_date - 1, 'Message promised a lottery prize for a delivery fee.') ->> 'id')::uuid;
insert into public.report_evidence (report_id, storage_path, mime_type, file_size)
select v, '22222222-2222-2222-2222-222222222222/' || v || '/a.png', 'image/png', 100
from ids where k = 'r2';
reset role;

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
do $$ begin
  perform public.moderate_report((select v from ids where k = 'r1'), 'approve', null,
    'Caller asked for a mobile banking OTP.');
end $$;

-- Only admins can use the admin tools ------------------------------------------------
select throws_ok(
  $$select public.admin_delete_user('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'moderators cannot delete users'
);
select throws_ok(
  $$select public.admin_list_numbers()$$, '42501', null, 'moderators cannot list numbers'
);
reset role;

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.admin_set_password('11111111-1111-1111-1111-111111111111', 'hijacked-pass')$$,
  '42501', null, 'users cannot reset passwords'
);
select throws_ok(
  $$select public.admin_delete_number('+8801711000001')$$,
  '42501', null, 'users cannot delete numbers'
);
reset role;

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$select public.admin_delete_user('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'anon cannot call admin functions'
);
reset role;

-- Admin ---------------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local role authenticated;

select ok(
  exists (select 1 from public.admin_list_users('alice') where username = 'alice_1'),
  'admins can find users by username'
);
select is(
  (select approved_reports from public.admin_list_numbers('+8801711000001')),
  1, 'admins see report counts per number'
);
select throws_ok(
  $$select public.admin_delete_user('44444444-4444-4444-4444-444444444444')$$,
  '42501', null, 'admins cannot delete themselves'
);
select throws_ok(
  $$select public.admin_set_password('11111111-1111-1111-1111-111111111111', 'short')$$,
  '22023', null, 'new passwords must be at least 8 characters'
);
select lives_ok(
  $$select public.admin_set_password('11111111-1111-1111-1111-111111111111', 'new-password-1')$$,
  'admins can reset a password'
);
reset role;

select ok(
  (select encrypted_password = extensions.crypt('new-password-1', encrypted_password)
   from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'reset password is stored as a bcrypt hash that verifies'
);

set local role authenticated;
select lives_ok(
  $$select public.admin_delete_user('11111111-1111-1111-1111-111111111111')$$,
  'admins can delete a user'
);
reset role;

select ok(
  not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111'),
  'the account, profile and roles are gone'
);
select is(
  (select reporter_id from public.reports where id = (select v from ids where k = 'r1')),
  null::uuid, 'the deleted user''s report is kept, unlinked'
);
select ok(
  exists (select 1 from public.public_reports where id = (select v from ids where k = 'r1')),
  'the published report stays public'
);

-- Orphaned reports still work, and nobody else can appeal them.
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$select public.moderate_report((select v from ids where k = 'r1'), 'remove', 'Outdated')$$,
  'orphaned reports can still be moderated'
);
reset role;

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.submit_appeal((select v from ids where k = 'r1'), 'reporter_appeal',
    'This is not my report but I would like to appeal it.')$$,
  '42501', null, 'nobody can appeal an orphaned report'
);
reset role;

-- Deleting a number.
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local role authenticated;
select is(
  public.admin_delete_number('+8801711000002'),
  array['22222222-2222-2222-2222-222222222222/' || (select v from ids where k = 'r2') || '/a.png'],
  'deleting a number returns its evidence file paths'
);
reset role;

select ok(
  not exists (select 1 from public.reports where id = (select v from ids where k = 'r2'))
  and not exists (select 1 from public.phone_numbers where normalized_e164 = '+8801711000002'),
  'the number and its reports are deleted'
);

select * from finish();
rollback;
