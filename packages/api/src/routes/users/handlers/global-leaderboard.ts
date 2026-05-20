import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, users, leagueMembers } from '../../../db/schema/index.js';
import { eq, sql, desc } from 'drizzle-orm';

export async function globalLeaderboardHandler(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  // Aggregate total points per user across ALL leagues
  // predictionCount = number of predictions with non-null points (i.e. scored matches)
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      totalPoints: sql<number>`coalesce(sum(${predictions.points}), 0)`,
      predictionCount: sql<number>`count(${predictions.id})`,
    })
    .from(users)
    .leftJoin(predictions, eq(predictions.userId, users.id))
    .groupBy(users.id, users.username, users.avatarUrl)
    .orderBy(desc(sql`coalesce(sum(${predictions.points}), 0)`))
    .limit(limit)
    .offset(offset);

  // Count distinct leagues per user
  const leagueCounts = await db
    .select({
      userId: leagueMembers.userId,
      leagueCount: sql<number>`count(distinct ${leagueMembers.leagueId})`,
    })
    .from(leagueMembers)
    .groupBy(leagueMembers.userId);

  const leagueCountByUser = new Map(leagueCounts.map((r) => [r.userId, r.leagueCount]));

  // Assign ranks (shared rank for ties)
  let rank = 0;
  let lastPoints = -1;
  const data = rows.map((row, idx) => {
    const pts = Number(row.totalPoints);
    if (pts !== lastPoints) {
      rank = offset + idx + 1;
      lastPoints = pts;
    }
    return {
      rank,
      userId: row.userId,
      username: row.username,
      avatarUrl: row.avatarUrl,
      totalPoints: pts,
      leagueCount: leagueCountByUser.get(row.userId) ?? 0,
      predictionCount: Number(row.predictionCount),
    };
  });

  return res.json({ data, meta: { limit, offset, total: data.length } });
}
