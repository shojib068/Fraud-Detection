import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { LiveIndicator } from '../../components/LiveIndicator';
import { Spinner } from '../../components/Spinner';
import { AdminTabs } from '../../features/moderation/AdminTabs';
import { formatDate } from '../../lib/format';
import { formatBDNumber, toAsciiDigits } from '../../lib/phone';
import { useRealtimeInvalidate } from '../../lib/useRealtime';
import { deleteNumber, listNumbers } from '../../services/moderation';
import type { AdminNumber } from '../../types/database';

export function AdminNumbersPage() {
  const [search, setSearch] = useState('');
  // Numbers are stored as +8801…; search on the digits after the leading 0.
  const digits = toAsciiDigits(search).replace(/\D/g, '').replace(/^0/, '');
  const query = useQuery({ queryKey: ['numbers', digits], queryFn: () => listNumbers(digits) });
  const live = useRealtimeInvalidate({
    channel: 'admin-numbers',
    subscriptions: [{ table: 'reports' }],
    queryKeys: [['numbers']],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Numbers</h1>
        <LiveIndicator status={live} />
      </div>
      <AdminTabs />
      <div className="max-w-sm">
        <label htmlFor="number-search" className="label">
          Search numbers
        </label>
        <input
          id="number-search"
          type="search"
          inputMode="tel"
          className="input"
          placeholder="01712…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.isLoading && <Spinner label="Loading numbers…" />}
      {query.isError && (
        <Alert tone="error" title="Could not load numbers">
          {query.error.message}
        </Alert>
      )}
      {query.data?.length === 0 && <p className="text-slate-600">No numbers found.</p>}
      {query.data && query.data.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {query.data.map((n) => (
            <li key={n.number}>
              <NumberRow item={n} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NumberRow({ item }: { item: AdminNumber }) {
  const queryClient = useQueryClient();
  const display = formatBDNumber(item.number);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const mutation = useMutation({
    mutationFn: () => deleteNumber(item.number),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['numbers'] }),
  });
  const matches = toAsciiDigits(typed).replace(/\D/g, '') === display.replace(/\D/g, '');

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/search?q=${encodeURIComponent(item.number)}`}
            className="font-mono font-medium text-blue-800 underline"
          >
            {display}
          </Link>
          <p className="text-xs text-slate-600">
            {item.total_reports} reports · {item.approved_reports} published ·{' '}
            {item.pending_reports} awaiting review · last {formatDate(item.last_reported)}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary text-red-700"
          aria-expanded={confirming}
          onClick={() => setConfirming((v) => !v)}
        >
          Delete number
        </button>
      </div>
      {confirming && (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            This permanently deletes <strong>{display}</strong> and all {item.total_reports} of its
            reports, including evidence images and appeals. It cannot be undone.
          </p>
          <div>
            <label htmlFor={`confirm-${item.number}`} className="label text-red-900">
              Type the number to confirm
            </label>
            <input
              id={`confirm-${item.number}`}
              className="input"
              inputMode="tel"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-danger"
              disabled={!matches || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
          {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
        </div>
      )}
    </div>
  );
}
