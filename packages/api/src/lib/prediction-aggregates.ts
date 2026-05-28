/**
 * User-level prediction aggregates.
 *
 * Predictions are stored per (user, match, league). For user-scoped stats
 * (profile, global leaderboard, my-stats) we don't want to count the same
 * match multiple times when a user belongs to several leagues. The convention
 * adopted here is "best of": for each match, keep the row with the highest
 * `points`. Rows with `null` points (unscored matches) are kept only if no
 * scored row exists for that match.
 */
export interface MatchPredictionRow {
  matchId: number;
  points: number | null;
}

export function dedupeBestPerMatch<T extends MatchPredictionRow>(rows: T[]): T[] {
  const byMatch = new Map<number, T>();
  for (const row of rows) {
    const existing = byMatch.get(row.matchId);
    if (!existing) {
      byMatch.set(row.matchId, row);
      continue;
    }
    const a = existing.points ?? -Infinity;
    const b = row.points ?? -Infinity;
    if (b > a) byMatch.set(row.matchId, row);
  }
  return [...byMatch.values()];
}
