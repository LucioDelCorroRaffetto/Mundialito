import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, matches } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { isLocked } from '../../../lib/match-helpers.js';
import { checkAchievements } from '../../../services/achievement-service.js';

export const upsertPredictionSchema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

export async function upsertPredictionHandler(req: Request, res: Response) {
  const { matchId, homeScore, awayScore } = req.body as z.infer<typeof upsertPredictionSchema>;
  const userId = req.user!.id;

  // 1. Verify match exists and is not locked
  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');
  if (isLocked(match.predictionLockUtc)) {
    throw new AppError('LOCKED', 'Prediction lock has passed for this match', 409);
  }

  // 2. Upsert — one prediction per (userId, matchId), no league constraint
  const [result] = await db
    .insert(predictions)
    .values({ userId, matchId, homeScore, awayScore })
    .onConflictDoUpdate({
      target: [predictions.userId, predictions.matchId],
      set: {
        homeScore,
        awayScore,
        updatedAt: sql`(datetime('now'))`,
      },
    })
    .returning();

  checkAchievements(req.user!.id, { type: 'prediction_saved', matchId }).catch(() => {});

  return res.status(200).json(result);
}
