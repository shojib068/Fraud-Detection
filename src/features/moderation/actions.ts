import type { ModerationAction, ReportStatus } from '../../types/database';

// Mirrors the transition table in moderate_report(); the server re-checks it.
const ALLOWED: Record<ReportStatus, ModerationAction[]> = {
  pending: ['approve', 'reject', 'request_info', 'escalate'],
  needs_info: ['approve', 'reject', 'escalate'],
  appealed: ['approve', 'reject', 'request_info', 'escalate'],
  rejected: ['approve', 'escalate'],
  approved: ['redact', 'remove', 'escalate'],
  removed: ['restore', 'escalate'],
};

export function allowedActions(status: ReportStatus): ModerationAction[] {
  return ALLOWED[status];
}

export function requiresReason(action: ModerationAction): boolean {
  return (
    action === 'reject' || action === 'request_info' || action === 'remove' || action === 'escalate'
  );
}

export function requiresSummary(action: ModerationAction): boolean {
  return action === 'approve' || action === 'redact';
}

export const ACTION_VERB: Record<ModerationAction, string> = {
  approve: 'Approve and publish',
  reject: 'Reject',
  request_info: 'Request info',
  redact: 'Update summary',
  escalate: 'Escalate',
  remove: 'Remove',
  restore: 'Restore',
};
