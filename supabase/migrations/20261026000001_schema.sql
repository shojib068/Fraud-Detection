-- ShieldNum core schema: tables, constraints, indexes and bookkeeping triggers.
-- Access control lives in the next migration (rls); trusted writes live in functions.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.report_status as enum (
  'pending', 'needs_info', 'approved', 'rejected', 'appealed', 'removed'
);
create type public.app_role as enum ('user', 'moderator', 'admin');
create type public.appeal_status as enum ('open', 'accepted', 'denied');
create type public.appeal_kind as enum ('reporter_appeal', 'correction_request');
create type public.moderation_action as enum (
  'approve', 'reject', 'request_info', 'redact', 'escalate', 'remove', 'restore'
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Numbers and categories
-- ---------------------------------------------------------------------------
create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  normalized_e164 text not null unique
    check (normalized_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  country_code text not null default 'BD' check (country_code = 'BD'),
  created_at timestamptz not null default now()
);

create table public.report_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true
);

insert into public.report_categories (name, description) values
  ('Mobile Banking & bKash / Nagad OTP Scam', 'Requests for OTPs, PINs or transfers through mobile financial services.'),
  ('Banking & Phishing Scam', 'Impersonating a bank or service to obtain account or card details.'),
  ('Lottery & Fake Prize (IMO/WhatsApp)', 'Claims of a prize or lottery win that require a fee or personal data.'),
  ('Online Shopping & Marketplace Scam', 'Fake sellers or buyers, non-delivery or advance payment for goods.'),
  ('Job Offer & Advance Fee Fraud', 'Job or visa offers that ask for an upfront fee.'),
  ('Investment & Crypto Fraud', 'Promises of unrealistic returns on investments or crypto.'),
  ('Threats & Extortion', 'Threats, blackmail or demands for money.');

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  phone_number_id uuid not null references public.phone_numbers (id) on delete restrict,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.report_categories (id) on delete restrict,
  incident_date date not null check (incident_date <= current_date and incident_date >= date '2000-01-01'),
  description text not null check (char_length(description) between 20 and 2000),
  status public.report_status not null default 'pending',
  -- Moderator-written, redacted text. The only description ever shown publicly.
  public_summary text check (public_summary is null or char_length(public_summary) between 10 and 1000),
  -- Private note from moderators; shown to the reporter only for needs_info.
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint approved_needs_summary check (status <> 'approved' or public_summary is not null)
);

create index reports_phone_status_idx on public.reports (phone_number_id, status);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create index reports_status_created_idx on public.reports (status, created_at);

create table public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 5 * 1024 * 1024),
  uploaded_at timestamptz not null default now()
);

create index report_evidence_report_idx on public.report_evidence (report_id);

-- ---------------------------------------------------------------------------
-- Moderation, history, appeals and audit
-- ---------------------------------------------------------------------------
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  moderator_id uuid references auth.users (id) on delete set null,
  action public.moderation_action not null,
  reason text check (reason is null or char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create index moderation_actions_report_idx on public.moderation_actions (report_id, created_at);

create table public.report_status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  old_status public.report_status,
  new_status public.report_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index report_status_history_report_idx on public.report_status_history (report_id, created_at);

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  kind public.appeal_kind not null,
  reason text not null check (char_length(reason) between 20 and 2000),
  status public.appeal_status not null default 'open',
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index appeals_status_idx on public.appeals (status, created_at);
create index appeals_requester_idx on public.appeals (requester_id);

-- Event metadata only: never passwords, tokens or report content.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();

create function private.record_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.report_status_history (report_id, old_status, new_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.report_status_history (report_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger reports_record_status
  after insert or update of status on public.reports
  for each row execute function private.record_status_change();

create function private.limit_evidence_per_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.report_evidence where report_id = new.report_id) >= 3 then
    raise exception 'A report can have at most 3 evidence files' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger report_evidence_limit
  before insert on public.report_evidence
  for each row execute function private.limit_evidence_per_report();

-- New auth users get a profile and the base 'user' role.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
