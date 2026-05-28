import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { tournamentPredictions, leagueMembers } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export const upsertTournamentPredictionSchema = z.object({
  // When omitted, the prediction is written to every league the user belongs
  // to (used for the first-ever pick or a bulk update across leagues).
  // When provided, only that league's pick is touched.
  leagueId: z.number().int().positive().optional(),
  championTeamId: z.number().int().positive().nullable().optional(),
  runnerUpTeamId: z.number().int().positive().nullable().optional(),
  topScorerPlayerId: z.number().int().positive().nullable().optional(),
  revelationTeamId: z.number().int().positive().nullable().optional(),
  surpriseEliminatedTeamId: z.number().int().positive().nullable().optional(),
});

export async function upsertTournamentPredictionHandler(req: Request, res: Response) {
  const {
    leagueId,
    championTeamId,
    runnerUpTeamId,
    topScorerPlayerId,
    revelationTeamId,
    surpriseEliminatedTeamId,
  } = req.body as z.infer<typeof upsertTournamentPredictionSchema>;

  const userId = req.user!.id;

  // Resolve target leagues — same rule as /predictions: leagueId == one liga,
  // omitted == every league the user belongs to.
  const memberships = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  const userLeagueIds = memberships.map((m) => m.leagueId);

  if (userLeagueIds.length === 0) {
    throw new AppError('NO_LEAGUE', 'You must belong to at least one league to predict', 400);
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

  const results = [] as any[];
  for (const lid of targetLeagueIds) {
    const [row] = await db
      .insert(tournamentPredictions)
      .values({
        userId,
        leagueId: lid,
        championTeamId,
        runnerUpTeamId,
        topScorerPlayerId,
        revelationTeamId,
        surpriseEliminatedTeamId,
      })
      .onConflictDoUpdate({
        target: [tournamentPredictions.userId, tournamentPredictions.leagueId],
        set: {
          championTeamId,
          runnerUpTeamId,
          topScorerPlayerId,
          revelationTeamId,
          surpriseEliminatedTeamId,
          updatedAt: sql`(datetime('now'))`,
        },
      })
      .returning();
    results.push(row);
  }

  // Preserve the legacy single-object response shape when one league was targeted.
  if (results.length === 1) {
    return res.status(200).json(results[0]);
  }
  return res.status(200).json({ data: results });
}
