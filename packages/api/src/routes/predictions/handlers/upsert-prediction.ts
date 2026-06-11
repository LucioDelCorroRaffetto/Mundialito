import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, matches, leagueMembers } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { isLocked } from '../../../lib/match-helpers.js';
import { checkAchievements } from '../../../services/achievement-service.js';
import { ensurePersonalLeague } from '../../../lib/personal-league.js';

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
  let memberships = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  let userLeagueIds = memberships.map((m) => m.leagueId);

  // Self-heal: if the user somehow ended up with zero memberships (legacy
  // account from before personal leagues, or a backfill miss), provision
  // their personal league on the fly so the save can proceed instead of
  // throwing NO_LEAGUE.
  if (userLeagueIds.length === 0) {
    const personalId = await ensurePersonalLeague(userId);
    userLeagueIds = [personalId];
  }

  let targetLeagueIds: number[];
  if (leagueId != null) {
    if (!userLeagueIds.includes(leagueId)) {
      throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
    }
    // Auto-sanación: si el usuario no tiene predicción para este match en
    // alguna de sus otras ligas (típicamente porque se unió a esa liga
    // después de pronosticar), también la creamos allí — manteniendo la
    // invariante "una predicción por match propagada a todas mis ligas".
    // Las predicciones de otras ligas que YA existen no se tocan.
    const existing = await db
      .select({ leagueId: predictions.leagueId })
      .from(predictions)
      .where(and(eq(predictions.userId, userId), eq(predictions.matchId, matchId)));
    const existingSet = new Set(existing.map((e) => e.leagueId));
    const missingLeagues = userLeagueIds.filter((id) => id !== leagueId && !existingSet.has(id));
    targetLeagueIds = [leagueId, ...missingLeagues];
  } else {
    targetLeagueIds = userLeagueIds;
  }

  // 3. Upsert one row per target league.
  const results = [] as Awaited<ReturnType<typeof upsertOne>>[];
  for (const lid of targetLeagueIds) {
    const row = await upsertOne(userId, matchId, lid, homeScore, awayScore);
    results.push(row);
  }

  // Optional hint from the client: the user's local hour (0-23). Used for the
  // night_owl logro since the server doesn't know the user's timezone.
  const rawHour = req.header('x-user-hour');
  const userHour = rawHour != null && /^\d+$/.test(rawHour) ? Number(rawHour) : undefined;
  checkAchievements(req.user!.id, { type: 'prediction_saved', matchId, userHour })
    .catch(() => {});

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
