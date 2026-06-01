import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, players, fantasyLineups } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export const updateSquadSchema = z.object({
  playerIds: z.array(z.number().int().positive()).min(11).max(15),
  // starterIds and captainId are optional for backward-compat with old clients.
  // If omitted the handler picks sensible defaults.
  starterIds: z.array(z.number().int().positive()).length(11).optional(),
  captainId: z.number().int().positive().optional(),
});

export async function updateSquadHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { playerIds } = req.body as z.infer<typeof updateSquadSchema>;
  let { starterIds, captainId } = req.body as z.infer<typeof updateSquadSchema>;

  // Default starterIds: first 11 of playerIds if not supplied.
  if (!starterIds || starterIds.length === 0) {
    starterIds = playerIds.slice(0, 11);
  }
  // Default captainId: first starter if not supplied.
  if (!captainId) {
    captainId = starterIds[0];
  }

  // No duplicate player IDs.
  if (new Set(playerIds).size !== playerIds.length) {
    throw new AppError('VALIDATION_ERROR', 'playerIds contains duplicates', 400);
  }
  if (new Set(starterIds).size !== starterIds.length) {
    throw new AppError('VALIDATION_ERROR', 'starterIds contains duplicates', 400);
  }

  // Starters must be a subset of playerIds.
  const playerIdSet = new Set(playerIds);
  if (!starterIds.every((id) => playerIdSet.has(id))) {
    throw new AppError('VALIDATION_ERROR', 'starterIds must be a subset of playerIds', 400);
  }

  // Captain must be one of the starters.
  if (!starterIds.includes(captainId)) {
    throw new AppError('VALIDATION_ERROR', 'captainId must be one of the starters', 400);
  }

  // Validate players exist.
  const existingPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(inArray(players.id, playerIds));

  if (existingPlayers.length !== playerIds.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more player IDs are invalid', 400);
  }

  // Upsert global fantasy team — one per user.
  await db
    .insert(fantasyTeams)
    .values({ userId, name: 'Mi equipo' })
    .onConflictDoNothing();

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, userId))
    .get();

  if (!team) {
    throw new AppError('INTERNAL_ERROR', 'Could not find or create fantasy team', 500);
  }

  const starterIdSet = new Set(starterIds);

  // Replace squad in a transaction.
  const updatedSquad = await db.transaction(async (tx) => {
    await tx
      .delete(fantasySquadPlayers)
      .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));

    // Drop any per-round lineup rows referencing players no longer in the
    // squad. Without this, the next /fantasy/lineup/:round save fails
    // validation because the lineup still points at a dropped player.
    await tx
      .delete(fantasyLineups)
      .where(
        and(
          eq(fantasyLineups.userId, userId),
          notInArray(fantasyLineups.playerId, playerIds),
        ),
      );

    await tx.insert(fantasySquadPlayers).values(
      playerIds.map((playerId) => ({
        fantasyTeamId: team.id,
        playerId,
        isStarter: starterIdSet.has(playerId),
        isCaptain: playerId === captainId,
        isViceCaptain: false,
      })),
    );

    return tx
      .select({
        id: players.id,
        teamId: players.teamId,
        name: players.name,
        position: players.position,
        shirtNumber: players.shirtNumber,
        photoUrl: players.photoUrl,
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
