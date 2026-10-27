import { createClient, type PostgrestError } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// The anon key is public by design; every access rule is enforced by RLS and
// SQL functions. Never use the service-role key in browser code.
export const supabase = createClient(
  url ?? 'http://127.0.0.1:54321',
  anonKey ?? 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/** Error with a message that is safe to show to the user. */
export class ServiceError extends Error {
  readonly code?: string;
  readonly hint?: string;
  constructor(message: string, code?: string, hint?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.hint = hint;
  }
}

// SQLSTATEs raised deliberately by our SQL functions carry user-facing messages.
const USER_FACING_CODES = new Set(['22023', 'P0001', 'P0002', '42501', '23514']);

export function toServiceError(error: PostgrestError | Error): ServiceError {
  if ('code' in error && typeof error.code === 'string') {
    if (USER_FACING_CODES.has(error.code)) {
      return new ServiceError(
        error.message,
        error.code,
        (error as PostgrestError).hint ?? undefined,
      );
    }
    return new ServiceError('Something went wrong. Please try again.', error.code);
  }
  return new ServiceError('Network error. Check your connection and try again.');
}

/** Unwraps a Supabase response, throwing a ServiceError on failure. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw toServiceError(result.error);
  return result.data as T;
}
