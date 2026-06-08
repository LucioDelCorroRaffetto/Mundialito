import { db } from '../db/client.js';

// Inline score calculation to avoid cross-package path issues.
// Keep in sync with packages/api/src/lib/scoring.ts.
interface PredictionInput {
  homeScore: number;
  awayScore: number;
}

interface MatchResult {
  homeScore: number;
  awayScore: number;
}

function calculatePoints(pred: PredictionInput, result: MatchResult): number {
  if (pred.homeScore === result.homeScore && pred.awayScore === result.awayScore) return 5;

  const predDiff = pred.homeScore - pred.awayScore;
  const resultDiff = result.homeScore - result.awayScore;

  // Empate acertado (no exacto) = 3 pts to match packages/api/src/lib/scoring.ts.
  // Previous value here was 1 pt, which would have silently underscored every
  // draw prediction had this worker re-activated.
  if (predDiff === 0 && resultDiff === 0) return 3;
  if (Math.sign(predDiff) !== Math.sign(resultDiff)) return 0;
  if (predDiff === resultDiff) return 3;
  return 1;
}

export async function finalizeMatch(
  matchId: number,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  console.log(`[finalize-match] Finalizing match ${matchId} — ${homeScore}:${awayScore}`);

  // 1. Update match status and scores
  await db.$client.execute({
    sql: `UPDATE matches SET status = 'finished', home_score = ?, away_score = ? WHERE id = ?`,
    args: [homeScore, awayScore, matchId],
  });

  // 2. Select all predictions for this match (across all leagues)
  const result = await db.$client.execute({
    sql: `SELECT id, home_score, away_score FROM predictions WHERE match_id = ?`,
    args: [matchId],
  });
  const preds = result.rows as unknown as Array<{
    id: number;
    home_score: number;
    away_score: number;
  }>;

  if (preds.length === 0) {
    console.log(`[finalize-match] No predictions found for match ${matchId}`);
    return;
  }

  // 3. Calculate and update points for each prediction
  let updated = 0;
  for (const pred of preds) {
    const points = calculatePoints(
      { homeScore: pred.home_score, awayScore: pred.away_score },
      { homeScore, awayScore },
    );

    await db.$client.execute({
      sql: `UPDATE predictions SET points = ? WHERE id = ?`,
      args: [points, pred.id],
    });
    updated++;
  }

  console.log(
    `[finalize-match] Done. Updated ${updated} prediction(s) for match ${matchId}.`,
  );
}
