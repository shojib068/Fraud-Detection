import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '../../components/Spinner';
import { useAuth } from './context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking sign-in…" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/** UX-only guard; RLS and SQL functions are the real enforcement. */
export function RequireRole({
  role,
  children,
}: {
  role: 'moderator' | 'admin';
  children: ReactNode;
}) {
  const { isModerator, isAdmin } = useAuth();
  const allowed = role === 'admin' ? isAdmin : isModerator;
  return (
    <RequireAuth>
      {allowed ? (
        children
      ) : (
        <div className="mx-auto max-w-xl py-16 text-center">
          <h1 className="text-xl font-semibold">Not authorized</h1>
          <p className="mt-2 text-slate-600">This page is only available to {role}s.</p>
        </div>
      )}
    </RequireAuth>
  );
}
