import { useState } from 'react';
import { motion } from 'framer-motion';
import { Goal, Hand, Square, type LucideIcon } from 'lucide-react';
import { useLeaderboards, type LeaderboardRow } from '@/shared/hooks/use-stats';
import { SkeletonList } from '@/shared/components/skeleton';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { cn } from '@/shared/lib/cn';

type TabId = 'goals' | 'assists' | 'yellow' | 'red';

const TABS: { id: TabId; label: string; Icon: LucideIcon; color: string; emptyMsg: string; unit: [string, string] }[] = [
  { id: 'goals',   label: 'Goleadores',    Icon: Goal,   color: 'text-emerald-500', emptyMsg: 'Todavía no hay goles registrados',        unit: ['gol', 'goles'] },
  { id: 'assists', label: 'Asistencias',   Icon: Hand,   color: 'text-blue-400',    emptyMsg: 'Todavía no hay asistencias registradas', unit: ['asistencia', 'asistencias'] },
  { id: 'yellow',  label: 'Amarillas',     Icon: Square, color: 'text-yellow-500',  emptyMsg: 'Sin amarillas todavía',                  unit: ['amarilla', 'amarillas'] },
  { id: 'red',     label: 'Rojas',         Icon: Square, color: 'text-red-500',     emptyMsg: 'Sin rojas todavía',                      unit: ['roja', 'rojas'] },
];

/** Etiqueta breve de posición + color de chip por línea de juego. */
const POSITION_STYLES: Record<string, { label: string; cls: string }> = {
  GK:  { label: 'GK',  cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
  DEF: { label: 'DEF', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  MID: { label: 'MID', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  FWD: { label: 'FWD', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
};

/** Top 3 lleva borde y fondo dorado/plata/bronce; el resto neutro. */
const PODIUM = [
  { ring: 'ring-amber-400/50',  bg: 'bg-amber-500/5',  chip: 'bg-amber-400 text-amber-950',  icon: '🥇' },
  { ring: 'ring-zinc-300/50',   bg: 'bg-zinc-400/5',   chip: 'bg-zinc-300 text-zinc-900',    icon: '🥈' },
  { ring: 'ring-orange-400/50', bg: 'bg-orange-600/5', chip: 'bg-orange-400 text-orange-950', icon: '🥉' },
];

function LeaderboardList({ rows, color, emptyMsg, unit }: { rows: LeaderboardRow[]; color: string; emptyMsg: string; unit: [string, string] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm-s text-muted">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="px-4 flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const podium = i < 3 ? PODIUM[i] : null;
        // Mostramos el rank "dense" — empatados comparten posición, evita
        // que el #4 figure como #4 cuando hay 3 empatados arriba.
        const denseRank = rows.findIndex((r) => r.total === row.total) + 1;
        const isFirstOfTier = i > 0 && rows[i - 1].total !== row.total;
        const pos = POSITION_STYLES[row.position] ?? POSITION_STYLES.MID;
        return (
          <div key={row.playerId}>
            {/* Mini-divider entre tramos de igual total para que se note el
                corte entre 2 goles y 1 gol cuando hay muchos empatados. */}
            {isFirstOfTier && (
              <div className="flex items-center gap-2 py-1.5 px-1 text-[10px] uppercase tracking-wider text-muted/60 font-bold">
                <div className="flex-1 h-px bg-border/60" />
                <span>{row.total} {row.total === 1 ? unit[0] : unit[1]}</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                podium
                  ? `ring-1 ${podium.ring} ${podium.bg} border-transparent`
                  : 'bg-card border-border',
              )}
            >
              {/* Rank chip: medalla para top 3, número denso para el resto */}
              {podium ? (
                <span
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-black tabular-nums shadow-sm flex-shrink-0',
                    podium.chip,
                  )}
                  title={`#${denseRank}`}
                >
                  {podium.icon}
                </span>
              ) : (
                <span className="text-xs-s font-bold text-muted w-6 text-right tabular-nums flex-shrink-0">
                  {denseRank}
                </span>
              )}

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
                <div className="flex items-center gap-1.5">
                  <p className="text-sm-s font-semibold text-text truncate">{row.playerName}</p>
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded leading-none flex-shrink-0', pos.cls)}>
                    {pos.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <TeamFlag code={row.teamCode} emoji={row.teamFlag} size={16} />
                  <span className="text-xs-s text-muted truncate">{row.teamName}</span>
                </div>
              </div>

              <span className={cn('text-lg font-bold tabular-nums flex-shrink-0', color)}>
                {row.total}
              </span>
            </motion.div>
          </div>
        );
      })}
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

      {/* Tabs — sticky para que al scrollear largas tablas (38+ goleadores)
          el usuario siga viendo qué métrica está mirando y pueda alternar. */}
      <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto no-scrollbar px-4 pt-1 pb-3 bg-bg/95 backdrop-blur border-b border-border">
        {TABS.map(({ id, label, Icon, color }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={active}
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
          <LeaderboardList rows={rows} color={activeTab.color} emptyMsg={activeTab.emptyMsg} unit={activeTab.unit} />
        )}
      </div>
    </div>
  );
}
