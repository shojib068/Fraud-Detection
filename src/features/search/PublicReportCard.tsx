import { Link } from 'react-router';
import { formatDate } from '../../lib/format';
import { formatBDNumber } from '../../lib/phone';
import type { PublicReport } from '../../types/database';

interface Props {
  report: PublicReport;
  /** Shown as a search link when the card appears outside a single number's results. */
  number?: string;
}

export function PublicReportCard({ report: r, number }: Props) {
  return (
    <article className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{r.category}</span>
        <span className="text-xs text-slate-600">Incident: {formatDate(r.incident_date)}</span>
      </div>
      {number && (
        <Link
          to={`/search?q=${encodeURIComponent(number)}`}
          className="mt-1 inline-block font-mono text-sm text-blue-800 underline"
        >
          {formatBDNumber(number)}
        </Link>
      )}
      <p className="mt-2 text-sm text-slate-700">{r.public_summary}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>Reviewed {formatDate(r.reviewed_at)}</span>
        <Link to={`/report/${r.id}`} className="font-medium text-blue-800 underline">
          Details and correction requests
        </Link>
      </div>
    </article>
  );
}
