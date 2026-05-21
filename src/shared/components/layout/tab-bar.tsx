import { NavLink } from 'react-router-dom';
import { Home, Users, User, Calendar, ShieldCheck, BarChart2, Star } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/auth-store';

const BASE_TABS = [
  { to: '/home',        label: 'Inicio',   Icon: Home },
  { to: '/matches',     label: 'Partidos', Icon: Calendar },
  { to: '/leaderboard', label: 'Global',   Icon: BarChart2 },
  { to: '/tournament',  label: 'Copa',     Icon: Star },
  { to: '/leagues',     label: 'Ligas',    Icon: Users },
  { to: '/profile',     label: 'Perfil',   Icon: User },
];

const ADMIN_TAB = { to: '/admin', label: 'Admin', Icon: ShieldCheck };

export function TabBar() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin);
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
      <ul className="flex items-stretch justify-around max-w-xl mx-auto">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1 min-w-0">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 min-h-12 transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-text'
                )
              }
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={cn('text-[10px] font-semibold leading-none', isActive && 'text-accent')}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
