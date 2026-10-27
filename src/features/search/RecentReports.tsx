import { useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { LiveIndicator } from '../../components/LiveIndicator';
import { Spinner } from '../../components/Spinner';
import { useRealtimeInvalidate } from '../../lib/useRealtime';
import { listRecentReports } from '../../services/search';
import { PublicReportCard } from './PublicReportCard';

/** Live feed of the latest reviewed reports. */
export function RecentReports() {
  const query = useQuery({ queryKey: ['recent'], queryFn: () => listRecentReports() });
  const live = useRealtimeInvalidate({
    channel: 'recent-reports',
    subscriptions: [{ table: 'public_reports' }],
    queryKeys: [['recent']],
  });

  return (
    <section aria-labelledby="recent-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Recently reviewed reports
        </h2>
        <LiveIndicator status={live} />
      </div>
      {query.isLoading && <Spinner label="Loading recent reports…" />}
      {query.isError && (
        <Alert tone="error" title="Could not load recent reports">
          {query.error.message}
        </Alert>
      )}
      {query.data?.length === 0 && (
        <p className="text-sm text-slate-600">No reports have been reviewed yet.</p>
      )}
      {query.data && query.data.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {query.data.map((r) => (
            <li key={r.id}>
              <PublicReportCard report={r} number={r.phone_e164} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
