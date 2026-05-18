import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, players } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export const updateSquadSchema = z.object({
  leagueId: z.number().int().positive(),
  playerIds: z.array(z.number().int().positive()).min(11).max(15),
});

export async function updateSquadHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { leagueId, playerIds } = req.body as z.infer<typeof updateSquadSchema>;

  // Validate players exist
  const existingPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(inArray(players.id, playerIds));

  if (existingPlayers.length !== playerIds.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more player IDs are invalid', 400);
  }

  // Get or create fantasy team
  await db
    .insert(fantasyTeams)
    .values({ userId, leagueId, name: 'Mi equipo' })
    .onConflictDoNothing();

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(and(eq(fantasyTeams.userId, userId), eq(fantasyTeams.leagueId, leagueId)))
    .get();

  if (!team) {
    throw new AppError('INTERNAL_ERROR', 'Could not find or create fantasy team', 500);
  }

  // Replace squad in a transaction
  const updatedSquad = await db.transaction(async (tx) => {
    // Delete all existing squad players
    await tx
      .delete(fantasySquadPlayers)
      .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));

    // Insert new squad players
    if (playerIds.length > 0) {
      await tx.insert(fantasySquadPlayers).values(
        playerIds.map((playerId) => ({
          fantasyTeamId: team.id,
          playerId,
          isStarter: false,
          isCaptain: false,
          isViceCaptain: false,
        })),
      );
    }

    // Return the updated squad with player details
    return tx
      .select({
        id: players.id,
        teamId: players.teamId,
        name: players.name,
        position: players.position,
        shirtNumber: players.shirtNumber,
        isStarter: fantasySquadPlayers.isStarter,
        isCaptain: fantasySquadPlayers.isCaptain,
        isViceCaptain: fantasySquadPlayers.isViceCaptain,
      })
      .from(fantasySquadPlayers)
      .innerJoin(players, eq(fantasySquadPlayers.playerId, players.id))
      .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));
  });

  return res.json({ team, squad: updatedSquad });
}
