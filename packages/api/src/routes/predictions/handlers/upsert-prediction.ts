import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, matches, leagueMembers } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { isLocked } from '../../../lib/match-helpers.js';

export const upsertPredictionSchema = z.object({
  matchId: z.number().int().positive(),
  leagueId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

export async function upsertPredictionHandler(req: Request, res: Response) {
  const { matchId, leagueId, homeScore, awayScore } = req.body as z.infer<typeof upsertPredictionSchema>;
  const userId = req.user!.id;

  // 1. Verificar que el partido exista y no esté bloqueado
  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');
  if (isLocked(match.predictionLockUtc)) {
    throw new AppError('LOCKED', 'Prediction lock has passed for this match', 409);
  }

  // 2. Verificar que el user sea miembro de la liga
  const membership = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .get();
  if (!membership) {
    throw new AppError('FORBIDDEN', 'You are not a member of this league', 403);
  }

  // 3. Upsert atómico vía ON CONFLICT DO UPDATE — evita race conditions
  //    entre SELECT y INSERT/UPDATE concurrentes para el mismo (userId, matchId, leagueId).
  const [result] = await db
    .insert(predictions)
    .values({ userId, matchId, leagueId, homeScore, awayScore })
    .onConflictDoUpdate({
      target: [predictions.userId, predictions.matchId, predictions.leagueId],
      set: {
        homeScore,
        awayScore,
        updatedAt: sql`(datetime('now'))`,
      },
    })
    .returning();

  return res.status(200).json(result);
}
