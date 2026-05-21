import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers, predictions } from '../../../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

export async function listMineHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  // Get all leagues the user belongs to
  const rows = await db
    .select({ league: leagues })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, userId));

  if (rows.length === 0) {
    return res.json({ data: [], meta: { total: 0 } });
  }

  const leagueIds = rows.map((r) => r.league.id);

  // Member counts per league
  const memberCounts = await db
    .select({
      leagueId: leagueMembers.leagueId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(leagueMembers)
    .where(
      leagueIds.length === 1
        ? eq(leagueMembers.leagueId, leagueIds[0])
        : sql`${leagueMembers.leagueId} IN (${sql.join(leagueIds.map((id) => sql`${id}`), sql`, `)})`
    )
    .groupBy(leagueMembers.leagueId);

  const memberCountMap = new Map<number, number>(
    memberCounts.map((r) => [r.leagueId, r.count])
  );

  // Global predictions: total points are the same across all leagues
  // (one prediction per match counts for every league the user is in)
  const [globalPoints] = await db
    .select({
      totalPoints: sql<number>`coalesce(sum(${predictions.points}), 0)`.as('total_points'),
      matchesPlayed: sql<number>`count(${predictions.points})`.as('matches_played'),
    })
    .from(predictions)
    .where(eq(predictions.userId, userId));

  const myTotal = globalPoints?.totalPoints ?? 0;
  const myMatchesPlayed = globalPoints?.matchesPlayed ?? 0;

  const data = rows.map((r) => ({
    ...r.league,
    memberCount: memberCountMap.get(r.league.id) ?? 1,
    myPoints: myTotal,
    myMatchesPlayed,
  }));

  return res.json({ data, meta: { total: data.length } });
}
