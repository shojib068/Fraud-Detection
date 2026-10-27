import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { useAuth } from '../features/auth/context';
import { safeNext } from '../features/auth/safeNext';
import { emailSchema, passwordSchema } from '../lib/credentials';
import { supabase } from '../services/supabase';

const signUpSchema = z
  .object({ email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  });

type Errors = Partial<Record<'email' | 'password' | 'confirm', string>>;

export function SignUpPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // The verification link brings the user back here, signed in.
        emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);

    if (error) {
      setSubmitError(
        /already registered|already exists/i.test(error.message)
          ? 'An account with this email already exists. Sign in instead.'
          : error.message,
      );
      return;
    }
    // With confirmation on, Supabase hides whether an email is taken by
    // returning a user with no identities instead of an error.
    if (data.user && data.user.identities?.length === 0) {
      setSubmitError('An account with this email already exists. Sign in instead.');
      return;
    }
    // A session means email confirmation is off: the auth listener signs the user in.
    if (!data.session) setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <Alert tone="success" title="Almost done">
          We sent a verification link to <strong>{sentTo}</strong>. Click it to activate your
          account, then sign in with your email and password.
        </Alert>
        <p className="text-sm text-slate-700">
          No email after a few minutes? Check your spam folder, or{' '}
          <Link to="/login" className="font-medium text-blue-800 underline">
            go to sign in
          </Link>{' '}
          to resend it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="mt-2 text-slate-700">
          Sign up with your email and a password. Your email is never shown publicly.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        <FormField id="email" label="Email address" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            value={form.email}
            onChange={set('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby="email-error"
          />
        </FormField>
        <FormField
          id="password"
          label="Password"
          hint="At least 8 characters."
          error={errors.password}
        >
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={form.password}
            onChange={set('password')}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby="password-hint password-error"
          />
        </FormField>
        <FormField id="confirm" label="Confirm password" error={errors.confirm}>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            value={form.confirm}
            onChange={set('confirm')}
            aria-invalid={errors.confirm ? true : undefined}
            aria-describedby="confirm-error"
          />
        </FormField>
        {submitError && <Alert tone="error">{submitError}</Alert>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-slate-700">
          Already have an account?{' '}
          <Link
            to={`/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-blue-800 underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
