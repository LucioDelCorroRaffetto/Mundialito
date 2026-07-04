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

/**
 * Marcador que cuenta para PUNTUAR PRONÓSTICOS: el de los 90'/120'.
 *
 * Un cruce definido por PENALES se puntúa como el EMPATE de reglamento — el +1
 * que los syncs le suman al ganador vive en el score sólo para que el CUADRO
 * sepa quién avanzó, NO para la puntuación: la tanda no cambia que el partido
 * terminó empatado (criterio de casas de apuestas). Un ganador en el ALARGUE no
 * lleva `decidedByPenalties`, así que su marcador real (p.ej. 2-1) cuenta como
 * victoria, que es lo correcto.
 *
 * Es un no-op para todo partido que no sea penales, así que envolver cualquier
 * sitio de puntuación con este helper es seguro.
 */
export function scoringResult<
  T extends { homeScore: number | null; awayScore: number | null; decidedByPenalties?: number | boolean | null },
>(match: T): MatchResult {
  const pen = match.decidedByPenalties === 1 || match.decidedByPenalties === true;
  if (
    pen &&
    match.homeScore != null &&
    match.awayScore != null &&
    match.homeScore !== match.awayScore
  ) {
    const reg = Math.min(match.homeScore, match.awayScore);
    return { homeScore: reg, awayScore: reg };
  }
  return { homeScore: match.homeScore as number, awayScore: match.awayScore as number };
}
