import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

export async function myPredictionForMatchHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const matchId = Number(req.params.matchId);
  const leagueId = Number(req.query.leagueId);
  if (!Number.isInteger(matchId) || !Number.isInteger(leagueId)) {
    throw new NotFoundError('Prediction');
  }

  const prediction = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.userId, userId),
        eq(predictions.matchId, matchId),
        eq(predictions.leagueId, leagueId)
      )
    )
    .get();

  if (!prediction) throw new NotFoundError('Prediction');
  return res.json(prediction);
}
