import { NavLink } from 'react-router-dom';
import { Home, Users, User, Calendar, BarChart2, Star, Trophy, Goal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

const BASE_TABS = [
  { to: '/home',        label: 'Inicio',   Icon: Home },
  { to: '/matches',     label: 'Partidos', Icon: Calendar },
  { to: '/leaderboard', label: 'Global',   Icon: BarChart2 },
  { to: '/tournament',  label: 'Copa',     Icon: Star },
  { to: '/fantasy',     label: 'Fantasy',  Icon: Trophy },
  { to: '/stats',       label: 'Stats',    Icon: Goal },
  { to: '/leagues',     label: 'Ligas',    Icon: Users },
  { to: '/profile',     label: 'Perfil',   Icon: User },
];

export function TabBar() {
  const tabs = BASE_TABS;

  // Taller tab bar (64px) gives older fingers a 48px+ tappable area for
  // each tab, which is the WCAG / Apple HIG minimum. Icons + labels also
  // bumped a size each so the row reads at arm's length.
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
      <ul className="flex items-stretch justify-around max-w-xl mx-auto h-16">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1 min-w-0">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 h-full w-full transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-text'
                )
              }
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  {/* Icon wrapper — fixed 24×24 so strokeWidth change doesn't shift layout */}
                  <span className="flex items-center justify-center w-6 h-6 flex-shrink-0">
                    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span className="text-[11px] font-semibold leading-none">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
