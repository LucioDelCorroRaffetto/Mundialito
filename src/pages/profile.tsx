import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, ChevronRight, Star, LogOut } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useMyStats } from '@/shared/hooks/use-my-stats';
import { useMyAchievements, useAllAchievements } from '@/shared/hooks/use-achievements';
import { useAdminProfile } from '@/shared/hooks/use-user-profile';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: stats, isLoading: statsLoading } = useMyStats();
  const { data: myAchievementsData } = useMyAchievements();
  const { data: allAchievementsData } = useAllAchievements();
  const { data: adminPointer } = useAdminProfile();

  const myAchievementSlugs = new Set((myAchievementsData?.data ?? []).map((a) => a.slug));
  const allAchievements = allAchievementsData?.data ?? [];
  const myEarned = (myAchievementsData?.data ?? []);
  const locked = allAchievements.filter((a) => !myAchievementSlugs.has(a.slug));

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Defensive: shouldn't happen inside RequireAuth, but show skeleton just in case
  if (!user) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-6 animate-fade-in">
        <div className="w-16 h-16 rounded-xl bg-elevated animate-pulse" />
        <div className="h-4 w-32 rounded bg-elevated animate-pulse" />
        <div className="h-3 w-48 rounded bg-elevated animate-pulse" />
      </div>
    );
  }

  const avatarInitial = user.username.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center gap-4 px-4 pt-6">
        <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl-s font-display font-bold text-accent-on">{avatarInitial}</span>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-xl-s font-display font-bold text-text">{user.username}</h1>
          <p className="text-sm-s text-muted">{user.email}</p>
        </div>
        <Link
          to="/settings"
          className="p-2 rounded-md bg-elevated border border-border hover:border-accent-border transition-colors"
          aria-label="Configuración"
        >
          <Settings size={20} className="text-muted" />
        </Link>
      </div>

      <div className="px-4">
        <h2 className="text-base-s font-display font-bold text-text mb-3">Mis estadísticas</h2>
        {statsLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-elevated animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="🎯 Predicciones" value={stats?.totalPredictions ?? 0} />
            <StatCard label="⚽ Exactos" value={stats?.exactScores ?? 0} />
            <StatCard label="✅ Resultados" value={stats?.correctResults ?? 0} />
            <StatCard label="🏆 Puntos" value={stats?.totalPoints ?? 0} />
            <StatCard label="📊 % Acierto" value={`${stats?.accuracy ?? 0}%`} />
          </div>
        )}
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base-s font-display font-bold text-text">
            Logros ({myEarned.length}/{allAchievements.length})
          </h2>
          <Star size={16} className="text-accent" />
        </div>

        {myEarned.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {myEarned.map((a) => (
              <motion.div
                key={a.slug}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-accent-border"
              >
                <span className="text-2xl-s">{a.icon}</span>
                <div className="flex-1">
                  <p className="text-sm-s font-semibold text-text">{a.name}</p>
                  <p className="text-xs-s text-muted">{a.description}</p>
                </div>
                <span className="text-xs-s text-accent font-semibold">+{a.pointsBonus} pts</span>
              </motion.div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {locked.slice(0, 5).map((a) => (
            <div key={a.slug} className="flex items-center gap-3 p-3 rounded-lg bg-elevated border border-border opacity-60">
              <span className="text-2xl-s grayscale">{a.icon}</span>
              <div className="flex-1">
                <p className="text-sm-s font-semibold text-muted">{a.name}</p>
                <p className="text-xs-s text-muted">{a.description}</p>
              </div>
              <span className="text-xs-s text-muted">🔒</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3">
        <Link to="/achievements" className="flex items-center gap-3 py-3 border-b border-border">
          <span className="text-xl">🏆</span>
          <span className="flex-1 text-sm-s text-text">Mis Logros</span>
          <span className="text-muted">→</span>
        </Link>

        {/* Hidden treat for the curious: shortcut to Infantino's profile. */}
        {adminPointer && adminPointer.id !== user.id && (
          <Link
            to={`/u/${adminPointer.id}`}
            className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:border-yellow-500/60 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-yellow-500/20 flex items-center justify-center">
              <span className="text-lg">🏛️</span>
            </div>
            <div className="flex-1">
              <p className="text-base-s font-semibold text-yellow-300">Presidente de la FIFA</p>
              <p className="text-sm-s text-muted">El que armó todo esto</p>
            </div>
            <ChevronRight size={16} className="text-yellow-400/70" />
          </Link>
        )}
        <Link
          to="/settings"
          className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
        >
          <div className="w-9 h-9 rounded-md bg-elevated flex items-center justify-center">
            <Settings size={18} className="text-muted" />
          </div>
          <div className="flex-1">
            <p className="text-base-s font-semibold text-text">Configuración</p>
            <p className="text-sm-s text-muted">Tema · fuente · notificaciones</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-red-500/40 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-md bg-elevated flex items-center justify-center">
            <LogOut size={18} className="text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-base-s font-semibold text-red-400">Cerrar sesión</p>
          </div>
        </button>
      </div>
    </div>
  );
}
