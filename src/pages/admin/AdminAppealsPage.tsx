import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { AdminTabs } from '../../features/moderation/AdminTabs';
import { formatDate } from '../../lib/format';
import { formatBDNumber } from '../../lib/phone';
import { APPEAL_STATUS_LABEL } from '../../lib/status';
import { listAppeals, resolveAppeal, type AppealWithReport } from '../../services/moderation';
import type { AppealStatus } from '../../types/database';

export function AdminAppealsPage() {
  const [status, setStatus] = useState<AppealStatus | 'all'>('open');
  const query = useQuery({ queryKey: ['appeals', status], queryFn: () => listAppeals(status) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Moderation</h1>
      <AdminTabs />
      <div className="max-w-xs">
        <label htmlFor="appeal-status" className="label">
          Status
        </label>
        <select
          id="appeal-status"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as AppealStatus | 'all')}
        >
          <option value="open">Open</option>
          <option value="accepted">Accepted</option>
          <option value="denied">Denied</option>
          <option value="all">All</option>
        </select>
      </div>
      {query.isLoading && <Spinner label="Loading appeals…" />}
      {query.isError && (
        <Alert tone="error" title="Could not load appeals">
          {query.error.message}
        </Alert>
      )}
      {query.data?.length === 0 && (
        <p className="text-slate-600">No appeals or correction requests.</p>
      )}
      <ul className="space-y-4">
        {query.data?.map((a) => (
          <li key={a.id}>
            <AppealCard appeal={a} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppealCard({ appeal: a }: { appeal: AppealWithReport }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (decision: 'accepted' | 'denied') => resolveAppeal(a.id, decision, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appeals'] }),
  });

  function decide(decision: 'accepted' | 'denied') {
    return (event: FormEvent) => {
      event.preventDefault();
      if (!reason.trim()) {
        setError('A reason is required.');
        return;
      }
      setError(null);
      mutation.mutate(decision);
    };
  }

  const number = a.reports?.phone_numbers?.normalized_e164;
  return (
    <article className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            {a.kind === 'reporter_appeal' ? 'Reporter appeal' : 'Correction / removal request'}
            {number && ` · ${formatBDNumber(number)}`}
          </h2>
          <p className="text-xs text-slate-600">
            {formatDate(a.created_at)} · {APPEAL_STATUS_LABEL[a.status]}
          </p>
        </div>
        {a.reports && <StatusBadge status={a.reports.status} />}
      </div>
      <p className="whitespace-pre-wrap text-sm text-slate-800">{a.reason}</p>
      <Link to={`/admin/reports/${a.report_id}`} className="text-sm text-blue-800 underline">
        Open report
      </Link>
      {a.kind === 'correction_request' && a.status === 'open' && (
        <p className="text-xs text-slate-600">
          To act on a correction, open the report and update the summary or remove it, then resolve
          this request.
        </p>
      )}
      {a.resolution_note && (
        <p className="text-sm">
          <strong>Resolution:</strong> {a.resolution_note}
        </p>
      )}

      {a.status === 'open' && (
        <form className="space-y-3" onSubmit={decide('accepted')} noValidate>
          <label htmlFor={`resolve-${a.id}`} className="label">
            Resolution reason (shared with the requester)
          </label>
          <textarea
            id={`resolve-${a.id}`}
            rows={2}
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <Alert tone="error">{error}</Alert>}
          {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              Accept{a.kind === 'reporter_appeal' ? ' (send back to queue)' : ''}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={mutation.isPending}
              onClick={decide('denied')}
            >
              Deny
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
