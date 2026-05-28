import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers, predictions } from '../../../db/schema/index.js';
import { and, eq, inArray, sql } from 'drizzle-orm';

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

  // Per-league points: aggregate the user's predictions scoped by league.
  const perLeague = await db
    .select({
      leagueId: predictions.leagueId,
      totalPoints: sql<number>`coalesce(sum(${predictions.points}), 0)`.as('total_points'),
      matchesPlayed: sql<number>`count(${predictions.points})`.as('matches_played'),
    })
    .from(predictions)
    .where(and(eq(predictions.userId, userId), inArray(predictions.leagueId, leagueIds)))
    .groupBy(predictions.leagueId);

  const pointsByLeague = new Map<number, { total: number; played: number }>(
    perLeague.map((r) => [
      r.leagueId,
      { total: Number(r.totalPoints), played: Number(r.matchesPlayed) },
    ]),
  );

  const data = rows.map((r) => {
    const stats = pointsByLeague.get(r.league.id) ?? { total: 0, played: 0 };
    return {
      ...r.league,
      memberCount: memberCountMap.get(r.league.id) ?? 1,
      myPoints: stats.total,
      myMatchesPlayed: stats.played,
    };
  });

  return res.json({ data, meta: { total: data.length } });
}
