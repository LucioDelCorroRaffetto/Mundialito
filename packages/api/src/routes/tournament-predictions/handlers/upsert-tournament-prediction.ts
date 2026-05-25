import { Request, Response } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { tournamentPredictions } from '../../../db/schema/index.js';

export const upsertTournamentPredictionSchema = z.object({
  leagueId: z.number().int().positive(),
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

  const [result] = await db
    .insert(tournamentPredictions)
    .values({
      userId,
      leagueId,
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

  return res.status(200).json(result);
}
