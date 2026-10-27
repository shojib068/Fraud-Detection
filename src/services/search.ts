import type {
  Category,
  PublicReportDetail,
  PublicReportRow,
  SearchResult,
} from '../types/database';
import { supabase, unwrap } from './supabase';

export async function searchNumber(e164: string): Promise<SearchResult> {
  return unwrap(await supabase.rpc('search_number', { p_e164: e164 }));
}

export async function getPublicReport(id: string): Promise<PublicReportDetail | null> {
  return unwrap(await supabase.rpc('get_public_report', { p_id: id }));
}

export async function listCategories(): Promise<Category[]> {
  return unwrap(
    await supabase
      .from('report_categories')
      .select('id, name, description')
      .eq('is_active', true)
      .order('name'),
  );
}

/** Most recently reviewed public reports, for the home page feed. */
export async function listRecentReports(limit = 8): Promise<PublicReportRow[]> {
  return unwrap(
    await supabase
      .from('public_reports')
      .select('id, phone_e164, category, incident_date, public_summary, reviewed_at')
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .limit(limit),
  );
}
