import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { UserPredictionHistoryItem } from '@/shared/hooks/use-user-profile';

/** Clases de color por outcome — mismo lenguaje cromático que `HistoryRow`:
 *  acierto parcial ⇒ verde, fallo ⇒ rojo. El exacto no usa texto rainbow acá:
 *  en la fila compacta del H2H no hay borde de card que dé contexto, y como
 *  `legendary-rainbow-text` es una animación infinita, una captura del H2H
 *  puede caer en cualquier color del degradé (incluido un azul que no dice
 *  nada) — confunde en vez de destacar. Se usa una píldora de fondo sólido
 *  en su lugar (misma clase `legendary-rainbow` que el badge de HistoryRow).
 */
function outcomeClasses(outcome: UserPredictionHistoryItem['outcome']): string {
  switch (outcome) {
    case 'correct': return 'text-green-600 dark:text-green-400 font-bold';
    case 'missed':  return 'text-red-500/80 font-semibold';
    case 'pending': return 'text-muted font-semibold';
    case 'exact':   return 'font-black';
  }
}

function formatMatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export interface H2hMatch {
  matchId: number;
  kickoffUtc: string;
  homeTeam: { name: string | null; code: string | null; flag: string | null };
  awayTeam: { name: string | null; code: string | null; flag: string | null };
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  predictionA: UserPredictionHistoryItem['prediction'];
  outcomeA: UserPredictionHistoryItem['outcome'];
  pointsA: number | null;
  predictionB: UserPredictionHistoryItem['prediction'];
  outcomeB: UserPredictionHistoryItem['outcome'];
  pointsB: number | null;
}

/** Fila de comparación H2H: pronóstico de A | resultado real | pronóstico de B. */
export function H2hRow({ match }: { match: H2hMatch }) {
  const hasResult = match.actualHomeScore !== null && match.actualAwayScore !== null;
  return (
    <div className="p-3 rounded-lg bg-card border border-border">
      <div className="text-xs-s text-muted text-center mb-2">
        {formatMatchDate(match.kickoffUtc)}
      </div>
      <div className="grid grid-cols-3 items-center gap-2">
        <div className="text-center">
          <span
            className={cn(
              'text-sm-s',
              match.outcomeA === 'exact' && 'inline-block px-1.5 py-0.5 rounded legendary-rainbow',
              outcomeClasses(match.outcomeA),
            )}
          >
            {match.predictionA.homeScore} - {match.predictionA.awayScore}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <TeamFlag code={match.homeTeam.code ?? ''} emoji={match.homeTeam.flag ?? undefined} size={16} />
            <span className="text-xs-s font-bold text-text">
              {hasResult ? `${match.actualHomeScore}-${match.actualAwayScore}` : 'vs'}
            </span>
            <TeamFlag code={match.awayTeam.code ?? ''} emoji={match.awayTeam.flag ?? undefined} size={16} />
          </div>
          <span className="text-[10px] text-muted truncate max-w-full">
            {match.homeTeam.code ?? match.homeTeam.name} · {match.awayTeam.code ?? match.awayTeam.name}
          </span>
        </div>
        <div className="text-center">
          <span
            className={cn(
              'text-sm-s',
              match.outcomeB === 'exact' && 'inline-block px-1.5 py-0.5 rounded legendary-rainbow',
              outcomeClasses(match.outcomeB),
            )}
          >
            {match.predictionB.homeScore} - {match.predictionB.awayScore}
          </span>
        </div>
      </div>
    </div>
  );
}
