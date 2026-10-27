-- Row Level Security for every table in the exposed schema.
-- Principle: deny by default. Privileged writes go through SECURITY DEFINER
-- functions (next migration) that check auth.uid() and roles themselves.

-- ---------------------------------------------------------------------------
-- Role helpers (non-exposed schema, pinned search_path)
-- ---------------------------------------------------------------------------
create function private.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
$$;

create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('moderator', 'admin')
  );
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('admin');
$$;

-- Ownership checks run as definer: reporters cannot read public.reports directly.
create function private.owns_report(p_report_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports
    where id = p_report_id and reporter_id = auth.uid()
  );
$$;

create function private.can_attach_evidence(p_report_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports
    where id = p_report_id and reporter_id = auth.uid()
      and status in ('pending', 'needs_info')
  );
$$;

grant usage on schema private to anon, authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_moderator() to anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.owns_report(uuid) to authenticated;
grant execute on function private.can_attach_evidence(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Start from zero table privileges, then grant only what policies need.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.report_categories enable row level security;
alter table public.reports enable row level security;
alter table public.report_evidence enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.report_status_history enable row level security;
alter table public.appeals enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: own row only.
grant select, update (display_name) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: read own roles (admins read all). No write policies at all:
-- roles change only through public.set_user_role(), which checks for admin.
grant select on public.user_roles to authenticated;
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- report_categories: anyone can read active categories; moderators read all.
grant select on public.report_categories to anon, authenticated;
create policy report_categories_select_active on public.report_categories
  for select to anon, authenticated using (is_active or (select private.is_moderator()));

-- phone_numbers: moderators only. The public reads numbers through search_number().
grant select on public.phone_numbers to authenticated;
create policy phone_numbers_select_moderator on public.phone_numbers
  for select to authenticated using ((select private.is_moderator()));

-- reports: moderators only. Reporters read their own reports through
-- my_reports(), which leaves out moderator_note. No direct writes.
grant select on public.reports to authenticated;
create policy reports_select_moderator on public.reports
  for select to authenticated using ((select private.is_moderator()));

-- report_evidence: reporter reads/inserts for own reports; moderators read all.
grant select, insert on public.report_evidence to authenticated;
create policy report_evidence_select on public.report_evidence
  for select to authenticated using (
    (select private.is_moderator()) or private.owns_report(report_id)
  );
create policy report_evidence_insert_own on public.report_evidence
  for insert to authenticated with check (
    private.can_attach_evidence(report_id)
    and storage_path like (select auth.uid())::text || '/' || report_id::text || '/%'
  );

-- moderation_actions, report_status_history, audit_logs: moderators read; writes via functions.
grant select on public.moderation_actions to authenticated;
create policy moderation_actions_select_moderator on public.moderation_actions
  for select to authenticated using ((select private.is_moderator()));

grant select on public.report_status_history to authenticated;
create policy report_status_history_select_moderator on public.report_status_history
  for select to authenticated using ((select private.is_moderator()));

grant select on public.audit_logs to authenticated;
create policy audit_logs_select_moderator on public.audit_logs
  for select to authenticated using ((select private.is_moderator()));

-- appeals: requester reads own; moderators read all. Created and resolved via functions.
grant select on public.appeals to authenticated;
create policy appeals_select on public.appeals
  for select to authenticated using (
    requester_id = (select auth.uid()) or (select private.is_moderator())
  );
