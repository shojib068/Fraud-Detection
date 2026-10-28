import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Spinner } from './components/Spinner';
import { Layout } from './components/Layout';
import { RequireAuth, RequireRole } from './features/auth/guards';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SignUpPage } from './pages/SignUpPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { PublicReportPage } from './pages/PublicReportPage';
import { SafetyPage } from './pages/SafetyPage';
import { SearchPage } from './pages/SearchPage';
import { TermsPage } from './pages/TermsPage';

// Signed-in and staff pages load on demand to keep the public search bundle small.
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })),
);
const MyReportsPage = lazy(() =>
  import('./pages/MyReportsPage').then((m) => ({ default: m.MyReportsPage })),
);
const AdminReportsPage = lazy(() =>
  import('./pages/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })),
);
const ReviewReportPage = lazy(() =>
  import('./pages/admin/ReviewReportPage').then((m) => ({ default: m.ReviewReportPage })),
);
const AdminAppealsPage = lazy(() =>
  import('./pages/admin/AdminAppealsPage').then((m) => ({ default: m.AdminAppealsPage })),
);
const AdminNumbersPage = lazy(() =>
  import('./pages/admin/AdminNumbersPage').then((m) => ({ default: m.AdminNumbersPage })),
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const AdminUsersPage = lazy(() =>
  import('./pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);

const page = (node: ReactNode) => <Suspense fallback={<Spinner />}>{node}</Suspense>;

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/search', element: <SearchPage /> },
        { path: '/report/:id', element: <PublicReportPage /> },
        { path: '/safety', element: <SafetyPage /> },
        { path: '/privacy', element: <PrivacyPage /> },
        { path: '/terms', element: <TermsPage /> },
        { path: '/login', element: <LoginPage /> },
        { path: '/signup', element: <SignUpPage /> },
        { path: '/account', element: <RequireAuth>{page(<AccountPage />)}</RequireAuth> },
        { path: '/report', element: <RequireAuth>{page(<ReportPage />)}</RequireAuth> },
        { path: '/my-reports', element: <RequireAuth>{page(<MyReportsPage />)}</RequireAuth> },
        {
          path: '/admin/reports',
          element: <RequireRole role="moderator">{page(<AdminReportsPage />)}</RequireRole>,
        },
        {
          path: '/admin/reports/:id',
          element: <RequireRole role="moderator">{page(<ReviewReportPage />)}</RequireRole>,
        },
        {
          path: '/admin/appeals',
          element: <RequireRole role="moderator">{page(<AdminAppealsPage />)}</RequireRole>,
        },
        {
          path: '/admin/numbers',
          element: <RequireRole role="admin">{page(<AdminNumbersPage />)}</RequireRole>,
        },
        {
          path: '/admin/users',
          element: <RequireRole role="admin">{page(<AdminUsersPage />)}</RequireRole>,
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

export function App() {
  return <RouterProvider router={router} />;
}
