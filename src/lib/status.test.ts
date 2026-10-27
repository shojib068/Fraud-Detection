import { describe, expect, it } from 'vitest';
import { REPORT_STATUSES } from '../types/database';
import { canAppeal, REPORT_STATUS_INFO, statusLabel } from './status';

describe('status helpers', () => {
  it('has a label for every status', () => {
    for (const s of REPORT_STATUSES) expect(REPORT_STATUS_INFO[s].label).toBeTruthy();
  });

  it('uses neutral wording, never a verdict', () => {
    const text = Object.values(REPORT_STATUS_INFO)
      .map((s) => `${s.label} ${s.description}`)
      .join(' ')
      .toLowerCase();
    expect(text).not.toMatch(/\b(fraudulent|scammer|safe)\b/);
  });

  it('only allows appeals on rejected or removed reports', () => {
    expect(REPORT_STATUSES.filter(canAppeal)).toEqual(['rejected', 'removed']);
  });

  it('labels statuses', () => {
    expect(statusLabel('approved')).toBe('Reviewed and published');
  });
});
