-- Trusted operations. Every function is SECURITY DEFINER with a pinned
-- search_path, checks the caller itself, and is granted to the narrowest role.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create function private.require_auth() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function private.require_moderator() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
begin
  if not private.is_moderator() then
    raise exception 'Moderator role required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function private.log_event(p_event text, p_target_type text, p_target_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, event_type, target_type, target_id)
  values (auth.uid(), p_event, p_target_type, p_target_id);
$$;

create function private.report_reference(p_id uuid) returns text
language sql immutable set search_path = '' as $$
  select 'SN-' || upper(left(replace(p_id::text, '-', ''), 8));
$$;

create function private.is_valid_bd_e164(p_e164 text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_e164 ~ '^\+8801[3-9][0-9]{8}$', false);
$$;

-- ---------------------------------------------------------------------------
-- Public read API (anon + authenticated)
-- ---------------------------------------------------------------------------

-- Approved, redacted summaries for one number. Never returns reporter
-- identity, private notes, evidence, or counts of unreviewed reports.
create function public.search_number(p_e164 text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if not private.is_valid_bd_e164(p_e164) then
    raise exception 'Invalid Bangladesh mobile number' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'number', p_e164,
    'approved_count', count(r.id),
    'categories', coalesce(jsonb_agg(distinct c.name) filter (where r.id is not null), '[]'::jsonb),
    'first_reported', min(r.incident_date),
    'last_reported', max(r.incident_date),
    'reports', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'category', c.name,
          'incident_date', r.incident_date,
          'public_summary', r.public_summary,
          'reviewed_at', r.reviewed_at
        ) order by r.incident_date desc, r.reviewed_at desc
      ) filter (where r.id is not null),
      '[]'::jsonb
    )
  )
  into v_result
  from public.phone_numbers p
  join public.reports r on r.phone_number_id = p.id and r.status = 'approved'
  join public.report_categories c on c.id = r.category_id
  where p.normalized_e164 = p_e164;

  return v_result;
end;
$$;

create function public.get_public_report(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'number', p.normalized_e164,
    'category', c.name,
    'incident_date', r.incident_date,
    'public_summary', r.public_summary,
    'reviewed_at', r.reviewed_at
  )
  from public.reports r
  join public.phone_numbers p on p.id = r.phone_number_id
  join public.report_categories c on c.id = r.category_id
  where r.id = p_id and r.status = 'approved';
$$;

-- ---------------------------------------------------------------------------
-- Reporter API (authenticated)
-- ---------------------------------------------------------------------------
create function public.submit_report(
  p_phone text,
  p_category_id uuid,
  p_incident_date date,
  p_description text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
  v_phone_id uuid;
  v_report_id uuid;
  v_description text := btrim(coalesce(p_description, ''));
begin
  if not private.is_valid_bd_e164(p_phone) then
    raise exception 'Invalid Bangladesh mobile number' using errcode = '22023';
  end if;
  if not exists (select 1 from public.report_categories where id = p_category_id and is_active) then
    raise exception 'Unknown category' using errcode = '22023';
  end if;
  if p_incident_date is null or p_incident_date > current_date or p_incident_date < date '2000-01-01' then
    raise exception 'Incident date must be in the past' using errcode = '22023';
  end if;
  if char_length(v_description) not between 20 and 2000 then
    raise exception 'Description must be 20 to 2000 characters' using errcode = '22023';
  end if;

  -- Throttle: at most 5 reports per user per 24 hours.
  if (select count(*) from public.reports
      where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Report limit reached. Please try again tomorrow.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.phone_numbers (normalized_e164) values (p_phone)
  on conflict (normalized_e164) do nothing;
  select id into v_phone_id from public.phone_numbers where normalized_e164 = p_phone;

  -- Duplicate: same user and number within 30 days.
  if exists (select 1 from public.reports
             where reporter_id = v_uid and phone_number_id = v_phone_id
               and created_at > now() - interval '30 days') then
    raise exception 'You already reported this number in the last 30 days.' using errcode = 'P0001', hint = 'duplicate';
  end if;

  insert into public.reports (phone_number_id, reporter_id, category_id, incident_date, description)
  values (v_phone_id, v_uid, p_category_id, p_incident_date, v_description)
  returning id into v_report_id;

  perform private.log_event('report.submitted', 'report', v_report_id);

  return jsonb_build_object('id', v_report_id, 'reference', private.report_reference(v_report_id));
end;
$$;

-- The caller's own reports, with status history, the latest information
-- request and appeals. Leaves out moderator_note and moderator identities.
create function public.my_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'reference', private.report_reference(r.id),
        'number', p.normalized_e164,
        'category', c.name,
        'incident_date', r.incident_date,
        'description', r.description,
        'status', r.status,
        'public_summary', case when r.status = 'approved' then r.public_summary end,
        'created_at', r.created_at,
        'reviewed_at', r.reviewed_at,
        'evidence_count', (select count(*) from public.report_evidence e where e.report_id = r.id),
        'info_request', case when r.status = 'needs_info' then (
          select a.reason from public.moderation_actions a
          where a.report_id = r.id and a.action = 'request_info'
          order by a.created_at desc limit 1
        ) end,
        'decision_reason', case when r.status in ('rejected', 'removed') then (
          select a.reason from public.moderation_actions a
          where a.report_id = r.id and a.action in ('reject', 'remove')
          order by a.created_at desc limit 1
        ) end,
        'history', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'old_status', h.old_status, 'new_status', h.new_status, 'created_at', h.created_at
          ) order by h.created_at), '[]'::jsonb)
          from public.report_status_history h where h.report_id = r.id
        ),
        'appeals', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', ap.id, 'kind', ap.kind, 'status', ap.status,
            'resolution_note', ap.resolution_note, 'created_at', ap.created_at
          ) order by ap.created_at), '[]'::jsonb)
          from public.appeals ap where ap.report_id = r.id and ap.requester_id = v_uid
        )
      ) order by r.created_at desc
    )
    from public.reports r
    join public.phone_numbers p on p.id = r.phone_number_id
    join public.report_categories c on c.id = r.category_id
    where r.reporter_id = v_uid
  ), '[]'::jsonb);
