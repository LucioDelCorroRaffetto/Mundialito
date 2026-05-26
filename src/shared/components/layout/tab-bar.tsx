import { NavLink } from 'react-router-dom';
import { Home, Users, User, Calendar, BarChart2, Star, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

const BASE_TABS = [
  { to: '/home',        label: 'Inicio',   Icon: Home },
  { to: '/matches',     label: 'Partidos', Icon: Calendar },
  { to: '/leaderboard', label: 'Global',   Icon: BarChart2 },
  { to: '/tournament',  label: 'Copa',     Icon: Star },
  { to: '/fantasy',     label: 'Fantasy',  Icon: Trophy },
  { to: '/leagues',     label: 'Ligas',    Icon: Users },
  { to: '/profile',     label: 'Perfil',   Icon: User },
];

export function TabBar() {
  const tabs = BASE_TABS;

  // Fixed height (56px) prevents CLS when active tab changes icon stroke-width
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
      <ul className="flex items-stretch justify-around max-w-xl mx-auto h-14">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1 min-w-0">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 h-full w-full transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-text'
                )
              }
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  {/* Icon wrapper — fixed 20×20 so strokeWidth change doesn't shift layout */}
                  <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span className="text-[10px] font-semibold leading-none">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
