import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, predictionScorers } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';

export async function getScorersHandler(req: Request, res: Response) {
  const rawMatchId = req.query.matchId;
  const rawLeagueId = req.query.leagueId;

  if (!rawMatchId || !rawLeagueId) {
    throw new AppError('VALIDATION_ERROR', 'matchId and leagueId query parameters are required', 400);
  }

  const matchId = Number(rawMatchId);
  const leagueId = Number(rawLeagueId);

  if (!Number.isInteger(matchId) || matchId <= 0 || !Number.isInteger(leagueId) || leagueId <= 0) {
    throw new AppError('VALIDATION_ERROR', 'matchId and leagueId must be positive integers', 400);
  }

  const userId = req.user!.id;

  const prediction = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.userId, userId),
        eq(predictions.matchId, matchId),
        eq(predictions.leagueId, leagueId),
      ),
    )
    .get();

  if (!prediction) throw new NotFoundError('Prediction');

  const scorers = await db
    .select()
    .from(predictionScorers)
    .where(eq(predictionScorers.predictionId, prediction.id));

  return res.status(200).json({ data: scorers });
}
