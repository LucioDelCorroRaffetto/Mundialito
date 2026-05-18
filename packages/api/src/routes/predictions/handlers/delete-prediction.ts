import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, matches } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { isLocked } from '../../../lib/match-helpers.js';

export async function deletePredictionHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('Prediction');

  const prediction = await db.select().from(predictions).where(eq(predictions.id, id)).get();
  if (!prediction) throw new NotFoundError('Prediction');
  if (prediction.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Cannot delete another user\'s prediction', 403);
  }

  const match = await db.select().from(matches).where(eq(matches.id, prediction.matchId)).get();
  if (match && isLocked(match.predictionLockUtc)) {
    throw new AppError('LOCKED', 'Cannot delete a locked prediction', 409);
  }

  await db.delete(predictions).where(eq(predictions.id, id));
  return res.status(204).send();
}
