import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert } from '../components/Alert';
import { LiveIndicator } from '../components/LiveIndicator';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/context';
import { AppealForm } from '../features/reports/AppealForm';
import { InfoResponseForm } from '../features/reports/InfoResponseForm';
import { formatDate, formatDateTime } from '../lib/format';
import { formatBDNumber } from '../lib/phone';
import { APPEAL_STATUS_LABEL, canAppeal, REPORT_STATUS_INFO, statusLabel } from '../lib/status';
import { useRealtimeInvalidate } from '../lib/useRealtime';
import { getMyReports } from '../services/reports';
import type { MyReport } from '../types/database';

export function MyReportsPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['my-reports'], queryFn: getMyReports });
  // report_updates is RLS-scoped to the reporter; the filter just narrows the stream.
  const live = useRealtimeInvalidate({
    channel: 'my-reports',
    subscriptions: [{ table: 'report_updates', filter: `reporter_id=eq.${user?.id}` }],
    queryKeys: [['my-reports']],
    enabled: Boolean(user),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">My reports</h1>
          <LiveIndicator status={live} />
        </div>
        <Link to="/report" className="btn-primary">
          New report
        </Link>
      </div>
      {query.isLoading && <Spinner label="Loading your reports…" />}
      {query.isError && (
        <Alert tone="error" title="Could not load your reports">
          {query.error.message}
        </Alert>
      )}
      {query.data?.length === 0 && (
        <p className="text-slate-600">You have not submitted any reports yet.</p>
      )}
      <ul className="space-y-4">
        {query.data?.map((r) => (
          <li key={r.id}>
            <MyReportCard report={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyReportCard({ report: r }: { report: MyReport }) {
  const hasOpenAppeal = r.appeals.some((a) => a.status === 'open');
  return (
    <article className="card space-y-3" aria-labelledby={`report-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`report-${r.id}`} className="font-semibold">
            {formatBDNumber(r.number)} · {r.category}
          </h2>
          <p className="text-xs text-slate-600">
            Ref <span className="font-mono">{r.reference}</span> · submitted{' '}
            {formatDate(r.created_at)} · incident {formatDate(r.incident_date)}
            {r.evidence_count > 0 && ` · ${r.evidence_count} evidence file(s)`}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <p className="text-sm text-slate-600">{REPORT_STATUS_INFO[r.status].description}</p>

      {r.status === 'needs_info' && (
        <div className="space-y-3 rounded-lg bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <strong>Moderator request:</strong> {r.info_request}
          </p>
          <InfoResponseForm reportId={r.id} current={r.description} />
        </div>
      )}

      {r.status === 'approved' && r.public_summary && (
        <div className="text-sm">
          <p className="font-medium">Published summary</p>
          <p className="text-slate-700">{r.public_summary}</p>
          <Link to={`/report/${r.id}`} className="text-blue-800 underline">
            View public page
          </Link>
        </div>
      )}

      {r.decision_reason && (
        <p className="text-sm">
          <strong>Moderator reason:</strong> {r.decision_reason}
        </p>
      )}

      {r.appeals.length > 0 && (
        <ul className="space-y-1 text-sm">
          {r.appeals.map((a) => (
            <li key={a.id}>
              Appeal from {formatDate(a.created_at)}:{' '}
              <strong>{APPEAL_STATUS_LABEL[a.status]}</strong>
              {a.resolution_note && ` — ${a.resolution_note}`}
            </li>
          ))}
        </ul>
      )}

      {canAppeal(r.status) && !hasOpenAppeal && (
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Appeal this decision</summary>
          <div className="mt-3">
            <AppealForm reportId={r.id} kind="reporter_appeal" />
          </div>
        </details>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-700">
          Your description and status history
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{r.description}</p>
        <ol className="mt-2 space-y-1 text-slate-600">
          {r.history.map((h, i) => (
            <li key={i}>
              {formatDateTime(h.created_at)} — {statusLabel(h.new_status)}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
