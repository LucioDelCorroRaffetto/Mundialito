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
 * - Resultado exacto:                    5 pts
 * - Ganador correcto + diferencia exacta: 3 pts
 * - Empate correcto (no exacto):          3 pts  ← mismo nivel que ganador+dif
 * - Ganador correcto (sin diferencia):    1 pt
 * - Fallo:                               0 pts
 *
 * Lógica de equidad: tanto acertar el empate como acertar ganador+diferencia
 * requieren "entender bien el partido", por eso valen igual.
 */
export function calculatePoints(
  pred: PredictionInput | null | undefined,
  result: MatchResult | null | undefined,
): number {
  // Defensive guards — the TS types claim non-null, but the data can arrive
  // null when a prediction or a match score row is in transition. Without
  // these guards `null === null` would award 5 pts to "predictions" against
  // a still-pending match.
  if (
    !pred || !result ||
    pred.homeScore == null || pred.awayScore == null ||
    result.homeScore == null || result.awayScore == null ||
    !Number.isFinite(pred.homeScore) || !Number.isFinite(pred.awayScore) ||
    !Number.isFinite(result.homeScore) || !Number.isFinite(result.awayScore) ||
    pred.homeScore < 0 || pred.awayScore < 0 ||
    result.homeScore < 0 || result.awayScore < 0
  ) {
    return 0;
  }

  if (pred.homeScore === result.homeScore && pred.awayScore === result.awayScore) return 5;

  const predDiff = pred.homeScore - pred.awayScore;
  const resultDiff = result.homeScore - result.awayScore;

  if (predDiff === 0 && resultDiff === 0) return 3; // empate acertado (no exacto)
  if (Math.sign(predDiff) !== Math.sign(resultDiff)) return 0;
  if (predDiff === resultDiff) return 3; // ganador + diferencia exacta
  return 1; // solo ganador correcto
}
