import { describe, expect, it } from 'vitest';
import { REPORT_STATUSES } from '../../types/database';
import { allowedActions, requiresReason, requiresSummary } from './actions';

describe('moderation actions', () => {
  it('defines actions for every status', () => {
    for (const s of REPORT_STATUSES) expect(allowedActions(s).length).toBeGreaterThan(0);
  });

  it('only allows publishing from reviewable states', () => {
    const canApprove = REPORT_STATUSES.filter((s) => allowedActions(s).includes('approve'));
    expect(canApprove).toEqual(['pending', 'needs_info', 'rejected', 'appealed']);
  });

  it('requires a summary to publish and a reason to reject', () => {
    expect(requiresSummary('approve')).toBe(true);
    expect(requiresSummary('reject')).toBe(false);
    expect(requiresReason('reject')).toBe(true);
    expect(requiresReason('approve')).toBe(false);
  });
});
