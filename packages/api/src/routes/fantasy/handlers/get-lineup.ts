import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { fantasyLineups, players, teams, fantasyRoundScores } from '../../../db/schema/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { AppError } from '../../../lib/errors.js';
import { FANTASY_ROUNDS } from '../../../lib/fantasy-rounds.js';

export async function getMyLineupHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const round = req.params.round;

  if (!FANTASY_ROUNDS.find((r) => r.slug === round)) {
    throw new AppError('VALIDATION', `Unknown fantasy round: ${round}`, 400);
  }

  const lineupRows = await db
    .select()
    .from(fantasyLineups)
    .where(and(eq(fantasyLineups.userId, userId), eq(fantasyLineups.round, round as string)));

  if (lineupRows.length === 0) return res.json({ data: null, meta: { round } });

  const playerIds = lineupRows.map((r) => r.playerId);
  const playerData = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      teamId: players.teamId,
      teamCode: teams.code,
      teamFlag: teams.flag,
      teamName: teams.name,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(inArray(players.id, playerIds));
  const playerMap = new Map(playerData.map((p) => [p.id, p]));

  const roundScore = await db
    .select({ points: fantasyRoundScores.points })
    .from(fantasyRoundScores)
    .where(and(eq(fantasyRoundScores.userId, userId), eq(fantasyRoundScores.round, round as string)))
    .get();

  const data = lineupRows.map((row) => ({
    playerId: row.playerId,
    isStarter: row.isStarter,
    isCaptain: row.isCaptain,
    isViceCaptain: row.isViceCaptain,
    player: playerMap.get(row.playerId) ?? null,
  }));

  return res.json({
    data,
    meta: { round, points: roundScore?.points ?? 0 },
  });
}
