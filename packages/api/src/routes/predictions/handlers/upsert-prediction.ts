import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, matches, leagueMembers } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { isLocked } from '../../../lib/match-helpers.js';
import { checkAchievements } from '../../../services/achievement-service.js';

export const upsertPredictionSchema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
  // When omitted, the prediction is applied to every league the user belongs to
  // (used for the user's very first prediction for a match). When provided,
  // only that league's prediction is created/updated.
  leagueId: z.number().int().positive().optional(),
});

export async function upsertPredictionHandler(req: Request, res: Response) {
  const { matchId, homeScore, awayScore, leagueId } =
    req.body as z.infer<typeof upsertPredictionSchema>;
  const userId = req.user!.id;

  // 1. Verify match exists and is not locked.
  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');
  if (isLocked(match.predictionLockUtc)) {
    throw new AppError('LOCKED', 'Prediction lock has passed for this match', 409);
  }

  // 2. Decide target leagues.
  //    - If leagueId is provided → verify membership and target only that league.
  //    - If omitted → apply to every league the user belongs to. This covers
  //      both the first-ever prediction (propagation) and bulk-update intent
  //      (the user wants the same score across all their leagues).
  const memberships = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  const userLeagueIds = memberships.map((m) => m.leagueId);

  if (userLeagueIds.length === 0) {
    throw new AppError(
      'NO_LEAGUE',
      'You must belong to at least one league to predict',
      400,
    );
  }

  let targetLeagueIds: number[];
  if (leagueId != null) {
    if (!userLeagueIds.includes(leagueId)) {
      throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
    }
    targetLeagueIds = [leagueId];
  } else {
    targetLeagueIds = userLeagueIds;
  }

  // 3. Upsert one row per target league.
  const results = [] as Awaited<ReturnType<typeof upsertOne>>[];
  for (const lid of targetLeagueIds) {
    const row = await upsertOne(userId, matchId, lid, homeScore, awayScore);
    results.push(row);
  }

  checkAchievements(req.user!.id, { type: 'prediction_saved', matchId }).catch(() => {});

  // Backwards-compat shape: when targeting a single league, return the row directly.
  if (results.length === 1) {
    return res.status(200).json(results[0]);
  }
  return res.status(200).json({ data: results });
}

async function upsertOne(
  userId: number,
  matchId: number,
  leagueId: number,
  homeScore: number,
  awayScore: number,
) {
  const [row] = await db
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
  return row;
}
