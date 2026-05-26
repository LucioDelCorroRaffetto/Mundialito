import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart2, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { SkeletonList } from '@/shared/components/skeleton';
import { useGlobalLeaderboard, type LeaderboardEntry, type TopBadge } from '@/shared/hooks/use-leaderboard';
import { useAuthStore } from '@/shared/stores/auth-store';

const MEDAL_COLORS = [
  { bg: 'bg-yellow-400/20', border: 'border-yellow-400/40', text: 'text-yellow-400', label: '🥇' },
  { bg: 'bg-slate-400/20',  border: 'border-slate-400/40',  text: 'text-slate-300',  label: '🥈' },
  { bg: 'bg-amber-700/20',  border: 'border-amber-700/40',  text: 'text-amber-600',  label: '🥉' },
];

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/40',
  gold:     'bg-yellow-400/20 text-yellow-300 border-yellow-400/40',
  silver:   'bg-slate-400/20 text-slate-300 border-slate-400/40',
  bronze:   'bg-amber-700/20 text-amber-500 border-amber-700/40',
};

function BadgeChip({ badge }: { badge: TopBadge }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border',
        TIER_COLORS[badge.tier] ?? 'bg-elevated text-muted border-border'
      )}
      title={badge.name}
    >
      <span>{badge.icon}</span>
    </span>
  );
}

function PodiumCard({ entry, place }: { entry: LeaderboardEntry; place: 0 | 1 | 2 }) {
  const medal = MEDAL_COLORS[place];
  const initials = entry.username.slice(0, 1).toUpperCase();
  const heights = ['h-28', 'h-20', 'h-16'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: place * 0.1 }}
      className={cn('flex flex-col items-center gap-2', place === 0 ? 'order-2' : place === 1 ? 'order-1' : 'order-3')}
    >
      <span className="text-xl">{medal.label}</span>
      <Link to={`/u/${entry.userId}`} className="flex flex-col items-center gap-2">
        <div
          className={cn(
            'w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0 overflow-hidden',
            medal.border
          )}
        >
          {entry.avatarUrl ? (
            <img src={entry.avatarUrl} alt={entry.username} width={48} height={48} className="w-full h-full object-cover" />
          ) : (
            <span className={cn('text-base font-bold', medal.text)}>{initials}</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <p className={cn('text-xs font-semibold text-center max-w-[80px] truncate', medal.text)}>
            {entry.username}
          </p>
          {entry.topBadge && <BadgeChip badge={entry.topBadge} />}
        </div>
      </Link>
      <p className="text-xs text-muted">{entry.totalPoints} pts</p>
      <div
        className={cn(
          'w-16 rounded-t-lg border flex items-end justify-center pb-1',
          medal.bg, medal.border, heights[place]
        )}
      >
        <span className={cn('text-lg font-bold', medal.text)}>{place + 1}</span>
      </div>
    </motion.div>
  );
}

function LeaderboardRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const initials = entry.username.slice(0, 1).toUpperCase();
  return (
    <Link to={`/u/${entry.userId}`}>
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: (entry.rank - 3) * 0.03 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-elevated transition-colors',
        isMe && 'bg-accent-soft hover:bg-accent-soft/80'
      )}
    >
      <span className={cn('w-7 text-center text-sm font-bold', isMe ? 'text-accent' : 'text-muted')}>
        {entry.rank}
      </span>
      <div className="w-8 h-8 rounded-full bg-elevated border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt={entry.username} width={32} height={32} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-text">{initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn('text-sm font-semibold truncate', isMe ? 'text-accent' : 'text-text')}>
            {entry.username} {isMe && '(vos)'}
          </p>
          {entry.topBadge && <BadgeChip badge={entry.topBadge} />}
        </div>
        {entry.leagueCount > 0 && (
          <p className="text-xs text-muted">{entry.leagueCount} liga{entry.leagueCount !== 1 ? 's' : ''}</p>
        )}
      </div>
      <span className={cn('text-base font-bold', isMe ? 'text-accent' : 'text-text')}>
        {entry.totalPoints}
      </span>
      <ChevronRight size={16} className="text-muted flex-shrink-0" />
    </motion.div>
    </Link>
  );
}

export function LeaderboardPage() {
  const { data, isLoading } = useGlobalLeaderboard(50);
  const currentUser = useAuthStore((s) => s.user);

  const entries = data?.data ?? [];
  const showPodium = entries.length >= 1 && entries[0].totalPoints > 0;
  const top3 = showPodium ? entries.slice(0, 3) : [];
  const rest = showPodium ? entries.slice(3) : entries;

  const myEntry = entries.find((e) => e.userId === currentUser?.id);

  if (isLoading) {
    return (
      <div className="p-4 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={20} className="text-accent" />
          <h1 className="text-2xl font-display font-bold text-text">Tabla Global</h1>
        </div>
        <SkeletonList count={10} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8 animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={22} className="text-accent" />
          <h1 className="text-2xl font-display font-bold text-text">Tabla Global</h1>
        </div>
        <p className="text-sm text-muted mt-1">Puntos acumulados en todas las ligas</p>
      </div>

      {/* My position banner (if not in top 3) */}
      {myEntry && myEntry.rank > 3 && (
        <div className="mx-4 p-3 rounded-lg bg-accent-soft border border-accent/30 flex items-center gap-3">
          <span className="text-accent font-bold text-lg">#{myEntry.rank}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-text">Tu posición global</p>
            <p className="text-xs text-muted">{myEntry.totalPoints} pts · {myEntry.leagueCount} liga{myEntry.leagueCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Podium — only when at least one player has scored */}
      {showPodium && top3.length > 0 && (
        <div className="px-4">
          <div className="flex items-end justify-center gap-3 py-4">
            {top3.map((entry, i) => (
              <PodiumCard key={entry.userId} entry={entry} place={i as 0 | 1 | 2} />
            ))}
          </div>
        </div>
      )}

      {/* Rest of the list */}
      {rest.length > 0 && (
        <div className="mx-4 rounded-lg bg-card border border-border overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-elevated">
            <span className="w-7 text-center text-xs text-muted">#</span>
            <span className="w-8 flex-shrink-0" />
            <span className="flex-1 text-xs text-muted">Jugador</span>
            <span className="text-xs text-muted">Pts</span>
          </div>
          {rest.map((entry) => (
            <LeaderboardRow
              key={entry.userId}
              entry={entry}
              isMe={entry.userId === currentUser?.id}
            />
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3">
          <BarChart2 size={40} className="text-muted opacity-40" />
          <p className="text-sm text-muted">Todavía no hay posiciones</p>
        </div>
      )}
    </div>
  );
}
