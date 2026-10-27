import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { AppealForm } from '../features/reports/AppealForm';
import { useAuth } from '../features/auth/context';
import { formatDate } from '../lib/format';
import { formatBDNumber } from '../lib/phone';
import { getPublicReport } from '../services/search';

export function PublicReportPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['public-report', id], queryFn: () => getPublicReport(id) });

  if (query.isLoading) return <Spinner />;
  if (query.isError) {
    return (
      <Alert tone="error" title="Could not load this report">
        {query.error.message}
      </Alert>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="text-xl font-semibold">Report not available</h1>
        <p className="mt-2 text-slate-600">
          This report does not exist, has not been reviewed, or was removed.
        </p>
      </div>
    );
  }

  const r = query.data;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to={`/search?q=${encodeURIComponent(r.number)}`}
        className="text-sm text-blue-800 underline"
      >
        ← All reviewed reports for {formatBDNumber(r.number)}
      </Link>
      <article className="card space-y-3">
        <h1 className="text-xl font-semibold">Community report: {r.category}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-600">Number</dt>
          <dd>{formatBDNumber(r.number)}</dd>
          <dt className="text-slate-600">Incident date</dt>
          <dd>{formatDate(r.incident_date)}</dd>
          <dt className="text-slate-600">Reviewed</dt>
          <dd>{formatDate(r.reviewed_at)}</dd>
        </dl>
        <p className="text-slate-800">{r.public_summary}</p>
        <p className="text-xs text-slate-600">
          This summary was written by a moderator from a community report and redacted to remove
          personal information. It is not a verdict about the owner of this number.
        </p>
      </article>

      <section className="card space-y-3" aria-labelledby="correction-heading">
        <h2 id="correction-heading" className="text-lg font-semibold">
          Is this report wrong or harmful?
        </h2>
        <p className="text-sm text-slate-700">
          If this is your number or the report contains an error or personal information, ask the
          moderators to correct or remove it.
        </p>
        {user ? (
          <AppealForm reportId={r.id} kind="correction_request" />
        ) : (
          <Link
            to={`/login?next=${encodeURIComponent(`/report/${r.id}`)}`}
            className="btn-secondary"
          >
            Sign in to request a correction
          </Link>
        )}
      </section>
    </div>
  );
}
