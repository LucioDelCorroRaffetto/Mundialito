import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, players } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export async function getMyTeamHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const leagueId = Number(req.query.leagueId);
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    throw new AppError('VALIDATION_ERROR', 'leagueId query param is required and must be a positive integer', 400);
  }

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(and(eq(fantasyTeams.userId, userId), eq(fantasyTeams.leagueId, leagueId)))
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
      isStarter: fantasySquadPlayers.isStarter,
      isCaptain: fantasySquadPlayers.isCaptain,
      isViceCaptain: fantasySquadPlayers.isViceCaptain,
    })
    .from(fantasySquadPlayers)
    .innerJoin(players, eq(fantasySquadPlayers.playerId, players.id))
    .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));

  return res.json({ team, squad });
}
