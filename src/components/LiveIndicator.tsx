import type { RealtimeStatus } from '../lib/useRealtime';

const COPY: Record<RealtimeStatus, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'bg-green-600' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-500' },
  offline: { label: 'Reconnecting…', dot: 'bg-slate-400' },
};

/** Shows whether the page is receiving realtime updates. */
export function LiveIndicator({ status }: { status: RealtimeStatus }) {
  const { label, dot } = COPY[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
      title={status === 'live' ? 'Updates appear automatically' : undefined}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${dot} ${status === 'live' ? 'animate-pulse' : ''}`}
      />
      <span role="status">{label}</span>
    </span>
  );
}
