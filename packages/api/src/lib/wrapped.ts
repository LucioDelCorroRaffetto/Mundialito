/**
 * Métricas puras del "Mundialito Wrapped" — sin DB ni red, para poder
 * testearlas con fixtures y para que el handler (`routes/users/handlers/
 * wrapped.ts`) las use con datos ya leídos. Mismo patrón que `scoring.ts` /
 * `tournament-scoring.ts`.
 */

export type PredictionOutcome = 'exact' | 'correct' | 'wrong' | 'pending';

export interface StreakEntry {
  kickoffUtc: string;
  outcome: PredictionOutcome;
}

/**
 * Racha máxima de aciertos (exact|correct) consecutivos, ordenando por
 * kickoff asc. Cualquier otro outcome ('wrong'|'pending') corta la racha.
 */
export function longestStreak(entries: StreakEntry[]): number {
  const sorted = [...entries].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  let best = 0;
  let current = 0;
  for (const entry of sorted) {
    if (entry.outcome === 'exact' || entry.outcome === 'correct') {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

export interface ExactEntry {
  matchId: number;
  homeScore: number;
  awayScore: number;
}

/** % de miembros de la liga que pronosticaron exactamente ese resultado, si se conoce. */
export interface ForecastAggregate {
  matchId: number;
  pctPredicted: number;
}

export interface BestHit {
  matchId: number;
  homeScore: number;
  awayScore: number;
  /** % de gente que lo acertó, si había dato de forecast disponible. */
  rarity?: number;
}

/**
 * El pronóstico exacto "más raro" del usuario: el de menor % de gente que lo
 * predijo (si hay dato de aggregates), o en su defecto el de mayor cantidad
 * de goles totales (fallback determinístico — ver plan Sesión 5).
 */
export function bestHit(
  exactEntries: ExactEntry[],
  aggregates?: ForecastAggregate[],
): BestHit | null {
  if (exactEntries.length === 0) return null;

  if (aggregates && aggregates.length > 0) {
    const rarityByMatch = new Map(aggregates.map((a) => [a.matchId, a.pctPredicted]));
    const withRarity = exactEntries
      .filter((e) => rarityByMatch.has(e.matchId))
      .map((e) => ({ ...e, rarity: rarityByMatch.get(e.matchId)! }));

    if (withRarity.length > 0) {
      withRarity.sort((a, b) => a.rarity - b.rarity || a.matchId - b.matchId);
      return withRarity[0];
    }
  }

  const sorted = [...exactEntries].sort(
    (a, b) =>
      b.homeScore + b.awayScore - (a.homeScore + a.awayScore) || a.matchId - b.matchId,
  );
  return sorted[0];
}

export interface StandingRow {
  userId: number;
  points: number;
  position: number;
}

/**
 * Miembro (≠ yo) con menor |points - myPoints|. Empate ⇒ el de mejor
 * posición (menor `position`).
 */
export function nearestRival(
  myUserId: number,
  myPoints: number,
  standingRows: StandingRow[],
): StandingRow | null {
  const others = standingRows.filter((r) => r.userId !== myUserId);
  if (others.length === 0) return null;

  return others.reduce((best, row) => {
    const bestGap = Math.abs(best.points - myPoints);
    const rowGap = Math.abs(row.points - myPoints);
    if (rowGap < bestGap) return row;
    if (rowGap === bestGap && row.position < best.position) return row;
    return best;
  });
}

export interface PredictionPick {
  matchId: number;
  homeScore: number;
  awayScore: number;
}

export interface MatchTeams {
  id: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
}

/**
 * teamId que más veces aparece como ganador en los pronósticos del usuario.
 * Empates pronosticados no cuentan para ningún equipo. Desempate: menor
 * teamId, para que el resultado sea reproducible.
 */
export function mostPredictedTeam(
  predictions: PredictionPick[],
  matches: MatchTeams[],
): number | null {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const counts = new Map<number, number>();

  for (const pred of predictions) {
    const match = matchById.get(pred.matchId);
    if (!match) continue;

    let winnerTeamId: number | null = null;
    if (pred.homeScore > pred.awayScore) winnerTeamId = match.homeTeamId;
    else if (pred.awayScore > pred.homeScore) winnerTeamId = match.awayTeamId;
    if (winnerTeamId == null) continue;

    counts.set(winnerTeamId, (counts.get(winnerTeamId) ?? 0) + 1);
  }

  let bestTeamId: number | null = null;
  let bestCount = 0;
  for (const [teamId, cnt] of counts) {
    if (cnt > bestCount || (cnt === bestCount && bestTeamId != null && teamId < bestTeamId)) {
      bestTeamId = teamId;
      bestCount = cnt;
    }
  }
  return bestTeamId;
}
