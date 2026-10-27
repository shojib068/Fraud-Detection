import type { AppealStatus, ModerationAction, ReportStatus } from '../types/database';

interface StatusInfo {
  label: string;
  description: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export const REPORT_STATUS_INFO: Record<ReportStatus, StatusInfo> = {
  pending: {
    label: 'Pending review',
    description: 'Waiting for a moderator. It is not public.',
    tone: 'info',
  },
  needs_info: {
    label: 'More information needed',
    description: 'A moderator asked for more detail before reviewing.',
    tone: 'warning',
  },
  approved: {
    label: 'Reviewed and published',
    description: 'A redacted summary is visible in search.',
    tone: 'success',
  },
  rejected: {
    label: 'Not published',
    description: 'A moderator decided not to publish this report.',
    tone: 'neutral',
  },
  appealed: {
    label: 'Under appeal',
    description: 'Your appeal is waiting for a moderator.',
    tone: 'info',
  },
  removed: {
    label: 'Removed',
    description: 'This report was taken down after publication.',
    tone: 'danger',
  },
};

export const APPEAL_STATUS_LABEL: Record<AppealStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  denied: 'Denied',
};

export const ACTION_LABEL: Record<ModerationAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  request_info: 'Requested information',
  redact: 'Redacted summary',
  escalate: 'Escalated',
  remove: 'Removed',
  restore: 'Restored',
};

export function statusLabel(status: ReportStatus): string {
  return REPORT_STATUS_INFO[status]?.label ?? status;
}

/** Statuses from which the reporter can appeal. */
export function canAppeal(status: ReportStatus): boolean {
  return status === 'rejected' || status === 'removed';
}
