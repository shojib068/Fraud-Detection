import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { useAuth } from '../features/auth/context';
import { safeNext } from '../features/auth/safeNext';
import { emailSchema } from '../lib/credentials';
import { supabase } from '../services/supabase';

export function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Also covers returning from the verification link: supabase-js reads the
  // session from the URL, the auth listener updates, and we redirect.
  if (user) return <Navigate to={next} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    setUnverified(false);
    setResent(false);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: parsed.data,
      password,
    });
    setBusy(false);
    if (!err) return;
    if (/email not confirmed/i.test(err.message)) {
      setUnverified(true);
    } else if (/invalid login credentials/i.test(err.message)) {
      setError('Incorrect email or password.');
    } else {
      setError(err.message);
    }
  }

  async function resend() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return;
    setBusy(true);
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setResent(true);
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-slate-700">Sign in to submit reports and track their review.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        <FormField id="email" label="Email address">
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField id="password" label="Password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        {error && <Alert tone="error">{error}</Alert>}
        {unverified && (
          <Alert tone="warning" title="Verify your email first">
            <p>Click the verification link we emailed to {email.trim()}, then sign in.</p>
            {resent ? (
              <p className="mt-2 font-medium">Verification email sent again.</p>
            ) : (
              <button
                type="button"
                className="mt-2 font-medium underline"
                disabled={busy}
                onClick={resend}
              >
                Resend verification email
              </button>
            )}
          </Alert>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-sm text-slate-700">
          New here?{' '}
          <Link
            to={`/signup?next=${encodeURIComponent(next)}`}
            className="font-medium text-blue-800 underline"
          >
            Create an account
          </Link>
        </p>
        <p className="text-center text-xs text-slate-600">
          Forgot your password? Ask the site admin to reset it.
        </p>
      </form>
    </div>
  );
}
