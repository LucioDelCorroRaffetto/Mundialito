import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches, players, playerMatchStats } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { recomputeAllFantasyPoints } from '../../../services/fantasy-scoring-service.js';

export const updatePlayerStatsSchema = z.object({
  stats: z.array(
    z.object({
      playerId: z.number().int().positive(),
      played: z.boolean(),
      goals: z.number().int().min(0).max(30),
      assists: z.number().int().min(0).max(30),
      yellowCards: z.number().int().min(0).max(2),
      redCard: z.boolean(),
    }),
  ),
});

/**
 * PUT /admin/matches/:matchId/player-stats
 *
 * Upserts player stats for a match, then triggers a full fantasy recompute.
 */
export async function updatePlayerStatsHandler(req: Request, res: Response) {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid match id' } });
  }

  const parsed = updatePlayerStatsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }

  const { stats } = parsed.data;

  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');

  if (stats.length > 0) {
    const playerIds = stats.map((s) => s.playerId);
    const existingPlayers = await db
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.id, playerIds));

    if (existingPlayers.length !== new Set(playerIds).size) {
      throw new AppError('VALIDATION_ERROR', 'One or more player IDs are invalid', 400);
    }
  }

  for (const s of stats) {
    await db
      .insert(playerMatchStats)
      .values({
        matchId,
        playerId: s.playerId,
        played: s.played,
        goals: s.goals,
        assists: s.assists,
        yellowCards: s.yellowCards,
        redCard: s.redCard,
      })
      .onConflictDoUpdate({
        target: [playerMatchStats.matchId, playerMatchStats.playerId],
        set: {
          played: s.played,
          goals: s.goals,
          assists: s.assists,
          yellowCards: s.yellowCards,
          redCard: s.redCard,
        },
      });
  }

  // Recompute fantasy points after stats change.
  await recomputeAllFantasyPoints();

  return res.json({ data: { updated: stats.length } });
}
