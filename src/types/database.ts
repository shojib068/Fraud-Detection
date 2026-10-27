// Shapes returned by the SQL functions in supabase/migrations/*_functions.sql
// and the tables moderators read through RLS. Keep in sync with migrations.

export const REPORT_STATUSES = [
  'pending',
  'needs_info',
  'approved',
  'rejected',
  'appealed',
  'removed',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type AppRole = 'user' | 'moderator' | 'admin';
export type AppealStatus = 'open' | 'accepted' | 'denied';
export type AppealKind = 'reporter_appeal' | 'correction_request';
export type ModerationAction =
  'approve' | 'reject' | 'request_info' | 'redact' | 'escalate' | 'remove' | 'restore';

export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface PublicReport {
  id: string;
  category: string;
  incident_date: string;
  public_summary: string;
  reviewed_at: string | null;
}

export interface SearchResult {
  number: string;
  approved_count: number;
  categories: string[];
  first_reported: string | null;
  last_reported: string | null;
  reports: PublicReport[];
}

export interface PublicReportDetail extends PublicReport {
  number: string;
}

/** Row of public.public_reports: approved, redacted reports kept in sync for Realtime. */
export interface PublicReportRow extends PublicReport {
  phone_e164: string;
}

export interface StatusChange {
  old_status: ReportStatus | null;
  new_status: ReportStatus;
  created_at: string;
}

export interface MyAppeal {
  id: string;
  kind: AppealKind;
  status: AppealStatus;
  resolution_note: string | null;
  created_at: string;
}

export interface MyReport {
  id: string;
  reference: string;
  number: string;
  category: string;
  incident_date: string;
  description: string;
  status: ReportStatus;
  public_summary: string | null;
  created_at: string;
  reviewed_at: string | null;
  evidence_count: number;
  info_request: string | null;
  decision_reason: string | null;
  history: StatusChange[];
  appeals: MyAppeal[];
}

export interface SubmitReportResult {
  id: string;
  reference: string;
}

export interface QueueReport {
  id: string;
  status: ReportStatus;
  incident_date: string;
  description: string;
  public_summary: string | null;
  moderator_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  /** Null when the author's account was deleted. */
  reporter_id: string | null;
  phone_number_id: string;
  phone_numbers: { normalized_e164: string } | null;
  report_categories: { name: string } | null;
}

export interface EvidenceRow {
  id: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface ModerationActionRow {
  id: string;
  action: ModerationAction;
  reason: string | null;
  moderator_id: string | null;
  created_at: string;
}

export interface AppealRow {
  id: string;
  report_id: string;
  kind: AppealKind;
  reason: string;
  status: AppealStatus;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AdminUser {
  id: string;
  username: string | null;
  email: string;
  created_at: string;
  roles: AppRole[];
}

export interface AdminNumber {
  number: string;
  total_reports: number;
  approved_reports: number;
  pending_reports: number;
  last_reported: string | null;
}
