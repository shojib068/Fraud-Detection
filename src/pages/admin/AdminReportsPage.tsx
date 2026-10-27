import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { AdminTabs } from '../../features/moderation/AdminTabs';
import { formatDate } from '../../lib/format';
import { formatBDNumber, normalizeBDNumber } from '../../lib/phone';
import { statusLabel } from '../../lib/status';
import { listQueue, type QueueFilters } from '../../services/moderation';
import { listCategories } from '../../services/search';
import { REPORT_STATUSES, type ReportStatus } from '../../types/database';

export function AdminReportsPage() {
  const [status, setStatus] = useState<QueueFilters['status']>('pending');
  const [numberInput, setNumberInput] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const parsedNumber = numberInput ? normalizeBDNumber(numberInput) : null;
  const filters: QueueFilters = {
    status,
    number: parsedNumber?.ok ? parsedNumber.e164 : undefined,
    categoryId: categoryId || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const queue = useQuery({ queryKey: ['queue', filters], queryFn: () => listQueue(filters) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Moderation</h1>
      <AdminTabs />

      <form
        className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label htmlFor="f-status" className="label">
            Status
          </label>
          <select
            id="f-status"
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReportStatus | 'all')}
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-number" className="label">
            Number
          </label>
          <input
            id="f-number"
            type="tel"
            className="input"
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
            aria-invalid={parsedNumber && !parsedNumber.ok ? true : undefined}
          />
        </div>
        <div>
          <label htmlFor="f-category" className="label">
            Category
          </label>
          <select
            id="f-category"
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="label">
            Incident from
          </label>
          <input
            id="f-from"
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="f-to" className="label">
            Incident to
          </label>
          <input
            id="f-to"
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </form>

      {queue.isLoading && <Spinner label="Loading queue…" />}
      {queue.isError && (
        <Alert tone="error" title="Could not load the queue">
          {queue.error.message}
        </Alert>
      )}
      {queue.data?.length === 0 && (
        <p className="text-slate-600">No reports match these filters.</p>
      )}

      {queue.data && queue.data.length > 0 && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {queue.data.map((r) => (
            <li key={r.id}>
              <Link
                to={`/admin/reports/${r.id}`}
                className="flex flex-col gap-1 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.phone_numbers
                      ? formatBDNumber(r.phone_numbers.normalized_e164)
                      : 'Unknown number'}{' '}
                    · {r.report_categories?.name}
                  </p>
                  <p className="truncate text-sm text-slate-600">{r.description}</p>
                  <p className="text-xs text-slate-500">
                    Incident {formatDate(r.incident_date)} · submitted {formatDate(r.created_at)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
