import { useState, type FormEvent } from 'react';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { useAuth } from '../features/auth/context';
import { passwordSchema } from '../lib/credentials';
import { supabase } from '../services/supabase';

export function AccountPage() {
  const { user, roles } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid password.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPassword('');
    setConfirm('');
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your account</h1>
        <p className="mt-2 text-slate-700">
          Signed in as <strong>{user?.email}</strong>
          {roles.length > 0 && ` · ${roles.filter((r) => r !== 'user').join(', ') || 'user'}`}
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        <h2 className="text-lg font-semibold">Change password</h2>
        <FormField id="new-password" label="New password" hint="At least 8 characters.">
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="new-password-hint"
          />
        </FormField>
        <FormField id="confirm-password" label="Confirm new password">
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FormField>
        {error && <Alert tone="error">{error}</Alert>}
        {saved && <Alert tone="success">Password changed.</Alert>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
