import { memo } from 'react';
import { Link } from 'react-router-dom';
import { getScoreType, getPointsLabel } from '@/shared/lib/scoring';
import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { PredictionHistoryEntry } from '@/shared/hooks/use-predictions';

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
    case 'exact':       return '✨ Exacto';
    case 'winner_diff': return 'Ganador +Dif';
    case 'winner':      return 'Ganador';
    case 'draw':        return 'Empate';
    case 'miss':        return 'Fallado';
  }
}

/** Fila del historial de pronósticos del usuario propio. Reusada por la
 *  vista previa del perfil y por la página dedicada "ver todas". */
export const HistoryRow = memo(function HistoryRow({ entry }: { entry: PredictionHistoryEntry }) {
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
  // El marcador exacto se trata como "carta legendaria": borde arcoíris
  // holográfico animado en vez del verde habitual.
  const accent =
    scoreType === 'exact'
      ? 'border-transparent legendary-rainbow-border'
      : scoreType === 'miss'
        ? 'border-red-500/30'
        : scoreType
          ? 'border-green-500/40'
          : 'border-border';

  const badge =
    scoreType === 'exact'
      ? 'legendary-rainbow'
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
          <TeamFlag code={entry.homeTeamCode ?? ''} emoji={entry.homeTeamFlag ?? undefined} size={20} />
          <span className="text-sm-s font-semibold text-text truncate">{homeLabel}</span>
          <span className="text-sm-s font-display font-bold text-text px-1 flex-shrink-0">
            {hasResult ? `${entry.actualHomeScore} - ${entry.actualAwayScore}` : 'vs'}
          </span>
          <span className="text-sm-s font-semibold text-text truncate">{awayLabel}</span>
          <TeamFlag code={entry.awayTeamCode ?? ''} emoji={entry.awayTeamFlag ?? undefined} size={20} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/60">
        <span className="text-xs-s text-muted">
          Tu pronóstico:{' '}
          <span className={cn('font-semibold text-text', scoreType === 'exact' && 'legendary-rainbow-text font-black')}>
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
