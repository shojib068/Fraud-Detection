import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { useAuth } from '../features/auth/context';
import { supabase } from '../services/supabase';

const emailSchema = z.email('Enter a valid email address.');
const codeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.');

/** Only allow same-site relative redirects. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/my-reports';
}

export function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setStep('code');
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const parsed = codeSchema.safeParse(code.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid code.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: parsed.data,
      type: 'email',
    });
    setBusy(false);
    if (err) setError(err.message);
    // On success the auth listener updates the session and <Navigate> redirects.
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-slate-700">
          Sign in with your email to submit reports and track their review. No password needed.
        </p>
      </div>
      <div className="card">
        {step === 'email' ? (
          <form onSubmit={sendCode} noValidate className="space-y-4">
            <FormField id="email" label="Email address" error={error ?? undefined}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby="email-error"
              />
            </FormField>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} noValidate className="space-y-4">
            <Alert tone="info">We sent a 6-digit code to {email}.</Alert>
            <FormField id="code" label="Sign-in code" error={error ?? undefined}>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby="code-error"
              />
            </FormField>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
