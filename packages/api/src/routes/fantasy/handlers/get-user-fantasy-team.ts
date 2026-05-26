import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, players } from '../../../db/schema/index.js';
import { computeFantasyPointsByPlayer } from '../../../services/fantasy-scoring-service.js';
import { AppError } from '../../../lib/errors.js';

/**
 * GET /fantasy/team/:userId
 * Returns the fantasy team of any user (read-only, visible to all authenticated users).
 */
export async function getUserFantasyTeamHandler(req: Request, res: Response) {
  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Invalid userId', 400);
  }

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, targetUserId))
    .get();

  if (!team) {
    return res.json({ team: null, squad: [] });
  }

  const squadRows = await db
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

  const pointsByPlayer = await computeFantasyPointsByPlayer();

  const squad = squadRows.map((p) => {
    const basePts = pointsByPlayer.get(p.id) ?? 0;
    let fantasyPoints = 0;
    if (p.isStarter) {
      fantasyPoints = p.isCaptain ? basePts * 2 : basePts;
    }
    return { ...p, fantasyPoints };
  });

  return res.json({ team, squad });
}
