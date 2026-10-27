import { REPORT_STATUS_INFO } from '../lib/status';
import type { ReportStatus } from '../types/database';

const TONE_CLASSES = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-300',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
  success: 'bg-green-50 text-green-800 ring-green-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
} as const;

export function StatusBadge({ status }: { status: ReportStatus }) {
  const info = REPORT_STATUS_INFO[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[info.tone]}`}
    >
      {info.label}
    </span>
  );
}
