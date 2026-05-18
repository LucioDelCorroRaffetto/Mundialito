import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { tournamentPredictions } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export async function getTournamentPredictionHandler(req: Request, res: Response) {
  const rawLeagueId = req.query.leagueId;
  if (!rawLeagueId) {
    throw new AppError('VALIDATION_ERROR', 'leagueId query parameter is required', 400);
  }

  const leagueId = Number(rawLeagueId);
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    throw new AppError('VALIDATION_ERROR', 'leagueId must be a positive integer', 400);
  }

  const userId = req.user!.id;

  const prediction = await db
    .select()
    .from(tournamentPredictions)
    .where(
      and(
        eq(tournamentPredictions.userId, userId),
        eq(tournamentPredictions.leagueId, leagueId),
      ),
    )
    .get();

  return res.status(200).json(prediction ?? {});
}
