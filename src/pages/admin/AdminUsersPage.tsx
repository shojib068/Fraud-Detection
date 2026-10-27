import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { useAuth } from '../../features/auth/context';
import { AdminTabs } from '../../features/moderation/AdminTabs';
import { formatDate } from '../../lib/format';
import { passwordSchema } from '../../lib/credentials';
import { deleteUser, listUsers, setUserPassword, setUserRole } from '../../services/moderation';
import type { AdminUser, AppRole } from '../../types/database';

function topRole(roles: AppRole[]): AppRole {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('moderator')) return 'moderator';
  return 'user';
}

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['users', search], queryFn: () => listUsers(search) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>
      <AdminTabs />
      <div className="max-w-sm">
        <label htmlFor="user-search" className="label">
          Search by email
        </label>
        <input
          id="user-search"
          type="search"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.isLoading && <Spinner label="Loading users…" />}
      {query.isError && (
        <Alert tone="error" title="Could not load users">
          {query.error.message}
        </Alert>
      )}
      {query.data?.length === 0 && <p className="text-slate-600">No users found.</p>}
      {query.data && query.data.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {query.data.map((u) => (
            <li key={u.id}>
              <UserRow user={u} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<'none' | 'password' | 'delete'>('none');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isMe = user.id === me?.id;
  const name = user.email;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const roleMutation = useMutation({
    mutationFn: (role: AppRole) => setUserRole(user.id, role),
    onSuccess: refresh,
  });
  const passwordMutation = useMutation({
    mutationFn: (pw: string) => setUserPassword(user.id, pw),
    onSuccess: () => {
      setPanel('none');
      setPassword('');
      setNotice(`New password set for ${name}. Share it with them privately.`);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: refresh,
  });

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid password.');
      return;
    }
    setError(null);
    passwordMutation.mutate(parsed.data);
  }

  const mutationError =
    roleMutation.error?.message ?? passwordMutation.error?.message ?? deleteMutation.error?.message;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {name}
            {isMe && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
          </p>
          <p className="text-xs text-slate-600">Joined {formatDate(user.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`role-${user.id}`} className="sr-only">
            Role for {name}
          </label>
          <select
            id={`role-${user.id}`}
            className="input w-36"
            value={topRole(user.roles)}
            disabled={roleMutation.isPending || isMe}
            onChange={(e) => roleMutation.mutate(e.target.value as AppRole)}
          >
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
          </select>
          {!isMe && (
            <>
              <button
                type="button"
                className="btn-secondary"
                aria-expanded={panel === 'password'}
                onClick={() => setPanel(panel === 'password' ? 'none' : 'password')}
              >
                Reset password
              </button>
              <button
                type="button"
                className="btn-secondary text-red-700"
                aria-expanded={panel === 'delete'}
                onClick={() => setPanel(panel === 'delete' ? 'none' : 'delete')}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {panel === 'password' && (
        <form
          onSubmit={submitPassword}
          noValidate
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor={`pw-${user.id}`} className="label">
              New password for {name}
            </label>
            <input
              id={`pw-${user.id}`}
              type="text"
              autoComplete="off"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={passwordMutation.isPending}>
            Set password
          </button>
        </form>
      )}

      {panel === 'delete' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            Delete <strong>{name}</strong>? They will no longer be able to sign in. Reports they
            submitted are kept, without their name.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete user'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPanel('none')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {mutationError && <Alert tone="error">{mutationError}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
    </div>
  );
}
