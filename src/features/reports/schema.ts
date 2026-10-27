import { z } from 'zod';
import { todayISO } from '../../lib/format';
import { normalizeBDNumber } from '../../lib/phone';

// Mirrors the checks in submit_report(), report_evidence and the evidence bucket.
export const MAX_FILES = 3;
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const phoneSchema = z.string().transform((value, ctx) => {
  const result = normalizeBDNumber(value);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: result.error });
    return z.NEVER;
  }
  return result.e164;
});

export const evidenceSchema = z
  .array(z.instanceof(File))
  .max(MAX_FILES, `You can attach up to ${MAX_FILES} images.`)
  .refine(
    (files) => files.every((f) => (ALLOWED_FILE_TYPES as readonly string[]).includes(f.type)),
    'Only JPEG, PNG or WebP images are allowed.',
  )
  .refine(
    (files) => files.every((f) => f.size <= MAX_FILE_SIZE),
    'Each image must be 5 MB or smaller.',
  );

export const descriptionSchema = z
  .string()
  .trim()
  .min(20, 'Describe what happened in at least 20 characters.')
  .max(2000, 'Keep the description under 2000 characters.');

export const reportSchema = z.object({
  phone: phoneSchema,
  categoryId: z.string().min(1, 'Choose a category.'),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of the call or message.')
    .refine((d) => d <= todayISO(), 'The date cannot be in the future.')
    .refine((d) => d >= '2000-01-01', 'Enter a date after 2000.'),
  description: descriptionSchema,
  files: evidenceSchema,
  noPersonalData: z.boolean().refine((v) => v, 'Please confirm you removed personal information.'),
});

export type ReportFormInput = z.input<typeof reportSchema>;
export type ReportFormOutput = z.output<typeof reportSchema>;

export const reasonSchema = z
  .string()
  .trim()
  .min(20, 'Explain in at least 20 characters.')
  .max(2000, 'Keep it under 2000 characters.');
