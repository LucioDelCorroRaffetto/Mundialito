import { Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, leagueMembers, predictionReactions } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export async function matchReactionsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const matchId = Number(req.params.matchId);
  const leagueId = Number(req.query.leagueId);

  if (!Number.isInteger(matchId) || !Number.isInteger(leagueId) || leagueId <= 0) {
    throw new AppError('VALIDATION', 'matchId and leagueId are required', 400);
  }

  const membership = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .get();
  if (!membership) {
    throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
  }

  const rows = await db
    .select({
      predictionId: predictionReactions.predictionId,
      emoji: predictionReactions.emoji,
      count: sql<number>`count(*)`,
      reactedByMe: sql<number>`sum(case when ${predictionReactions.userId} = ${userId} then 1 else 0 end)`,
    })
    .from(predictionReactions)
    .innerJoin(predictions, eq(predictionReactions.predictionId, predictions.id))
    .where(and(eq(predictions.matchId, matchId), eq(predictions.leagueId, leagueId)))
    .groupBy(predictionReactions.predictionId, predictionReactions.emoji);

  const data = rows.map((row) => ({
    predictionId: row.predictionId,
    emoji: row.emoji,
    count: Number(row.count),
    reactedByMe: Number(row.reactedByMe) > 0,
  }));

  return res.json({ data });
}
