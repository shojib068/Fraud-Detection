-- Stand-in for the parts of hosted Supabase that the migrations rely on, so
-- `npm run db:test` can run them in PGlite (in-process Postgres, no Docker).
-- Test-only: never apply this to a real database.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
-- Supabase installs pgcrypto in the extensions schema (extensions.crypt etc.).
create extension pgcrypto with schema extensions;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants everything in public to the API roles by default; the
-- migrations revoke and re-grant narrowly, so mimic that starting point.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth: users table and auth.uid() reading the JWT claims GUC, as Supabase does.
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- storage: buckets and objects with RLS, as Supabase Storage provides.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Realtime publication (exists on hosted Supabase).
create publication supabase_realtime;

-- Minimal pgTAP: plan, ok, is, throws_ok, lives_ok, finish. Each returns a
-- TAP line; scripts/db-test.mjs collects them. Sequences survive rollback.
create sequence extensions.tap_seq;
grant usage on schema extensions to public;
grant usage, select, update on sequence extensions.tap_seq to public;

create function extensions.plan(n int) returns text language plpgsql as $$
begin
  perform setval('extensions.tap_seq', 1, false);
  return '1..' || n;
end $$;

create function extensions.ok(b boolean, d text default '') returns text language plpgsql as $$
begin
  return case when coalesce(b, false) then 'ok ' else 'not ok ' end
    || nextval('extensions.tap_seq') || ' - ' || d;
end $$;

create function extensions."is"(a anyelement, b anyelement, d text default '') returns text
language plpgsql as $$
begin
  if a is not distinct from b then
    return extensions.ok(true, d);
  end if;
  return extensions.ok(false, d || ' (got ' || coalesce(a::text, 'NULL')
    || ', want ' || coalesce(b::text, 'NULL') || ')');
end $$;

create function extensions.throws_ok(q text, code text, msg text, d text) returns text
language plpgsql as $$
begin
  execute q;
  return extensions.ok(false, d || ' (no error)');
exception when others then
  if (code is null or sqlstate = code) and (msg is null or sqlerrm = msg) then
    return extensions.ok(true, d);
  end if;
  return extensions.ok(false, d || ' (got ' || sqlstate || ': ' || sqlerrm || ')');
end $$;

create function extensions.lives_ok(q text, d text) returns text language plpgsql as $$
begin
  execute q;
  return extensions.ok(true, d);
exception when others then
  return extensions.ok(false, d || ' (got ' || sqlstate || ': ' || sqlerrm || ')');
end $$;

create function extensions.finish() returns setof text language sql as $$ select '# done' $$;
