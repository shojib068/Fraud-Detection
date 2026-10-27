import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { moderateReport } from '../../services/moderation';
import type { ModerationAction, QueueReport } from '../../types/database';
import { ACTION_VERB, allowedActions, requiresReason, requiresSummary } from './actions';

export function ModerationPanel({ report }: { report: QueueReport }) {
  const queryClient = useQueryClient();
  const actions = allowedActions(report.status);
  const [selected, setSelected] = useState<ModerationAction>(actions[0] ?? 'escalate');
  // After a decision the status changes, so fall back to a valid action.
  const action = actions.includes(selected) ? selected : (actions[0] ?? 'escalate');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState(report.public_summary ?? report.description);
  const [note, setNote] = useState(report.moderator_note ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: moderateReport,
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['review', report.id] });
      void queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (requiresReason(action) && !reason.trim()) {
      setError('A reason is required for this action.');
      return;
    }
    if (requiresSummary(action) && summary.trim().length < 10) {
      setError('Write a redacted public summary of at least 10 characters.');
      return;
    }
    if (requiresSummary(action) && summary.trim().length > 1000) {
      setError('Keep the public summary under 1000 characters.');
      return;
    }
    setError(null);
    mutation.mutate({
      reportId: report.id,
      action,
      reason,
      publicSummary: requiresSummary(action) ? summary : undefined,
      note,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="card space-y-4"
      aria-labelledby="decision-heading"
    >
      <h2 id="decision-heading" className="text-lg font-semibold">
        Decision
      </h2>
      <fieldset>
        <legend className="label">Action</legend>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <label
              key={a}
              className={`relative cursor-pointer rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600 ${
                action === a ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="action"
                value={a}
                checked={action === a}
                onChange={() => setSelected(a)}
                className="sr-only"
              />
              {ACTION_VERB[a]}
            </label>
          ))}
        </div>
      </fieldset>

      {requiresSummary(action) && (
        <FormField
          id="public-summary"
          label="Public summary (redacted)"
          hint="This is the only text the public sees. Remove names, IDs, account numbers and anything identifying."
        >
          <textarea
            id="public-summary"
            rows={4}
            className="input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            aria-describedby="public-summary-hint"
          />
        </FormField>
      )}

      <FormField
        id="reason"
        label={requiresReason(action) ? 'Reason (required)' : 'Reason (optional)'}
        hint={
          action === 'request_info'
            ? 'Shown to the reporter as your question.'
            : 'Recorded in the audit trail. Shown to the reporter for rejections and removals.'
        }
      >
        <textarea
          id="reason"
          rows={2}
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby="reason-hint"
        />
      </FormField>

      <FormField id="note" label="Private moderator note" hint="Visible to moderators only.">
        <textarea
          id="note"
          rows={2}
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby="note-hint"
        />
      </FormField>

      {error && <Alert tone="error">{error}</Alert>}
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
      {mutation.isSuccess && <Alert tone="success">Saved. Status is now “{mutation.data}”.</Alert>}

      <button
        type="submit"
        className={action === 'remove' || action === 'reject' ? 'btn-danger' : 'btn-primary'}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Saving…' : 'Save decision'}
      </button>
    </form>
  );
}
