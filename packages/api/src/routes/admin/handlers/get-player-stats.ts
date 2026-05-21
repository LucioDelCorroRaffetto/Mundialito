import { Request, Response } from 'express';
import { eq, or } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches, players, playerMatchStats } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

/**
 * GET /admin/matches/:matchId/player-stats
 *
 * Returns the players of both teams in the match plus any saved stats,
 * to populate the admin stats form.
 */
export async function getPlayerStatsHandler(req: Request, res: Response) {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid match id' } });
  }

  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');

  const teamIds = [match.homeTeamId, match.awayTeamId].filter(
    (id): id is number => id !== null && id !== undefined,
  );

  const matchPlayers = teamIds.length
    ? await db
        .select({
          id: players.id,
          name: players.name,
          position: players.position,
          teamId: players.teamId,
          shirtNumber: players.shirtNumber,
        })
        .from(players)
        .where(
          teamIds.length === 1
            ? eq(players.teamId, teamIds[0])
            : or(...teamIds.map((id) => eq(players.teamId, id))),
        )
    : [];

  const stats = await db
    .select({
      playerId: playerMatchStats.playerId,
      played: playerMatchStats.played,
      goals: playerMatchStats.goals,
      assists: playerMatchStats.assists,
      yellowCards: playerMatchStats.yellowCards,
      redCard: playerMatchStats.redCard,
    })
    .from(playerMatchStats)
    .where(eq(playerMatchStats.matchId, matchId));

  return res.json({ data: { players: matchPlayers, stats } });
}
