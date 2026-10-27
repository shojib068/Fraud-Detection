import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { formatBytes, todayISO } from '../../lib/format';
import { submitReport, uploadEvidence } from '../../services/reports';
import { listCategories } from '../../services/search';
import type { SubmitReportResult } from '../../types/database';
import { useAuth } from '../auth/context';
import {
  ALLOWED_FILE_TYPES,
  reportSchema,
  type ReportFormInput,
  type ReportFormOutput,
} from './schema';

type Outcome =
  | { kind: 'success'; result: SubmitReportResult }
  | { kind: 'partial'; result: SubmitReportResult; error: string };

export function ReportForm() {
  const { user } = useAuth();
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormInput, unknown, ReportFormOutput>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      phone: '',
      categoryId: '',
      incidentDate: todayISO(),
      description: '',
      files: [],
      noPersonalData: false,
    },
  });
  const files = useWatch({ control, name: 'files' });

  async function onSubmit(values: ReportFormOutput) {
    if (!user) return;
    setSubmitError(null);
    let result: SubmitReportResult;
    try {
      result = await submitReport({
        phone: values.phone,
        categoryId: values.categoryId,
        incidentDate: values.incidentDate,
        description: values.description,
      });
    } catch (e) {
      setSubmitError((e as Error).message);
      return;
    }
    try {
      if (values.files.length) await uploadEvidence(user.id, result.id, values.files);
      setOutcome({ kind: 'success', result });
    } catch (e) {
      setOutcome({ kind: 'partial', result, error: (e as Error).message });
    }
    reset();
  }

  if (outcome) {
    return (
      <div className="space-y-4">
        <Alert
          tone={outcome.kind === 'success' ? 'success' : 'warning'}
          title="Report submitted for review"
        >
          <p>
            Your reference is <strong className="font-mono">{outcome.result.reference}</strong>. It
            stays private until a moderator reviews it.
          </p>
          {outcome.kind === 'partial' && (
            <p className="mt-2">Some evidence could not be uploaded: {outcome.error}</p>
          )}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Link to="/my-reports" className="btn-primary">
            Track it in My reports
          </Link>
          <button type="button" className="btn-secondary" onClick={() => setOutcome(null)}>
            Submit another report
          </button>
        </div>
      </div>
    );
  }

  if (categories.isLoading) return <Spinner label="Loading categories…" />;
  if (categories.isError) {
    return (
      <Alert tone="error" title="Could not load categories">
        {categories.error.message}
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Alert tone="warning" title="Do not include personal information">
        Leave out names, addresses, national ID numbers, bank or wallet account numbers and private
        messages. Crop or blur screenshots before uploading.
      </Alert>

      <FormField
        id="phone"
        label="Phone number that contacted you"
        error={errors.phone?.message}
        hint="Bangladesh mobile numbers, English or Bangla digits."
      >
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className="input"
          placeholder="01712-345678"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby="phone-hint phone-error"
          {...register('phone')}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="categoryId" label="Category" error={errors.categoryId?.message}>
          <select
            id="categoryId"
            className="input"
            aria-invalid={errors.categoryId ? true : undefined}
            aria-describedby="categoryId-error"
            {...register('categoryId')}
          >
            <option value="">Choose a category</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="incidentDate"
          label="Date of the call or message"
          error={errors.incidentDate?.message}
        >
          <input
            id="incidentDate"
            type="date"
            max={todayISO()}
            className="input"
            aria-invalid={errors.incidentDate ? true : undefined}
            aria-describedby="incidentDate-error"
            {...register('incidentDate')}
          />
        </FormField>
      </div>

      <FormField
        id="description"
        label="What happened?"
        hint="20–2000 characters. Describe what the caller said or asked for."
        error={errors.description?.message}
      >
        <textarea
          id="description"
          rows={6}
          className="input"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby="description-hint description-error"
          {...register('description')}
        />
      </FormField>

      <FormField
        id="files"
        label="Evidence (optional)"
        hint="Up to 3 images (JPEG, PNG or WebP), 5 MB each. Only moderators can see them."
        error={errors.files?.message}
      >
        <input
          id="files"
          type="file"
          multiple
          accept={ALLOWED_FILE_TYPES.join(',')}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
          aria-invalid={errors.files ? true : undefined}
          aria-describedby="files-hint files-error"
          onChange={(e) =>
            setValue('files', Array.from(e.target.files ?? []), { shouldValidate: true })
          }
        />
      </FormField>
      {files.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-700" aria-label="Selected files">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`}>
              {f.name} · {formatBytes(f.size)}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            aria-invalid={errors.noPersonalData ? true : undefined}
            aria-describedby="noPersonalData-error"
            {...register('noPersonalData')}
          />
          <span>
            I removed personal information, and this report is accurate to the best of my knowledge.
            I agree to the{' '}
            <Link to="/terms" className="underline">
              terms
            </Link>
            .
          </span>
        </label>
        {errors.noPersonalData && (
          <p id="noPersonalData-error" role="alert" className="mt-1 text-sm text-red-700">
            {errors.noPersonalData.message}
          </p>
        )}
      </div>

      {submitError && (
        <Alert tone="error" title="Report not submitted">
          {submitError}
        </Alert>
      )}

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : 'Submit for review'}
      </button>
    </form>
  );
}
