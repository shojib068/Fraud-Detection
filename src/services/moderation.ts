import type {
  AdminUser,
  AppRole,
  AppealRow,
  AppealStatus,
  EvidenceRow,
  ModerationAction,
  ModerationActionRow,
  QueueReport,
  ReportStatus,
  StatusChange,
} from '../types/database';
import { EVIDENCE_BUCKET } from './reports';
import { supabase, unwrap } from './supabase';

// Every call here is enforced server-side: RLS limits reads to moderators and
// the SQL functions re-check the caller's role.

const QUEUE_COLUMNS =
  'id, status, incident_date, description, public_summary, moderator_note, created_at, reviewed_at, reporter_id, phone_number_id, phone_numbers(normalized_e164), report_categories(name)';

export interface QueueFilters {
  status: ReportStatus | 'all';
  number?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export async function listQueue(filters: QueueFilters): Promise<QueueReport[]> {
  let query = supabase
    .from('reports')
    .select(
      filters.number
        ? QUEUE_COLUMNS.replace('phone_numbers(', 'phone_numbers!inner(')
        : QUEUE_COLUMNS,
    )
    .order('created_at', { ascending: true })
    .limit(100);
  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.number) query = query.eq('phone_numbers.normalized_e164', filters.number);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.from) query = query.gte('incident_date', filters.from);
  if (filters.to) query = query.lte('incident_date', filters.to);
  return unwrap(await query) as unknown as QueueReport[];
}

export interface ReviewDetail {
  report: QueueReport;
  evidence: (EvidenceRow & { url: string | null })[];
  history: StatusChange[];
  actions: ModerationActionRow[];
  appeals: AppealRow[];
  otherReports: Pick<QueueReport, 'id' | 'status' | 'incident_date' | 'created_at'>[];
}

export async function getReviewDetail(id: string): Promise<ReviewDetail> {
  const report = unwrap(
    await supabase.from('reports').select(QUEUE_COLUMNS).eq('id', id).single(),
  ) as unknown as QueueReport;

  const [evidence, history, actions, appeals, otherReports] = await Promise.all([
    supabase
      .from('report_evidence')
      .select('id, storage_path, mime_type, file_size, uploaded_at')
      .eq('report_id', id)
      .order('uploaded_at'),
    supabase
      .from('report_status_history')
      .select('old_status, new_status, created_at')
      .eq('report_id', id)
      .order('created_at'),
    supabase
      .from('moderation_actions')
      .select('id, action, reason, moderator_id, created_at')
      .eq('report_id', id)
      .order('created_at'),
    supabase
      .from('appeals')
      .select('id, report_id, kind, reason, status, resolution_note, created_at, resolved_at')
      .eq('report_id', id)
      .order('created_at'),
    supabase
      .from('reports')
      .select('id, status, incident_date, created_at')
      .eq('phone_number_id', report.phone_number_id)
      .neq('id', id)
      .order('created_at', { ascending: false }),
  ]);

  const evidenceRows = unwrap(evidence) as EvidenceRow[];
  // Short-lived signed URLs; the bucket itself is private.
  const signed = evidenceRows.length
    ? await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(
        evidenceRows.map((e) => e.storage_path),
        60,
      )
    : { data: [], error: null };

  return {
    report,
    evidence: evidenceRows.map((e, i) => ({ ...e, url: signed.data?.[i]?.signedUrl ?? null })),
    history: unwrap(history) as StatusChange[],
    actions: unwrap(actions) as ModerationActionRow[],
    appeals: unwrap(appeals) as AppealRow[],
    otherReports: unwrap(otherReports) as ReviewDetail['otherReports'],
  };
}

export interface ModerateInput {
  reportId: string;
  action: ModerationAction;
  reason?: string;
  publicSummary?: string;
  note?: string;
}

export async function moderateReport(input: ModerateInput): Promise<ReportStatus> {
  return unwrap(
    await supabase.rpc('moderate_report', {
      p_report_id: input.reportId,
      p_action: input.action,
      p_reason: input.reason || null,
      p_public_summary: input.publicSummary || null,
      p_note: input.note || null,
    }),
  );
}

export interface AppealWithReport extends AppealRow {
  reports: { status: ReportStatus; phone_numbers: { normalized_e164: string } | null } | null;
}

export async function listAppeals(status: AppealStatus | 'all'): Promise<AppealWithReport[]> {
  let query = supabase
    .from('appeals')
    .select(
      'id, report_id, kind, reason, status, resolution_note, created_at, resolved_at, reports(status, phone_numbers(normalized_e164))',
    )
    .order('created_at', { ascending: true })
    .limit(100);
  if (status !== 'all') query = query.eq('status', status);
  return unwrap(await query) as unknown as AppealWithReport[];
}

export async function resolveAppeal(
  appealId: string,
  decision: Exclude<AppealStatus, 'open'>,
  reason: string,
): Promise<void> {
  unwrap(
    await supabase.rpc('resolve_appeal', {
      p_appeal_id: appealId,
      p_decision: decision,
      p_reason: reason,
    }),
  );
}

export async function listUsers(query?: string): Promise<AdminUser[]> {
  return unwrap(await supabase.rpc('admin_list_users', { p_query: query || null }));
}

export async function setUserRole(userId: string, role: AppRole): Promise<void> {
  unwrap(await supabase.rpc('set_user_role', { p_user: userId, p_role: role }));
}
