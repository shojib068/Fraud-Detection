import { parsePhoneNumberFromString } from 'libphonenumber-js';

const BANGLA_ZERO = 0x09e6;
// Must match the CHECK on public.phone_numbers.normalized_e164.
const BD_MOBILE_E164 = /^\+8801[3-9]\d{8}$/;

export type NormalizeResult = { ok: true; e164: string } | { ok: false; error: string };

/** Converts Bangla numerals (০-৯) to ASCII digits; other characters are unchanged. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BANGLA_ZERO));
}

/**
 * Normalizes a Bangladesh mobile number to E.164 (+8801XXXXXXXXX).
 * Accepts 01XXXXXXXXX, 8801…, +8801… and 00880…, in Bangla or English digits,
 * with spaces, hyphens, dots or brackets.
 */
export function normalizeBDNumber(input: string): NormalizeResult {
  const cleaned = toAsciiDigits(input.trim()).replace(/[\s\-().]/g, '');
  if (!cleaned) return { ok: false, error: 'Enter a phone number.' };
  if (!/^\+?\d+$/.test(cleaned)) {
    return { ok: false, error: 'Phone numbers can only contain digits.' };
  }

  let candidate = cleaned;
  if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
  else if (candidate.startsWith('880')) candidate = `+${candidate}`;

  const parsed = parsePhoneNumberFromString(candidate, 'BD');
  if (!parsed || parsed.country !== 'BD' || !parsed.isValid()) {
    return { ok: false, error: 'Enter a valid Bangladesh mobile number, e.g. 01712-345678.' };
  }

  const e164 = parsed.number;
  if (!BD_MOBILE_E164.test(e164)) {
    return {
      ok: false,
      error: 'Only Bangladesh mobile numbers (01X…) can be searched or reported.',
    };
  }
  return { ok: true, e164 };
}

/** Formats +8801712345678 as 01712-345678 for display. */
export function formatBDNumber(e164: string): string {
  if (!BD_MOBILE_E164.test(e164)) return e164;
  const national = `0${e164.slice(4)}`;
  return `${national.slice(0, 5)}-${national.slice(5)}`;
}
