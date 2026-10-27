import { NavLink } from 'react-router';
import { useAuth } from '../auth/context';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`;

export function AdminTabs() {
  const { isAdmin } = useAuth();
  return (
    <nav aria-label="Moderation" className="flex flex-wrap gap-2">
      <NavLink to="/admin/reports" end className={tabClass}>
        Review queue
      </NavLink>
      <NavLink to="/admin/appeals" className={tabClass}>
        Appeals &amp; corrections
      </NavLink>
      {isAdmin && (
        <NavLink to="/admin/users" className={tabClass}>
          Users &amp; roles
        </NavLink>
      )}
    </nav>
  );
}
