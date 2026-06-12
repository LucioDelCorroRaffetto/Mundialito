/**
 * Elo ratings simplificados para selecciones nacionales.
 *
 * Modelo: el "World Football Elo" estándar (Buchdahl) — score esperado
 * derivado de la diferencia de rating y un K-factor por importancia del
 * torneo. El K para Copa del Mundo es 60 (vs 40 amistosos).
 *
 * Por qué Elo y no FIFA ranking:
 *   - Elo se actualiza partido a partido y refleja forma reciente.
 *   - El FIFA ranking oficial pondera con confederaciones y mezcla
 *     amistosos+clasificatorios, lo que distorsiona el power-ranking.
 *   - El portado-de-Oloráculo (modelo .NET) usa Elo como input principal
 *     del GoalModel, así que mantenemos coherencia.
 *
 * Snapshot inicial: ratings al 2026-06-01 tomados de eloratings.net.
 * No es perfecto pero da un baseline razonable; el service los actualiza
 * automáticamente a medida que se juegan partidos del torneo.
 */

/** K-factor por tipo de torneo (estándar World Football Elo). */
export const K_WORLDCUP = 60;
export const K_QUALIFIER = 40;
export const K_FRIENDLY = 20;

/**
 * Probabilidad de que el equipo A le gane a B dado un diff de Elo.
 *   E_A = 1 / (1 + 10^(-(R_A - R_B + H) / 400))
 *
 * `homeAdvantage` (en puntos Elo) se suma al rating del local. Para
 * Copas del Mundo (sin local real) usar 0 — el "home" en el bracket es
 * sólo orden de listado, no ventaja deportiva.
 */
export function expectedScore(ratingA: number, ratingB: number, homeAdvantage = 0): number {
  const diff = ratingA - ratingB + homeAdvantage;
  return 1 / (1 + Math.pow(10, -diff / 400));
}

/** Actualiza un par de ratings tras un resultado.
 *  result: 1 = A gana, 0 = B gana, 0.5 = empate. */
export function updateRatings(
  ratingA: number,
  ratingB: number,
  result: 0 | 0.5 | 1,
  k = K_WORLDCUP,
): { newA: number; newB: number } {
  const expA = expectedScore(ratingA, ratingB);
  const newA = ratingA + k * (result - expA);
  const newB = ratingB + k * ((1 - result) - (1 - expA));
  return { newA, newB };
}

/**
 * Snapshot de Elo al inicio del Mundial 2026. Source: eloratings.net.
 * Si un código no aparece acá, asumimos 1500 (promedio) — todavía juega
 * pero sin baseline informado.
 *
 * Es deliberadamente pequeño: los equipos top y los del Mundial. Los
 * demás caen al default y el sistema los corrige sobre la marcha.
 */
export const INITIAL_ELO: Record<string, number> = {
  // Top tier (1900+)
  ARG: 2143, FRA: 2090, BRA: 2055, ESP: 2049, ENG: 2014,
  POR: 1996, NED: 1969, BEL: 1933, GER: 1928, ITA: 1907,
  // Strong (1800–1899)
  COL: 1881, URU: 1870, CRO: 1860, MAR: 1850, MEX: 1825,
  USA: 1818, SUI: 1810, DEN: 1808, JPN: 1805, AUS: 1800,
  // Mid (1700–1799)
  KOR: 1790, SEN: 1780, EGY: 1772, IRN: 1768, ECU: 1765,
  CAN: 1750, NOR: 1745, SCO: 1740, AUT: 1735, TUR: 1730,
  POL: 1720, SRB: 1715, CZE: 1710, HUN: 1700, GRE: 1700,
  // Decent (1600–1699)
  ZAF: 1680, NGA: 1675, CIV: 1670, GHA: 1650, DZA: 1645,
  TUN: 1640, CMR: 1635, PAR: 1630, CHL: 1625, PER: 1620,
  CRC: 1615, JAM: 1605, PAN: 1600,
  // Lower (sub-1600)
  HAI: 1530, BIH: 1620, ALB: 1640, GEO: 1635, ISL: 1665,
  ROU: 1655, IRL: 1650, SVN: 1660, SVK: 1670, FIN: 1640,
  KSA: 1590, IRQ: 1580, QAT: 1620, UZB: 1640, JOR: 1570,
  CUW: 1550, CPV: 1540, NZL: 1590,
};

export function initialEloFor(code: string): number {
  return INITIAL_ELO[code.toUpperCase()] ?? 1500;
}
