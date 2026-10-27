import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { AdminTabs } from '../../features/moderation/AdminTabs';
import { useAuth } from '../../features/auth/context';
import { formatDate } from '../../lib/format';
import { listUsers, setUserRole } from '../../services/moderation';
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
      <h1 className="text-2xl font-bold">Users and roles</h1>
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
      {query.data && (
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
  const current = topRole(user.roles);
  const mutation = useMutation({
    mutationFn: (role: AppRole) => setUserRole(user.id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
  const id = `role-${user.id}`;

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{user.email}</p>
        <p className="text-xs text-slate-600">Joined {formatDate(user.created_at)}</p>
        {mutation.isError && (
          <p role="alert" className="text-sm text-red-700">
            {mutation.error.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Role for {user.email}
        </label>
        <select
          id={id}
          className="input w-40"
          value={current}
          disabled={mutation.isPending || user.id === me?.id}
          onChange={(e) => mutation.mutate(e.target.value as AppRole)}
        >
          <option value="user">User</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
  );
}
