-- Private evidence bucket. Objects live at {reporter_uid}/{report_id}/{uuid}.{ext}.
-- There is no public access; moderators and owners read through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.evidence_report_id(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare
  v_part text := split_part(p_name, '/', 2);
begin
  if v_part ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_part::uuid;
  end if;
  return null;
end;
$$;

revoke all on function private.evidence_report_id(text) from public;
grant execute on function private.evidence_report_id(text) to authenticated;

create policy evidence_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'evidence'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and private.can_attach_evidence(private.evidence_report_id(name))
  );

create policy evidence_select_owner_or_moderator on storage.objects
  for select to authenticated using (
    bucket_id = 'evidence'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or (select private.is_moderator())
    )
  );
