import type { Category, PublicReportDetail, SearchResult } from '../types/database';
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
