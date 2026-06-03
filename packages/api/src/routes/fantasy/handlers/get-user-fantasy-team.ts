import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, fantasyLineups, players } from '../../../db/schema/index.js';
import { computeFantasyPointsByPlayer } from '../../../services/fantasy-scoring-service.js';
import { getCurrentFantasyRound } from '../../../lib/fantasy-rounds.js';
import { AppError } from '../../../lib/errors.js';

/**
 * GET /fantasy/team/:userId
 * Returns any user's fantasy team — the 15-player squad with their starter
 * flags overlaid from the lineup of the currently-active round.
 *
 * Same fix as get-my-team.ts: `fantasy_squad_players` flags are stale
 * initial picks; the source of truth for "who's starting this round" is
 * `fantasy_lineups`.
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
    return res.json({ team: null, squad: [], round: null });
  }

  const activeRound = getCurrentFantasyRound();
  const roundSlug = activeRound?.slug ?? 'final';

  const lineupRows = await db
    .select({
      playerId: fantasyLineups.playerId,
      isStarter: fantasyLineups.isStarter,
      isCaptain: fantasyLineups.isCaptain,
      isViceCaptain: fantasyLineups.isViceCaptain,
    })
    .from(fantasyLineups)
    .where(and(eq(fantasyLineups.userId, targetUserId), eq(fantasyLineups.round, roundSlug)));
  const lineupByPlayer = new Map(lineupRows.map((r) => [r.playerId, r]));

  const squadRows = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      name: players.name,
      position: players.position,
      shirtNumber: players.shirtNumber,
      photoUrl: players.photoUrl,
    })
    .from(fantasySquadPlayers)
    .innerJoin(players, eq(fantasySquadPlayers.playerId, players.id))
    .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));

  const pointsByPlayer = await computeFantasyPointsByPlayer();

  const squad = squadRows.map((p) => {
    const lineup = lineupByPlayer.get(p.id);
    const isStarter = lineup?.isStarter ?? false;
    const isCaptain = lineup?.isCaptain ?? false;
    const isViceCaptain = lineup?.isViceCaptain ?? false;
    const basePts = pointsByPlayer.get(p.id) ?? 0;
    let fantasyPoints = 0;
    if (isStarter) {
      fantasyPoints = isCaptain ? basePts * 2 : basePts;
    }
    return { ...p, isStarter, isCaptain, isViceCaptain, fantasyPoints };
  });

  return res.json({ team, squad, round: roundSlug });
}
