import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';

export async function myPredictionForMatchHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const matchId = Number(req.params.matchId);
  const leagueIdRaw = req.query.leagueId;

  if (!Number.isInteger(matchId) || matchId <= 0) {
    throw new NotFoundError('Prediction');
  }

  const conditions = [
    eq(predictions.userId, userId),
    eq(predictions.matchId, matchId),
  ];

  if (leagueIdRaw != null && leagueIdRaw !== '') {
    const leagueId = Number(leagueIdRaw);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      throw new AppError('VALIDATION', 'leagueId must be a positive integer', 400);
    }
    conditions.push(eq(predictions.leagueId, leagueId));

    const prediction = await db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .get();
    return res.json({ data: prediction ?? null });
  }

  // No leagueId provided — return any one of the user's predictions for the match
  // (they're typically all identical right after the first save). Useful for views
  // that aren't scoped to a particular league.
  const prediction = await db
    .select()
    .from(predictions)
    .where(and(...conditions))
    .limit(1)
    .get();

  return res.json({ data: prediction ?? null });
}
