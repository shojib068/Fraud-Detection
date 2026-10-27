-- Report lifecycle: moderation transitions, public search, audit trail,
-- appeals, rate limits and duplicate checks.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mod@test.local');
insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'moderator');

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;
insert into ids select 'cat', id from public.report_categories order by name limit 1;

-- Submissions -----------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

insert into ids select 'r1', (public.submit_report(
  '+8801711000001', (select v from ids where k = 'cat'), current_date - 1,
  'Caller asked for my bKash OTP. My NID is 1234567890.') ->> 'id')::uuid;

select throws_ok(
  $$select public.submit_report('01711000001', (select v from ids where k = 'cat'), current_date, 'twenty characters long text')$$,
  '22023', null, 'server rejects numbers that are not E.164'
);
select throws_ok(
  $$select public.submit_report('+8801711000005', (select v from ids where k = 'cat'), current_date + 1, 'twenty characters long text')$$,
  '22023', null, 'server rejects future incident dates'
);
select throws_ok(
  $$select public.submit_report('+8801711000005', (select v from ids where k = 'cat'), current_date, 'too short')$$,
  '22023', null, 'server rejects short descriptions'
);
select throws_ok(
  $$select public.submit_report('+8801711000001', (select v from ids where k = 'cat'), current_date, 'Second report for the same number.')$$,
  'P0001', 'You already reported this number in the last 30 days.', 'duplicate reports are rejected'
);

select lives_ok($$select public.submit_report('+8801711000002', (select v from ids where k = 'cat'), current_date, 'Report number two for rate limit.')$$, 'report 2 accepted');
select lives_ok($$select public.submit_report('+8801711000003', (select v from ids where k = 'cat'), current_date, 'Report number three for rate limit.')$$, 'report 3 accepted');
select lives_ok($$select public.submit_report('+8801711000004', (select v from ids where k = 'cat'), current_date, 'Report number four for rate limit.')$$, 'report 4 accepted');
select lives_ok($$select public.submit_report('+8801711000005', (select v from ids where k = 'cat'), current_date, 'Report number five for rate limit.')$$, 'report 5 accepted');
select throws_ok(
  $$select public.submit_report('+8801711000006', (select v from ids where k = 'cat'), current_date, 'Report number six for rate limit.')$$,
  'P0001', 'Report limit reached. Please try again tomorrow.', 'sixth report in 24 hours is rate limited'
);
reset role;

-- Moderation --------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select public.moderate_report((select v from ids where k = 'r1'), 'approve')$$,
  '22023', 'A redacted public summary is required to approve', 'approval requires a public summary'
);
select throws_ok(
  $$select public.moderate_report((select v from ids where k = 'r1'), 'reject')$$,
  '22023', 'A reason is required for this action', 'rejection requires a reason'
);
select is(
  public.moderate_report((select v from ids where k = 'r1'), 'approve', 'Consistent with other reports',
    'Caller asked for a bKash OTP while claiming to be an agent.')::text,
  'approved', 'moderator approves with a redacted summary'
);
reset role;

select is(
  (select count(*)::int from public.report_status_history where report_id = (select v from ids where k = 'r1')),
  2, 'submission and approval are recorded in status history'
);
select is(
  (select count(*)::int from public.moderation_actions where report_id = (select v from ids where k = 'r1') and action = 'approve'),
  1, 'approval is recorded as a moderation action'
);
select ok(
  exists (select 1 from public.audit_logs where target_id = (select v from ids where k = 'r1') and event_type = 'report.approve'),
  'approval is written to the audit log'
);

-- Public search ---------------------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select is((public.search_number('+8801711000001') ->> 'approved_count')::int, 1, 'approved report appears in search');
select ok(
  public.search_number('+8801711000001')::text not like '%1234567890%',
  'search returns the redacted summary, not the raw description'
);
select ok(
  public.search_number('+8801711000001')::text not like '%11111111-1111%',
  'search never returns the reporter id'
);
select ok(
  public.get_public_report((select v from ids where k = 'r1')) is not null,
  'approved report has a public page'
);
select throws_ok(
  $$select public.search_number('8801711000001')$$, '22023', null, 'search rejects malformed numbers'
);
reset role;

-- Remove, appeal, resolve -----------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
do $$ begin
  perform public.moderate_report((select v from ids where k = 'r1'), 'remove', 'Reporter shared personal data');
end $$;
reset role;

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.submit_appeal((select v from ids where k = 'r1'), 'reporter_appeal', 'This is not my report but I want to appeal.')$$,
  '42501', null, 'users cannot appeal another user''s report'
);
reset role;

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
insert into ids select 'a1', public.submit_appeal((select v from ids where k = 'r1'), 'reporter_appeal',
  'I removed the personal data, please review again.');
select is(
  (select r ->> 'status' from jsonb_array_elements(public.my_reports()) r where (r ->> 'id')::uuid = (select v from ids where k = 'r1')),
  'appealed', 'appealing sets the report to appealed'
);
reset role;

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$select public.resolve_appeal((select v from ids where k = 'a1'), 'denied', 'Original decision stands.')$$,
  'moderator resolves the appeal'
);
select is(
  (select status::text from public.reports where id = (select v from ids where k = 'r1')),
  'removed', 'a denied appeal restores the previous status'
);
select is(
  (select status::text from public.appeals where id = (select v from ids where k = 'a1')),
  'denied', 'appeal is marked denied'
);
reset role;

select * from finish();
rollback;
