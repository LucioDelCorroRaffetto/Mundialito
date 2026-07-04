export interface PredictionResult {
  predictedHome: number;
  predictedAway: number;
  actualHome: number;
  actualAway: number;
}

export type ScoreType = 'exact' | 'winner_diff' | 'winner' | 'draw' | 'miss';

export function getScoreType(r: PredictionResult): ScoreType {
  const { predictedHome: ph, predictedAway: pa, actualHome: ah, actualAway: aa } = r;

  // Resultado exacto
  if (ph === ah && pa === aa) return 'exact';

  const predictedWinner = ph > pa ? 'home' : pa > ph ? 'away' : 'draw';
  const actualWinner = ah > aa ? 'home' : aa > ah ? 'away' : 'draw';

  // Empate correcto (no exacto)
  if (predictedWinner === 'draw' && actualWinner === 'draw') return 'draw';

  // Ganador incorrecto
  if (predictedWinner !== actualWinner) return 'miss';

  // Ganador correcto — ¿diferencia correcta?
  if (ph - pa === ah - aa) return 'winner_diff';

  return 'winner';
}

export function calculatePoints(r: PredictionResult): number {
  const type = getScoreType(r);
  switch (type) {
    case 'exact':       return 5;
    case 'winner_diff': return 3;
    case 'draw':        return 3; // mismo nivel que ganador+diferencia
    case 'winner':      return 1;
    case 'miss':        return 0;
  }
}

/**
 * Marcador que cuenta para PUNTUAR PRONÓSTICOS: el de los 90'/120'.
 *
 * Espeja al helper del backend (packages/api/src/lib/scoring.ts). Un cruce por
 * PENALES se puntúa como el EMPATE de reglamento: el +1 al ganador que guarda
 * el sync vive en el score sólo para que el cuadro sepa quién avanzó, no para
 * la puntuación (la tanda no cambia que el partido terminó empatado). Un
 * ganador en el ALARGUE no lleva `decidedByPenalties`, así que su marcador real
 * cuenta como victoria. No-op para cualquier partido que no sea por penales, y
 * también cuando el marcador ya está empatado (modelo sin bump).
 */
export function scoringResult(m: {
  homeScore: number | null;
  awayScore: number | null;
  decidedByPenalties?: number | boolean | null;
}): { home: number | null; away: number | null } {
  const pen = m.decidedByPenalties === 1 || m.decidedByPenalties === true;
  if (pen && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore) {
    const reg = Math.min(m.homeScore, m.awayScore);
    return { home: reg, away: reg };
  }
  return { home: m.homeScore, away: m.awayScore };
}

export function getPointsLabel(type: ScoreType): string {
  switch (type) {
    case 'exact':       return 'Resultado exacto';
    case 'winner_diff': return 'Ganador + diferencia';
    case 'winner':      return 'Ganador correcto';
    case 'draw':        return 'Empate acertado';
    case 'miss':        return 'Sin puntos';
  }
}

// Para la preview en tiempo real (no se sabe el resultado real todavía)
export function getMaxPossiblePoints(home: number, away: number): {
  ifExact: number;
  ifWinnerDiff: number;
  ifWinner: number;
  isDraw: boolean;
} {
  const isDraw = home === away;
  return {
    ifExact: 5,
    ifWinnerDiff: 3,        // draw correcto y ganador+dif valen lo mismo: 3
    ifWinner: isDraw ? 0 : 1, // si es empate no hay "solo ganador"
    isDraw,
  };
}
