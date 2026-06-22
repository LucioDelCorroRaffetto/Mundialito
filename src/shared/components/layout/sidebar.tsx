import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Trophy, Users, User, Calendar, BarChart2, Star, Goal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/components/logo';
import { springSnappy, useMotionPrefs } from '@/shared/lib/motion';

const baseNavItems = [
  { to: '/home',        label: 'Inicio',          Icon: Home },
  { to: '/leagues',     label: 'Ligas',           Icon: Users },
  { to: '/matches',     label: 'Partidos',        Icon: Calendar },
  { to: '/leaderboard', label: 'Global',          Icon: BarChart2 },
  { to: '/tournament',  label: 'Copa',            Icon: Star },
  { to: '/fantasy',     label: 'Fantasy',         Icon: Trophy },
  { to: '/stats',       label: 'Estadísticas',    Icon: Goal },
  { to: '/profile',     label: 'Perfil',          Icon: User },
];

export function Sidebar() {
  const navItems = baseNavItems;
  const { reduced } = useMotionPrefs();
  return (
    <aside className="hidden md:flex flex-col w-56 xl:w-64 shrink-0 h-screen sticky top-0 border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <Logo size={32} />
        <span className="text-lg font-display font-bold text-accent tracking-tight">Mundialito</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 px-3 py-4 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-elevated hover:text-text'
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Barra activa que se desliza verticalmente entre items vía
                    layoutId compartido. Neutralizada con reduce-motion. */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-indicator"
                    className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent"
                    transition={reduced ? { duration: 0 } : springSnappy}
                  />
                )}
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border">
        <p className="text-xs text-muted">Mundial 2026 🏆</p>
      </div>
    </aside>
  );
}
