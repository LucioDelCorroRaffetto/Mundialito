import { useState, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, ChevronRight, Star, LogOut, History } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useMyStats } from '@/shared/hooks/use-my-stats';
import { useMyAchievements, useAllAchievements, type Achievement } from '@/shared/hooks/use-achievements';
import { useMyPredictionHistory, type PredictionHistoryEntry } from '@/shared/hooks/use-predictions';
import { UserLevelBadge, UserLevelCard } from '@/shared/components/user-level-badge';
import { AchievementCardModal } from '@/shared/components/achievement-card-modal';
import { computeLevel } from '@/shared/lib/levels';
import { getScoreType, getPointsLabel } from '@/shared/lib/scoring';
import { cn } from '@/shared/lib/cn';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';

const StatCard = memo(function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
});

function formatMatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
  });
}

// Etiqueta corta para la píldora de resultado (la versión larga de
// getPointsLabel se usa como title/tooltip — desbordaba en mobile).
function shortScoreLabel(type: ReturnType<typeof getScoreType>): string {
  switch (type) {
    case 'exact':       return 'Exacto';
    case 'winner_diff': return 'Ganador +Dif';
    case 'winner':      return 'Ganador';
    case 'draw':        return 'Empate';
    case 'miss':        return 'Fallado';
  }
}

const HistoryRow = memo(function HistoryRow({ entry }: { entry: PredictionHistoryEntry }) {
  const isFinished = entry.status === 'finished';
  const isLive = entry.status === 'live';
  const hasResult =
    entry.actualHomeScore !== null && entry.actualAwayScore !== null;

  // Clasificación del pronóstico — solo cuando hay marcador real cargado.
  const scoreType =
    hasResult
      ? getScoreType({
          predictedHome: entry.predictedHomeScore,
          predictedAway: entry.predictedAwayScore,
          actualHome: entry.actualHomeScore as number,
          actualAway: entry.actualAwayScore as number,
        })
      : null;

  // Colores semánticos alineados con matches.tsx: acertar (cualquier punto)
  // se muestra en verde, el resultado exacto en emerald (verde más saturado)
  // y el fallo en rojo tenue. Mismo lenguaje cromático que el resto de la app.
  const accent =
    scoreType === 'exact'
      ? 'border-emerald-500/40'
      : scoreType === 'miss'
        ? 'border-red-500/30'
        : scoreType
          ? 'border-green-500/40'
          : 'border-border';

  const badge =
    scoreType === 'exact'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
      : scoreType === 'miss'
        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
        : 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/40';

  const homeLabel = entry.homeTeamCode ?? entry.homeTeamName ?? '???';
  const awayLabel = entry.awayTeamCode ?? entry.awayTeamName ?? '???';

  return (
    <Link
      to={`/matches/${entry.matchId}`}
      className={cn(
        'block p-3 rounded-lg bg-card border transition-colors hover:border-accent-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        accent,
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs-s text-muted truncate">
          {formatMatchDate(entry.kickoffUtc)}
          {entry.group ? ` · Grupo ${entry.group}` : ''}
        </span>
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase tracking-wider flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            En vivo
          </span>
        ) : scoreType ? (
          <span
            title={getPointsLabel(scoreType)}
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0',
              badge,
            )}
          >
            {shortScoreLabel(scoreType)}
          </span>
        ) : (
          <span className="text-[10px] text-muted flex-shrink-0">Pendiente</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Equipos + marcador real */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-base-s flex-shrink-0">{entry.homeTeamFlag ?? '🏳️'}</span>
          <span className="text-sm-s font-semibold text-text truncate">{homeLabel}</span>
          <span className="text-sm-s font-display font-bold text-text px-1 flex-shrink-0">
            {hasResult ? `${entry.actualHomeScore} - ${entry.actualAwayScore}` : 'vs'}
          </span>
          <span className="text-sm-s font-semibold text-text truncate">{awayLabel}</span>
          <span className="text-base-s flex-shrink-0">{entry.awayTeamFlag ?? '🏳️'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/60">
        <span className="text-xs-s text-muted">
          Tu pronóstico:{' '}
          <span className="font-semibold text-text">
            {entry.predictedHomeScore} - {entry.predictedAwayScore}
          </span>
        </span>
        {entry.points !== null ? (
          <span
            className={cn(
              'text-xs-s font-bold flex-shrink-0',
              entry.points > 0 ? 'text-accent' : 'text-muted',
            )}
          >
            {entry.points > 0 ? `+${entry.points} pts` : '0 pts'}
          </span>
        ) : (
          <span className="text-xs-s text-muted flex-shrink-0">
            {isFinished ? 'Calculando…' : '—'}
          </span>
        )}
      </div>
    </Link>
  );
});

function PredictionHistorySection() {
  const { reduced } = useMotionPrefs();
  const { data, isLoading } = useMyPredictionHistory();
  const entries = data?.data ?? [];

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
        <motion.div
          className="flex flex-col gap-2"
          variants={staggerContainer(reduced)}
          initial="initial"
          animate="animate"
        >
          {entries.map((entry) => (
            <motion.div key={entry.predictionId} variants={staggerItem(reduced)}>
              <HistoryRow entry={entry} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
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
