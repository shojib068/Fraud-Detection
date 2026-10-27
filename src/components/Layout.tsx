import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../features/auth/context';
import { isSupabaseConfigured } from '../services/supabase';

function navClass({ isActive }: { isActive: boolean }) {
  return `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
  }`;
}

export function Layout() {
  const { user, isModerator, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const links = (
    <>
      <NavLink to="/" end className={navClass} onClick={close}>
        Search
      </NavLink>
      <NavLink to="/report" className={navClass} onClick={close}>
        Report a number
      </NavLink>
      {user && (
        <NavLink to="/my-reports" className={navClass} onClick={close}>
          My reports
        </NavLink>
      )}
      {isModerator && (
        <NavLink to="/admin/reports" className={navClass} onClick={close}>
          Moderation
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/admin/users" className={navClass} onClick={close}>
          Users
        </NavLink>
      )}
      <NavLink to="/safety" className={navClass} onClick={close}>
        Safety tips
      </NavLink>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <img src="/favicon.svg" alt="" className="size-7" />
            ShieldNum
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <>
                <Link
                  to="/account"
                  className="max-w-56 truncate text-sm font-medium text-slate-700 hover:underline"
                >
                  {user.email ?? 'Account'}
                </Link>
                <button type="button" className="btn-secondary" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-primary">
                  Sign up
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
        {open && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="border-t border-slate-200 px-4 py-2 md:hidden"
          >
            {links}
            <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
              {user ? (
                <>
                  <Link to="/account" className="btn-secondary w-full" onClick={close}>
                    Account ({user.email})
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => {
                      close();
                      void signOut();
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary w-full" onClick={close}>
                    Sign in
                  </Link>
                  <Link to="/signup" className="btn-primary w-full" onClick={close}>
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      {!isSupabaseConfigured && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>.
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Community reports are unverified claims reviewed by moderators. They are not a verdict
            about any person.
          </p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link to="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="hover:underline">
              Terms &amp; removal
            </Link>
            <Link to="/safety" className="hover:underline">
              Safety
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
