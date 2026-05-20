import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, matches } from '../../../db/schema/index.js';

export async function myStatsHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  // Fetch all predictions for this user joined with finished matches
  const rows = await db
    .select({
      predHomeScore: predictions.homeScore,
      predAwayScore: predictions.awayScore,
      points: predictions.points,
      matchHomeScore: matches.homeScore,
      matchAwayScore: matches.awayScore,
      matchStatus: matches.status,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.userId, userId), eq(matches.status, 'finished')));

  const totalPredictions = rows.length;

  let exactScores = 0;
  let correctResults = 0;
  let totalPoints = 0;

  for (const row of rows) {
    const pts = row.points ?? 0;
    totalPoints += pts;

    if (
      row.matchHomeScore !== null &&
      row.matchAwayScore !== null &&
      row.predHomeScore === row.matchHomeScore &&
      row.predAwayScore === row.matchAwayScore
    ) {
      exactScores++;
    } else if (pts > 0) {
      // Correct result (correct winner / draw) but not exact score
      correctResults++;
    }
  }

  const accuracy = totalPredictions > 0 ? Math.round((exactScores / totalPredictions) * 100) : 0;

  return res.json({
    data: {
      totalPredictions,
      exactScores,
      correctResults,
      totalPoints,
      accuracy,
    },
  });
}
