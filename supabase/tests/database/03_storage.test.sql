-- Evidence bucket: private, owner-scoped uploads, moderator reads.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mod@test.local');
insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'moderator');

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;

select is(
  (select public from storage.buckets where id = 'evidence'), false, 'evidence bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'evidence')::bigint, 5242880::bigint,
  'evidence bucket limits files to 5 MB'
);

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
insert into ids select 'r1', (public.submit_report(
  '+8801711000001', (select id from public.report_categories order by name limit 1),
  current_date, 'Caller asked for my bKash OTP pretending to be an agent.') ->> 'id')::uuid;

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('evidence', '11111111-1111-1111-1111-111111111111/' || (select v from ids where k = 'r1') || '/a.png',
            '11111111-1111-1111-1111-111111111111')$$,
  'owner can upload into their own report folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('evidence', '22222222-2222-2222-2222-222222222222/' || (select v from ids where k = 'r1') || '/b.png',
            '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'users cannot upload into another user''s folder'
);
reset role;

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'evidence'), 0,
  'other users cannot read evidence objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('evidence', '22222222-2222-2222-2222-222222222222/' || (select v from ids where k = 'r1') || '/c.png',
            '22222222-2222-2222-2222-222222222222')$$,
  '42501', null, 'users cannot upload against a report they do not own'
);
reset role;

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'evidence'), 1,
  'moderators can read evidence objects'
);
reset role;

select * from finish();
rollback;
