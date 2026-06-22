import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Users, User, Calendar, BarChart2, Star, Trophy, Goal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { springSnappy, tapScale, useMotionPrefs } from '@/shared/lib/motion';

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
  const { reduced } = useMotionPrefs();

  // Taller tab bar (64px) gives older fingers a 48px+ tappable area for
  // each tab, which is the WCAG / Apple HIG minimum. Icons + labels also
  // bumped a size each so the row reads at arm's length.
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_12px_-2px_rgba(0,0,0,0.4)] safe-bottom">
      <ul className="flex items-stretch justify-around max-w-xl mx-auto h-16">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1 min-w-0">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center justify-center gap-1 h-full w-full transition-colors',
                  isActive ? 'text-accent' : 'text-text/70 hover:text-text'
                )
              }
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  {/* Indicador activo animado: una barra que se desliza entre
                      tabs vía layoutId compartido. Con reduce-motion el
                      layout animation queda neutralizado (aparece sin
                      desplazarse). */}
                  {isActive && (
                    <motion.span
                      layoutId="tabbar-active-indicator"
                      className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent"
                      transition={reduced ? { duration: 0 } : springSnappy}
                    />
                  )}
                  {/* Icon wrapper — fixed 24×24 so strokeWidth change doesn't shift layout */}
                  <motion.span
                    className="flex items-center justify-center w-6 h-6 flex-shrink-0"
                    whileTap={reduced ? undefined : tapScale}
                  >
                    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  </motion.span>
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
