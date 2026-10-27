import type { AppealKind, MyReport, SubmitReportResult } from '../types/database';
import { ServiceError, supabase, toServiceError, unwrap } from './supabase';

export const EVIDENCE_BUCKET = 'evidence';

export interface NewReport {
  phone: string;
  categoryId: string;
  incidentDate: string;
  description: string;
}

export async function submitReport(report: NewReport): Promise<SubmitReportResult> {
  return unwrap(
    await supabase.rpc('submit_report', {
      p_phone: report.phone,
      p_category_id: report.categoryId,
      p_incident_date: report.incidentDate,
      p_description: report.description,
    }),
  );
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Uploads evidence to the private bucket at {uid}/{reportId}/{uuid}.{ext} and
 * records it. Storage and table policies both re-check ownership and limits.
 */
export async function uploadEvidence(
  userId: string,
  reportId: string,
  files: File[],
): Promise<void> {
  for (const file of files) {
    const ext = EXTENSIONS[file.type];
    if (!ext) throw new ServiceError(`${file.name}: unsupported file type.`);
    const path = `${userId}/${reportId}/${crypto.randomUUID()}.${ext}`;

    const upload = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error)
      throw new ServiceError(`${file.name}: upload failed. ${upload.error.message}`);

    const { error } = await supabase.from('report_evidence').insert({
      report_id: reportId,
      storage_path: path,
      mime_type: file.type,
      file_size: file.size,
    });
    if (error) throw toServiceError(error);
  }
}

export async function getMyReports(): Promise<MyReport[]> {
  return unwrap(await supabase.rpc('my_reports'));
}

export async function respondToInfoRequest(reportId: string, description: string): Promise<void> {
  unwrap(
    await supabase.rpc('respond_to_info_request', {
      p_report_id: reportId,
      p_description: description,
    }),
  );
}

export async function submitAppeal(
  reportId: string,
  kind: AppealKind,
  reason: string,
): Promise<string> {
  return unwrap(
    await supabase.rpc('submit_appeal', { p_report_id: reportId, p_kind: kind, p_reason: reason }),
  );
}
