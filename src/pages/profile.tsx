import { useState, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, ChevronRight, Star, LogOut, History } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useMyStats } from '@/shared/hooks/use-my-stats';
import { useMyAchievements, useAllAchievements, type Achievement } from '@/shared/hooks/use-achievements';
import { useEnrichedPredictionHistory } from '@/shared/hooks/use-enriched-history';
import { UserLevelBadge, UserLevelCard } from '@/shared/components/user-level-badge';
import { AchievementCardModal } from '@/shared/components/achievement-card-modal';
import { HistoryRow } from '@/shared/components/prediction-history-row';
import { computeLevel } from '@/shared/lib/levels';
import { useLogout } from '@/shared/hooks/use-auth';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';

// Cuántos pronósticos se muestran en la vista previa del perfil antes de
// ofrecer "Ver todas" hacia la página dedicada con el historial completo.
const HISTORY_PREVIEW_COUNT = 5;

const StatCard = memo(function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
});

function PredictionHistorySection() {
  const { reduced } = useMotionPrefs();
  const { data, isLoading } = useEnrichedPredictionHistory();
  const entries = data?.data ?? [];
  // Solo mostramos los primeros N acá; el resto vive en la página dedicada.
  const preview = entries.slice(0, HISTORY_PREVIEW_COUNT);
  const hasMore = entries.length > HISTORY_PREVIEW_COUNT;

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base-s font-display font-bold text-text">
          Historial de pronósticos
        </h2>
        <History size={16} className="text-accent" />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-elevated animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2 text-center">
          <span className="text-2xl-s">⚽</span>
          <p className="text-sm-s font-semibold text-text">Todavía no jugaste ningún partido</p>
          <p className="text-xs-s text-muted">
            Tus pronósticos aparecerán acá cuando los partidos arranquen.
          </p>
        </div>
      ) : (
        <>
          <motion.div
            className="flex flex-col gap-2"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {preview.map((entry) => (
              <motion.div key={entry.predictionId} variants={staggerItem(reduced)}>
                <HistoryRow entry={entry} />
              </motion.div>
            ))}
          </motion.div>

          {hasMore && (
            <Link
              to="/profile/predictions"
              className="mt-3 flex items-center justify-center gap-1 py-2.5 rounded-lg bg-card border border-border text-sm-s font-semibold text-accent hover:border-accent-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Ver todas ({entries.length})
              <ChevronRight size={16} />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const user = useAuthStore((s) => s.user);
  const doLogout = useLogout();
  const { data: stats, isLoading: statsLoading } = useMyStats();
  const { data: myAchievementsData } = useMyAchievements();
  const { data: allAchievementsData } = useAllAchievements();
  // Selected card for the trading-card modal. Both earned + locked logros
  // are clickable: tapping a locked one opens the same modal in dimmed
  // "still to unlock" state so the user can preview what they're aiming for.
  const [selectedCard, setSelectedCard] = useState<
    { achievement: Achievement; earned: boolean; earnedAt?: string } | null
  >(null);

  const myEarned = myAchievementsData?.data ?? [];
  const allAchievements = allAchievementsData?.data ?? [];
  // Locked = catalog minus earned. Memoized so the Set + filter don't rebuild
  // on every render (e.g. opening/closing the achievement modal).
  const locked = useMemo(() => {
    const earnedSlugs = new Set(myEarned.map((a) => a.slug));
    return allAchievements.filter((a) => !earnedSlugs.has(a.slug));
  }, [myEarned, allAchievements]);

  const handleLogout = () => {
    doLogout();
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl-s font-display font-bold text-text truncate">{user.username}</h1>
            <UserLevelBadge level={user.level ?? computeLevel(user.xp ?? 0)} />
          </div>
          {user.title && (
            <p className="text-xs-s text-accent italic">{user.title.name}</p>
          )}
          <p className="text-sm-s text-muted truncate">{user.email}</p>
        </div>
        <Link
          to="/settings"
          className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border hover:border-accent-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Configuración"
        >
          <Settings size={20} className="text-muted" />
        </Link>
      </div>

      <div className="px-4">
        <UserLevelCard level={user.level ?? computeLevel(user.xp ?? 0)} className="mb-4" />
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

      <PredictionHistorySection />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base-s font-display font-bold text-text">
            Logros ({myEarned.length}/{allAchievements.length})
          </h2>
          <Star size={16} className="text-accent" />
        </div>

        {myEarned.length > 0 && (
          <motion.div
            className="flex flex-col gap-2 mb-3"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {myEarned.map((a) => (
              <motion.button
                key={a.slug}
                type="button"
                onClick={() =>
                  setSelectedCard({ achievement: a, earned: true, earnedAt: a.earnedAt })
                }
                variants={staggerItem(reduced)}
                whileHover={reduced ? undefined : { y: -1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-accent-border text-left hover:border-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-2xl-s">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm-s font-semibold text-text">{a.name}</p>
                  <p className="text-xs-s text-muted">{a.description}</p>
                </div>
                <span className="text-xs-s text-accent font-semibold">+{a.xpReward} XP</span>
              </motion.button>
            ))}
          </motion.div>
        )}

        <div className="flex flex-col gap-2">
          {locked.slice(0, 5).map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => setSelectedCard({ achievement: a, earned: false })}
              className="flex items-center gap-3 p-3 rounded-lg bg-elevated border border-border opacity-60 hover:opacity-100 transition-opacity text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:opacity-100"
            >
              <span className="text-2xl-s grayscale">{a.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm-s font-semibold text-muted">{a.name}</p>
                <p className="text-xs-s text-muted">{a.description}</p>
              </div>
              <span className="text-xs-s text-muted">🔒</span>
            </button>
          ))}
        </div>
      </div>

      <AchievementCardModal
        achievement={selectedCard?.achievement ?? null}
        earned={selectedCard?.earned ?? false}
        earnedAt={selectedCard?.earnedAt}
        onClose={() => setSelectedCard(null)}
      />

      <div className="px-4 pb-4 flex flex-col gap-3">
        <Link to="/achievements" className="flex items-center gap-3 py-3 border-b border-border">
          <span className="text-xl">🏆</span>
          <span className="flex-1 text-sm-s text-text">Mis Logros</span>
          <span className="text-muted">→</span>
        </Link>

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
