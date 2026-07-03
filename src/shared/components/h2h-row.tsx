import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { UserPredictionHistoryItem } from '@/shared/hooks/use-user-profile';

/** Clases de color por outcome (no-exacto). El exacto se arma aparte en
 *  `ScoreCell` como píldora arcoíris con más padding/tamaño que el primer
 *  intento, que se veía comprimida en la fila chica de comparación. */
function outcomeClasses(outcome: Exclude<UserPredictionHistoryItem['outcome'], 'exact'>): string {
  switch (outcome) {
    case 'correct': return 'text-green-600 dark:text-green-400 font-bold';
    case 'missed':  return 'text-red-500/80 font-semibold';
    case 'pending': return 'text-muted font-semibold';
  }
}

function ScoreCell({
  score,
  outcome,
}: {
  score: { homeScore: number; awayScore: number };
  outcome: UserPredictionHistoryItem['outcome'];
}) {
  if (outcome === 'exact') {
    return (
      <div className="flex justify-center">
        <span className="inline-block px-2.5 py-1 rounded-md text-base-s font-black legendary-rainbow">
          {score.homeScore} - {score.awayScore}
        </span>
      </div>
    );
  }
  return (
    <div className={cn('text-center text-sm-s', outcomeClasses(outcome))}>
      {score.homeScore} - {score.awayScore}
    </div>
  );
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
        <ScoreCell score={match.predictionA} outcome={match.outcomeA} />
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
        <ScoreCell score={match.predictionB} outcome={match.outcomeB} />
      </div>
    </div>
  );
}
