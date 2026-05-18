export interface PredictionInput {
  homeScore: number;
  awayScore: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

/**
 * Sistema de puntuación de Mundialito:
 * - Resultado exacto: 5 pts
 * - Ganador correcto + diferencia exacta: 3 pts
 * - Ganador correcto (sin diferencia exacta): 1 pt
 * - Empate correcto (cualquier empate): 1 pt
 * - Fallo: 0 pts
 */
export function calculatePoints(pred: PredictionInput, result: MatchResult): number {
  if (pred.homeScore === result.homeScore && pred.awayScore === result.awayScore) return 5;

  const predDiff = pred.homeScore - pred.awayScore;
  const resultDiff = result.homeScore - result.awayScore;

  if (predDiff === 0 && resultDiff === 0) return 1; // empate acertado
  if (Math.sign(predDiff) !== Math.sign(resultDiff)) return 0;
  if (predDiff === resultDiff) return 3; // ganador + diferencia
  return 1; // solo ganador
}