end;
$$;

-- Reporter answers an information request: updates the description and
-- returns the report to the review queue.
create function public.respond_to_info_request(p_report_id uuid, p_description text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
  v_description text := btrim(coalesce(p_description, ''));
begin
  if char_length(v_description) not between 20 and 2000 then
    raise exception 'Description must be 20 to 2000 characters' using errcode = '22023';
  end if;

  update public.reports
  set description = v_description, status = 'pending'
  where id = p_report_id and reporter_id = v_uid and status = 'needs_info';

  if not found then
    raise exception 'Report not found or not awaiting information' using errcode = 'P0002';
  end if;

  perform private.log_event('report.info_provided', 'report', p_report_id);
end;
$$;

create function public.submit_appeal(p_report_id uuid, p_kind public.appeal_kind, p_reason text) returns uuid
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
    if v_report.reporter_id <> v_uid or v_report.status not in ('rejected', 'removed') then
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
-- Moderator API
-- ---------------------------------------------------------------------------

-- Allowed transitions:
--   approve       pending | needs_info | appealed | rejected -> approved (summary required)
--   reject        pending | needs_info | appealed            -> rejected (reason required)
--   request_info  pending | appealed                         -> needs_info (reason required)
--   redact        approved                                   -> approved (new summary required)
--   remove        approved                                   -> removed  (reason required)
--   restore       removed                                    -> approved
--   escalate      any                                        -> unchanged (reason required)
create function public.moderate_report(
  p_report_id uuid,
  p_action public.moderation_action,
  p_reason text default null,
  p_public_summary text default null,
  p_note text default null
) returns public.report_status
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_moderator();
  v_report public.reports%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_summary text := nullif(btrim(coalesce(p_public_summary, '')), '');
  v_new public.report_status;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  if p_action in ('reject', 'request_info', 'remove', 'escalate') and v_reason is null then
    raise exception 'A reason is required for this action' using errcode = '22023';
  end if;

  case p_action
    when 'approve' then
      if v_report.status not in ('pending', 'needs_info', 'appealed', 'rejected') then
        raise exception 'Cannot approve a report in status %', v_report.status using errcode = '22023';
      end if;
      if v_summary is null then
        raise exception 'A redacted public summary is required to approve' using errcode = '22023';
      end if;
      v_new := 'approved';
    when 'reject' then
      if v_report.status not in ('pending', 'needs_info', 'appealed') then
        raise exception 'Cannot reject a report in status %', v_report.status using errcode = '22023';
      end if;
      v_new := 'rejected';
    when 'request_info' then
      if v_report.status not in ('pending', 'appealed') then
        raise exception 'Cannot request info for a report in status %', v_report.status using errcode = '22023';
      end if;
      v_new := 'needs_info';
    when 'redact' then
      if v_report.status <> 'approved' then
        raise exception 'Only published reports can be redacted' using errcode = '22023';
      end if;
      if v_summary is null then
        raise exception 'A redacted public summary is required' using errcode = '22023';
      end if;
      v_new := 'approved';
    when 'remove' then
      if v_report.status <> 'approved' then
        raise exception 'Only published reports can be removed' using errcode = '22023';
      end if;
      v_new := 'removed';
    when 'restore' then
      if v_report.status <> 'removed' then
        raise exception 'Only removed reports can be restored' using errcode = '22023';
      end if;
      v_new := 'approved';
    when 'escalate' then
      v_new := v_report.status;
  end case;

  update public.reports set
    status = v_new,
    public_summary = coalesce(v_summary, public_summary),
    moderator_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), moderator_note),
    reviewed_at = case when p_action = 'escalate' then reviewed_at else now() end
  where id = p_report_id;

  insert into public.moderation_actions (report_id, moderator_id, action, reason)
  values (p_report_id, v_uid, p_action, v_reason);

  perform private.log_event('report.' || p_action::text, 'report', p_report_id);
  return v_new;
