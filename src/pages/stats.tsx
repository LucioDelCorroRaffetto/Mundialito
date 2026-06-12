import { useState } from 'react';
import { motion } from 'framer-motion';
import { Goal, Hand, Square, type LucideIcon } from 'lucide-react';
import { useLeaderboards, type LeaderboardRow } from '@/shared/hooks/use-stats';
import { SkeletonList } from '@/shared/components/skeleton';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { cn } from '@/shared/lib/cn';

type TabId = 'goals' | 'assists' | 'yellow' | 'red';

const TABS: { id: TabId; label: string; Icon: LucideIcon; color: string; emptyMsg: string }[] = [
  { id: 'goals',   label: 'Goleadores',    Icon: Goal,   color: 'text-emerald-500', emptyMsg: 'Todavía no hay goles registrados' },
  { id: 'assists', label: 'Asistencias',   Icon: Hand,   color: 'text-blue-400',    emptyMsg: 'Todavía no hay asistencias registradas' },
  { id: 'yellow',  label: 'Amarillas',     Icon: Square, color: 'text-yellow-500',  emptyMsg: 'Sin amarillas todavía' },
  { id: 'red',     label: 'Rojas',         Icon: Square, color: 'text-red-500',     emptyMsg: 'Sin rojas todavía' },
];

function LeaderboardList({ rows, color, emptyMsg }: { rows: LeaderboardRow[]; color: string; emptyMsg: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm-s text-muted">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="px-4 flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <motion.div
          key={row.playerId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.02, 0.3) }}
          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
        >
          <span className="text-xs-s font-bold text-muted w-5 text-right tabular-nums">
            {i + 1}
          </span>
          {row.photoUrl ? (
            <img
              src={row.photoUrl}
              alt={row.playerName}
              className="w-9 h-9 rounded-full object-cover object-top flex-shrink-0 bg-elevated"
              loading="lazy"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-xs font-bold text-muted flex-shrink-0">
              {row.playerName.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm-s font-semibold text-text truncate">{row.playerName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TeamFlag code={row.teamCode} emoji={row.teamFlag} size={16} />
              <span className="text-xs-s text-muted truncate">{row.teamName}</span>
            </div>
          </div>
          <span className={cn('text-lg font-bold tabular-nums flex-shrink-0', color)}>
            {row.total}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const [tab, setTab] = useState<TabId>('goals');
  const { data, isLoading } = useLeaderboards();

  const activeTab = TABS.find((t) => t.id === tab)!;
  const rows = data
    ? tab === 'goals'   ? data.topScorers
    : tab === 'assists' ? data.topAssists
    : tab === 'yellow'  ? data.topYellows
    : data.topReds
    : [];

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-8">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-xl font-display font-bold text-text">Estadísticas</h1>
        <p className="text-xs-s text-muted">Goleadores, asistencias y tarjetas del torneo</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar px-4 pb-3 border-b border-border">
        {TABS.map(({ id, label, Icon, color }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 text-sm-s font-semibold px-3 py-1.5 rounded-full transition-colors',
                active
                  ? 'bg-accent text-accent-on'
                  : 'bg-elevated text-muted hover:text-text',
              )}
            >
              <Icon size={14} className={active ? '' : color} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="mt-4">
        {isLoading ? (
          <div className="px-4"><SkeletonList count={8} /></div>
        ) : (
          <LeaderboardList rows={rows} color={activeTab.color} emptyMsg={activeTab.emptyMsg} />
        )}
      </div>
    </div>
  );
}
