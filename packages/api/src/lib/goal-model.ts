/**
 * Convierte ratings Elo en λ (goles esperados) para Poisson.
 *
 * El modelo es una regresión empírica del Oloráculo .NET: la diferencia
 * de Elo entre dos equipos se traduce en una "ventaja de goles" usando
 * una sigmoidea suave alrededor del promedio del torneo.
 *
 *   diff = ratingHome - ratingAway
 *   advantage = 1.5 * tanh(diff / 400)        // ±1.5 goles asintótico
 *   lambdaHome = baseGoals + advantage / 2
 *   lambdaAway = baseGoals - advantage / 2
 *
 * `baseGoals` = 1.25 → promedio de goles por equipo en Mundiales recientes
 * según FIFA Technical Reports (2018–2022 ≈ 2.5 goles/partido).
 *
 * Esto evita las dos patologías comunes:
 *   - λ negativo (imposible) cuando un equipo es muy inferior.
 *   - λ explotando para diffs enormes (el sigmoid limita).
 */
const BASE_GOALS = 1.25;

export interface MatchLambdas {
  lambdaHome: number;
  lambdaAway: number;
}

export function lambdasFromElo(eloHome: number, eloAway: number): MatchLambdas {
  const diff = eloHome - eloAway;
  // Saturating advantage — al diff=400 ya estamos cerca del límite.
  const advantage = 1.5 * Math.tanh(diff / 400);
  const lambdaHome = Math.max(0.1, BASE_GOALS + advantage / 2);
  const lambdaAway = Math.max(0.1, BASE_GOALS - advantage / 2);
  return { lambdaHome, lambdaAway };
}
