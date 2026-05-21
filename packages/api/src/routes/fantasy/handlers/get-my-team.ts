import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, players } from '../../../db/schema/index.js';

export async function getMyTeamHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, userId))
    .get();

  if (!team) {
    return res.json({ team: null, squad: [] });
  }

  const squad = await db
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

  return res.json({ team, squad });
}
