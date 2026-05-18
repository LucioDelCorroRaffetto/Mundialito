import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, predictionScorers } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';

export const upsertScorersSchema = z.object({
  matchId: z.number().int().positive(),
  leagueId: z.number().int().positive(),
  scorers: z
    .array(
      z.object({
        playerId: z.number().int().positive(),
        teamId: z.number().int().positive(),
      }),
    )
    .max(4, 'Maximum 4 scorers allowed'),
});

export async function upsertScorersHandler(req: Request, res: Response) {
  const { matchId, leagueId, scorers } = req.body as z.infer<typeof upsertScorersSchema>;
  const userId = req.user!.id;

  // Find the prediction for this user/match/league
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

  if (scorers.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'scorers array cannot be empty', 400);
  }

  // Full replace inside a transaction: delete existing then insert new ones
  const inserted = await db.transaction(async (tx) => {
    await tx
      .delete(predictionScorers)
      .where(eq(predictionScorers.predictionId, prediction.id));

    const newRows = await tx
      .insert(predictionScorers)
      .values(
        scorers.map(({ playerId }) => ({
          predictionId: prediction.id,
          playerId,
        })),
      )
      .returning();

    return newRows;
  });

  return res.status(200).json({ data: inserted });
}
