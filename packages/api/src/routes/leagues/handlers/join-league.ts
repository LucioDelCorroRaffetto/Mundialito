import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers, predictions, tournamentPredictions } from '../../../db/schema/index.js';
import { NotFoundError, ConflictError, AppError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';
import { checkAchievements } from '../../../services/achievement-service.js';

export const joinLeagueSchema = z.object({
  code: z.string().min(4).max(12),
});

export async function joinLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { code } = req.body as z.infer<typeof joinLeagueSchema>;

  const league = await db.select().from(leagues).where(eq(leagues.code, code.toUpperCase())).get();
  if (!league) throw new NotFoundError('League');

  // Personal leagues are auto-provisioned hidden containers — they're not
  // joinable by other people even if the code somehow leaks.
  if (league.isPersonal) {
    throw new AppError('NOT_JOINABLE', 'Esta liga no es pública', 403);
  }

  // Atomic check-and-insert via ON CONFLICT DO NOTHING + .returning() so
  // two simultaneous joins for the same (user, league) collapse to a clean
  // 409 instead of letting one of them surface the raw UNIQUE constraint
  // violation as a 500.
  const insertedRows = await db
    .insert(leagueMembers)
    .values({ leagueId: league.id, userId })
    .onConflictDoNothing()
    .returning({ id: leagueMembers.id });
  if (insertedRows.length === 0) {
    // The conflict path means the user is already a member — translate to
    // the proper 409. Use `and` so a stray membership in another league
    // doesn't false-positive.
    const existing = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId)))
      .get();
    if (existing) throw new ConflictError('Already a member of this league');
    throw new AppError('JOIN_FAILED', 'No se pudo unir a la liga', 500);
  }

  // Carry the user's prior match predictions into the new league. We pick
  // any one row per match the user already has (predictions are mirrored
  // across leagues, so the values are the same) and re-insert them tagged
  // with the new league id. Same for the single tournament prediction.
  // Idempotent: ON CONFLICT DO NOTHING.
  try {
    const myPredictions = await db
      .select({
        matchId: predictions.matchId,
        homeScore: predictions.homeScore,
        awayScore: predictions.awayScore,
      })
      .from(predictions)
      .where(eq(predictions.userId, userId));
    // Dedupe by matchId — keep the most recent (last seen).
    const byMatch = new Map<number, { homeScore: number; awayScore: number }>();
    for (const p of myPredictions) byMatch.set(p.matchId, p);

    if (byMatch.size > 0) {
      await db
        .insert(predictions)
        .values(
          [...byMatch.entries()].map(([matchId, p]) => ({
            userId,
            matchId,
            leagueId: league.id,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
          })),
        )
        .onConflictDoNothing();
    }

    const myTp = await db
      .select()
      .from(tournamentPredictions)
      .where(eq(tournamentPredictions.userId, userId))
      .limit(1)
      .get();
    if (myTp) {
      await db
        .insert(tournamentPredictions)
        .values({
          userId,
          leagueId: league.id,
          championTeamId: myTp.championTeamId,
          runnerUpTeamId: myTp.runnerUpTeamId,
          thirdPlaceTeamId: myTp.thirdPlaceTeamId,
          topScorerPlayerId: myTp.topScorerPlayerId,
          revelationTeamId: myTp.revelationTeamId,
          surpriseEliminatedTeamId: myTp.surpriseEliminatedTeamId,
          bestDefenseTeamId: myTp.bestDefenseTeamId,
        })
        .onConflictDoNothing();
    }
  } catch (err) {
    // Carry-over is best-effort. The join itself succeeded, so we don't
    // want to roll back over a duplicate-key edge case. Log and move on.
    console.error('[join-league] prediction carry-over failed:', err);
  }

  checkAchievements(userId, { type: 'league_joined', leagueId: league.id }).catch(() => {});
  return res.status(201).json(league);
}
