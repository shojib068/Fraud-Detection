import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { respondToInfoRequest } from '../../services/reports';
import { descriptionSchema } from './schema';

export function InfoResponseForm({ reportId, current }: { reportId: string; current: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const id = `info-${reportId}`;

  const mutation = useMutation({
    mutationFn: (description: string) => respondToInfoRequest(reportId, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-reports'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = descriptionSchema.safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid description.');
      return;
    }
    setError(null);
    mutation.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <FormField
        id={id}
        label="Update your description"
        hint="Your report goes back to the review queue when you save."
        error={error ?? undefined}
      >
        <textarea
          id={id}
          rows={5}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint ${id}-error`}
        />
      </FormField>
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Send for review'}
      </button>
    </form>
  );
}
