import { NavLink } from 'react-router-dom';
import { Home, Trophy, Users, User, Calendar, Settings, ShieldCheck, BarChart2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/components/logo';
import { useAuthStore } from '@/shared/stores/auth-store';

const baseNavItems = [
  { to: '/home',        label: 'Inicio',   Icon: Home },
  { to: '/leagues',     label: 'Ligas',    Icon: Users },
  { to: '/matches',     label: 'Partidos', Icon: Calendar },
  { to: '/leaderboard', label: 'Global',   Icon: BarChart2 },
  { to: '/fantasy',     label: 'Fantasy',  Icon: Trophy },
  { to: '/profile',     label: 'Perfil',   Icon: User },
  { to: '/settings',    label: 'Config',   Icon: Settings },
];

export function Sidebar() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin);
  const navItems = isAdmin
    ? [...baseNavItems, { to: '/admin', label: 'Admin', Icon: ShieldCheck }]
    : baseNavItems;
  return (
    <aside className="hidden lg:flex flex-col w-56 xl:w-64 shrink-0 h-screen sticky top-0 border-r border-border bg-card">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-elevated hover:text-text'
              )
            }
          >
            {({ isActive }) => (
              <>
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
