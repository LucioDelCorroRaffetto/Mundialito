/**
 * Distribución de Poisson para predecir goles por equipo.
 *
 * Idea: si un equipo "tira" λ goles esperados por partido, la prob de
 * marcar exactamente k goles es P(k; λ) = (λ^k · e^-λ) / k!
 *
 * Para predecir un marcador completo asumimos independencia entre los
 * goles de cada equipo (aproximación; en realidad están débilmente
 * correlacionados — el "ajuste Dixon-Coles" lo corrige para 0-0/1-0/0-1
 * pero acá lo simplificamos). El error es chico para el caso de uso de
 * mostrar "marcador más probable" en la UI.
 *
 * λ_home y λ_away se derivan del modelo de goles (ver goal-model.ts)
 * a partir de los ratings Elo.
 */

const MAX_GOALS = 8; // probs por encima son <0.1%, irrelevantes

/** P(k; λ) — Poisson PMF. Cacheado factorial para velocidad. */
const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0 || k > MAX_GOALS) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / FACTORIAL[k];
}

/**
 * Devuelve la distribución conjunta P(home=i, away=j) para i,j ∈ [0..MAX_GOALS].
 * Asumimos independencia (sin Dixon-Coles).
 */
export function scoreDistribution(
  lambdaHome: number,
  lambdaAway: number,
): number[][] {
  const distH = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, lambdaHome));
  const distA = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, lambdaAway));
  const grid: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    const row: number[] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      row.push(distH[i] * distA[j]);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Probabilidades de resultado 1X2 y marcador más probable, derivados
 * de la distribución conjunta.
 */
export interface MatchProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
  topScores: { home: number; away: number; prob: number }[]; // top 3
}

export function probabilitiesFromGrid(grid: number[][]): MatchProbabilities {
  let homeWin = 0, draw = 0, awayWin = 0;
  const scores: { home: number; away: number; prob: number }[] = [];
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const p = grid[i][j];
      if (i > j) homeWin += p;
      else if (i < j) awayWin += p;
      else draw += p;
      scores.push({ home: i, away: j, prob: p });
    }
  }
  scores.sort((a, b) => b.prob - a.prob);
  return { homeWin, draw, awayWin, topScores: scores.slice(0, 3) };
}

/**
 * Sample a score from a Poisson(λ) distribution using inverse-CDF.
 * Usado por la Monte Carlo simulation del bracket.
 */
export function samplePoisson(lambda: number, rng: () => number = Math.random): number {
  // Knuth's algorithm — bueno para λ pequeños (≤ ~10), que es siempre el
  // caso en fútbol. Para λ grandes habría que usar rejection sampling.
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}
