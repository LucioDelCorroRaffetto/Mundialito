import { NavLink } from 'react-router-dom';
import { Home, Trophy, Users, User, Calendar, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/auth-store';

const BASE_TABS = [
  { to: '/home', label: 'Inicio', Icon: Home },
  { to: '/leagues', label: 'Ligas', Icon: Users },
  { to: '/matches', label: 'Partidos', Icon: Calendar },
  { to: '/fantasy', label: 'Fantasy', Icon: Trophy },
  { to: '/profile', label: 'Perfil', Icon: User },
];

const ADMIN_TAB = { to: '/admin', label: 'Admin', Icon: ShieldCheck };

export function TabBar() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin);
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
      <ul className="flex items-stretch justify-around max-w-xl mx-auto">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 min-h-12 transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-text'
                )
              }
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={cn('text-xs-s font-semibold', isActive && 'text-accent')}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