end;
$$;

create function public.resolve_appeal(p_appeal_id uuid, p_decision public.appeal_status, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_moderator();
  v_appeal public.appeals%rowtype;
  v_previous public.report_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_decision not in ('accepted', 'denied') then
    raise exception 'Decision must be accepted or denied' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_appeal from public.appeals where id = p_appeal_id for update;
  if not found or v_appeal.status <> 'open' then
    raise exception 'Appeal not found or already resolved' using errcode = 'P0002';
  end if;

  update public.appeals
  set status = p_decision, resolution_note = v_reason, resolved_at = now()
  where id = p_appeal_id;

  if v_appeal.kind = 'reporter_appeal' then
    if p_decision = 'accepted' then
      -- Back to the queue for a fresh review.
      update public.reports set status = 'pending'
      where id = v_appeal.report_id and status = 'appealed';
    else
      -- Return to whatever status the report had before the appeal.
      select h.old_status into v_previous
      from public.report_status_history h
      where h.report_id = v_appeal.report_id and h.new_status = 'appealed'
      order by h.created_at desc limit 1;

      update public.reports set status = coalesce(v_previous, 'rejected')
      where id = v_appeal.report_id and status = 'appealed';
    end if;
  end if;
  -- Accepted correction requests are acted on separately with
  -- moderate_report('redact' | 'remove'), which keeps that action audited.

  perform private.log_event('appeal.' || p_decision::text, 'appeal', p_appeal_id);
end;
$$;

-- Short-lived evidence links are created by the client with
-- storage.createSignedUrl(); storage policies decide who may sign them.

-- ---------------------------------------------------------------------------
-- Admin API
-- ---------------------------------------------------------------------------
create function public.admin_list_users(p_query text default null) returns table (
  id uuid,
  email text,
  created_at timestamptz,
  roles public.app_role[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_auth();
  if not private.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text, u.created_at,
         coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}')
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  where p_query is null or u.email ilike '%' || p_query || '%'
  group by u.id, u.email, u.created_at
  order by u.created_at desc
  limit 100;
end;
$$;

-- Sets the user's elevated role: 'user' clears moderator/admin.
create function public.set_user_role(p_user uuid, p_role public.app_role) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_auth();
begin
  if not private.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_user = v_uid and p_role <> 'admin' then
    raise exception 'Admins cannot remove their own admin role' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  delete from public.user_roles where user_id = p_user and role in ('moderator', 'admin');
  insert into public.user_roles (user_id, role) values (p_user, 'user') on conflict do nothing;
  if p_role <> 'user' then
    insert into public.user_roles (user_id, role) values (p_user, p_role);
  end if;

  perform private.log_event('role.set_' || p_role::text, 'user', p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_moderator() to anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.owns_report(uuid) to authenticated;
grant execute on function private.can_attach_evidence(uuid) to authenticated;

grant execute on function public.search_number(text) to anon, authenticated;
grant execute on function public.get_public_report(uuid) to anon, authenticated;

grant execute on function public.submit_report(text, uuid, date, text) to authenticated;
grant execute on function public.my_reports() to authenticated;
grant execute on function public.respond_to_info_request(uuid, text) to authenticated;
grant execute on function public.submit_appeal(uuid, public.appeal_kind, text) to authenticated;
grant execute on function public.moderate_report(uuid, public.moderation_action, text, text, text) to authenticated;
grant execute on function public.resolve_appeal(uuid, public.appeal_status, text) to authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
