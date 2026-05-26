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
