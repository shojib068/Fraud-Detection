import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { AdminTabs } from '../../features/moderation/AdminTabs';
import { ModerationPanel } from '../../features/moderation/ModerationPanel';
import { formatBytes, formatDate, formatDateTime } from '../../lib/format';
import { formatBDNumber } from '../../lib/phone';
import { ACTION_LABEL, APPEAL_STATUS_LABEL, statusLabel } from '../../lib/status';
import { getReviewDetail } from '../../services/moderation';

export function ReviewReportPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['review', id],
    queryFn: () => getReviewDetail(id),
    // Signed evidence URLs expire after 60 seconds.
    staleTime: 30_000,
  });

  if (query.isLoading) return <Spinner label="Loading report…" />;
  if (query.isError)
    return (
      <Alert tone="error" title="Could not load report">
        {query.error.message}
      </Alert>
    );
  if (!query.data) return null;

  const { report: r, evidence, history, actions, appeals, otherReports } = query.data;
  const number = r.phone_numbers?.normalized_e164;

  return (
    <div className="space-y-6">
      <AdminTabs />
      <Link to="/admin/reports" className="text-sm text-blue-800 underline">
        ← Back to queue
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card space-y-3" aria-labelledby="report-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 id="report-heading" className="text-xl font-semibold">
                {number ? formatBDNumber(number) : 'Unknown number'} · {r.report_categories?.name}
              </h1>
              <StatusBadge status={r.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-slate-600">Incident</dt>
              <dd>{formatDate(r.incident_date)}</dd>
              <dt className="text-slate-600">Submitted</dt>
              <dd>{formatDateTime(r.created_at)}</dd>
              <dt className="text-slate-600">Reporter</dt>
              <dd className="truncate font-mono text-xs" title={r.reporter_id}>
                {r.reporter_id.slice(0, 8)}
              </dd>
              <dt className="text-slate-600">Reviewed</dt>
              <dd>{formatDateTime(r.reviewed_at)}</dd>
            </dl>
            <div>
              <h2 className="text-sm font-semibold">Reporter’s description (private)</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.description}</p>
            </div>
            {r.public_summary && (
              <div>
                <h2 className="text-sm font-semibold">Current public summary</h2>
                <p className="mt-1 text-sm text-slate-800">{r.public_summary}</p>
              </div>
            )}
          </section>

          <section className="card space-y-3" aria-labelledby="evidence-heading">
            <h2 id="evidence-heading" className="text-lg font-semibold">
              Evidence (private)
            </h2>
            {evidence.length === 0 ? (
              <p className="text-sm text-slate-600">No evidence attached.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-3">
                {evidence.map((e, i) => (
                  <li key={e.id} className="space-y-1">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer noopener">
                        <img
                          src={e.url}
                          alt={`Evidence ${i + 1}`}
                          className="h-40 w-full rounded-lg border border-slate-200 object-cover"
                        />
                      </a>
                    ) : (
                      <p className="text-sm text-red-700">Could not sign link</p>
                    )}
                    <p className="text-xs text-slate-600">
                      {e.mime_type} · {formatBytes(e.file_size)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500">
              Links expire after 60 seconds. Reload to refresh.
            </p>
          </section>

          <section className="card space-y-3" aria-labelledby="history-heading">
            <h2 id="history-heading" className="text-lg font-semibold">
              Audit trail
            </h2>
            <ol className="space-y-1 text-sm">
              {history.map((h, i) => (
                <li key={`h-${i}`}>
                  {formatDateTime(h.created_at)} — status{' '}
                  {h.old_status ? `${statusLabel(h.old_status)} → ` : ''}
                  {statusLabel(h.new_status)}
                </li>
              ))}
            </ol>
            {actions.length > 0 && (
              <ol className="space-y-1 border-t border-slate-200 pt-3 text-sm">
                {actions.map((a) => (
                  <li key={a.id}>
                    {formatDateTime(a.created_at)} — <strong>{ACTION_LABEL[a.action]}</strong>
                    {a.reason && `: ${a.reason}`}
                    {a.moderator_id && (
                      <span className="text-xs text-slate-500">
                        {' '}
                        (moderator {a.moderator_id.slice(0, 8)})
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {appeals.length > 0 && (
            <section className="card space-y-3" aria-labelledby="appeals-heading">
              <h2 id="appeals-heading" className="text-lg font-semibold">
                Appeals and correction requests
              </h2>
              <ul className="space-y-2 text-sm">
                {appeals.map((a) => (
                  <li key={a.id}>
                    <strong>
                      {a.kind === 'reporter_appeal' ? 'Reporter appeal' : 'Correction request'}
                    </strong>{' '}
                    · {APPEAL_STATUS_LABEL[a.status]} · {formatDate(a.created_at)}
                    <p className="text-slate-700">{a.reason}</p>
                  </li>
                ))}
              </ul>
              <Link to="/admin/appeals" className="text-sm text-blue-800 underline">
                Resolve in the appeals tab
              </Link>
            </section>
          )}

          <section className="card space-y-3" aria-labelledby="other-heading">
            <h2 id="other-heading" className="text-lg font-semibold">
              Other reports for this number
            </h2>
            {otherReports.length === 0 ? (
              <p className="text-sm text-slate-600">None.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {otherReports.map((o) => (
                  <li key={o.id}>
                    <Link to={`/admin/reports/${o.id}`} className="text-blue-800 underline">
                      {formatDate(o.incident_date)}
                    </Link>{' '}
                    · {statusLabel(o.status)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <ModerationPanel key={r.id} report={r} />
        </div>
      </div>
    </div>
  );
}
