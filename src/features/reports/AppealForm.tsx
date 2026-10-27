import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { submitAppeal } from '../../services/reports';
import type { AppealKind } from '../../types/database';
import { reasonSchema } from './schema';

const COPY: Record<AppealKind, { label: string; hint: string; submit: string; done: string }> = {
  reporter_appeal: {
    label: 'Why should this decision be reviewed again?',
    hint: 'Add any context the moderator may have missed. Do not include personal information.',
    submit: 'Submit appeal',
    done: 'Appeal submitted. A moderator will review it.',
  },
  correction_request: {
    label: 'What is wrong with this report?',
    hint: 'For example: this is my number and the report is mistaken, or it contains personal information.',
    submit: 'Request correction or removal',
    done: 'Request received. A moderator will review it.',
  },
};

export function AppealForm({ reportId, kind }: { reportId: string; kind: AppealKind }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const id = `appeal-${kind}-${reportId}`;

  const mutation = useMutation({
    mutationFn: (text: string) => submitAppeal(reportId, kind, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-reports'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid reason.');
      return;
    }
    setError(null);
    mutation.mutate(parsed.data);
  }

  if (mutation.isSuccess) return <Alert tone="success">{copy.done}</Alert>;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <FormField id={id} label={copy.label} hint={copy.hint} error={error ?? undefined}>
        <textarea
          id={id}
          rows={3}
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint ${id}-error`}
        />
      </FormField>
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
      <button type="submit" className="btn-secondary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Sending…' : copy.submit}
      </button>
    </form>
  );
}
