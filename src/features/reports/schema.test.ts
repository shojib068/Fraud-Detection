import { describe, expect, it } from 'vitest';
import { todayISO } from '../../lib/format';
import { MAX_FILE_SIZE, reportSchema } from './schema';

const valid = {
  phone: '০১৭১২-৩৪৫৬৭৮',
  categoryId: 'cat-1',
  incidentDate: '2026-01-15',
  description: 'Caller asked for my bKash OTP pretending to be an agent.',
  files: [] as File[],
  noPersonalData: true,
};

const file = (type: string, size = 1000) => new File([new Uint8Array(size)], 'x', { type });

function errorsFor(input: Partial<typeof valid>) {
  const result = reportSchema.safeParse({ ...valid, ...input });
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('reportSchema', () => {
  it('accepts a valid report and normalizes the phone to E.164', () => {
    const result = reportSchema.parse(valid);
    expect(result.phone).toBe('+8801712345678');
  });

  it('rejects invalid numbers', () => {
    expect(errorsFor({ phone: '12345' })[0]).toMatch(/^phone:/);
  });

  it('rejects future dates', () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(errorsFor({ incidentDate: tomorrow })).toEqual([
      'incidentDate: The date cannot be in the future.',
    ]);
    expect(errorsFor({ incidentDate: todayISO() })).toEqual([]);
  });

  it('enforces description length', () => {
    expect(errorsFor({ description: 'short' })[0]).toMatch(/^description:/);
    expect(errorsFor({ description: 'x'.repeat(2001) })[0]).toMatch(/^description:/);
  });

  it('limits evidence count, type and size', () => {
    expect(errorsFor({ files: [file('image/png'), file('image/png'), file('image/png')] })).toEqual(
      [],
    );
    expect(errorsFor({ files: Array.from({ length: 4 }, () => file('image/png')) })).toEqual([
      'files: You can attach up to 3 images.',
    ]);
    expect(errorsFor({ files: [file('application/pdf')] })).toEqual([
      'files: Only JPEG, PNG or WebP images are allowed.',
    ]);
    expect(errorsFor({ files: [file('image/jpeg', MAX_FILE_SIZE + 1)] })).toEqual([
      'files: Each image must be 5 MB or smaller.',
    ]);
  });

  it('requires the personal-data confirmation', () => {
    expect(errorsFor({ noPersonalData: false })).toEqual([
      'noPersonalData: Please confirm you removed personal information.',
    ]);
  });
});
