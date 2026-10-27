import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { formatDate } from '../../lib/format';
import { formatBDNumber } from '../../lib/phone';
import type { SearchResult } from '../../types/database';

export function SearchResults({ result }: { result: SearchResult }) {
  const display = formatBDNumber(result.number);

  if (result.approved_count === 0) {
    return (
      <section aria-labelledby="results-heading" className="space-y-4">
        <h2 id="results-heading" className="text-xl font-semibold">
          No reviewed reports found for {display}
        </h2>
        <Alert tone="info">
          This does not mean the number is safe. It only means no community report about it has been
          reviewed and published. Stay cautious with unexpected calls asking for money, OTPs or
          personal details.
        </Alert>
        <p className="text-sm text-slate-700">
          Received a suspicious call from this number?{' '}
          <Link to="/report" className="font-medium text-blue-800 underline">
            Report it for review
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="results-heading" className="space-y-5">
      <div>
        <h2 id="results-heading" className="text-xl font-semibold">
          {result.approved_count} reviewed community{' '}
          {result.approved_count === 1 ? 'report' : 'reports'} for {display}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Incidents reported between {formatDate(result.first_reported)} and{' '}
          {formatDate(result.last_reported)}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Reported categories">
        {result.categories.map((c) => (
          <span
            key={c}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800"
          >
            {c}
          </span>
        ))}
      </div>

      <Alert tone="warning" title="How to read these reports">
        Reports are claims from community members, checked and redacted by moderators before
        publishing. They are not proof of wrongdoing and the number may have changed hands. Never
        share OTPs, PINs or passwords with callers.
      </Alert>

      <ul className="space-y-3">
        {result.reports.map((r) => (
          <li key={r.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">{r.category}</span>
              <span className="text-xs text-slate-600">
                Incident: {formatDate(r.incident_date)}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{r.public_summary}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>Reviewed {formatDate(r.reviewed_at)}</span>
              <Link to={`/report/${r.id}`} className="font-medium text-blue-800 underline">
                Details and correction requests
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
