import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, users, leagueMembers, userAchievements, achievements } from '../../../db/schema/index.js';
import { eq, sql, desc, inArray } from 'drizzle-orm';

// Tier priority for picking the "top" badge (higher = better)
const TIER_PRIORITY: Record<string, number> = {
  platinum: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

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

  // Fetch all achievements earned by the users on this page
  const userIds = rows.map((r) => r.userId);
  let badgesByUser = new Map<number, { slug: string; name: string; icon: string; tier: string }>();

  if (userIds.length > 0) {
    const earnedRows = await db
      .select({
        userId: userAchievements.userId,
        slug: achievements.slug,
        name: achievements.name,
        icon: achievements.icon,
        tier: achievements.tier,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
      .where(inArray(userAchievements.userId, userIds));

    // Pick the top badge per user (highest tier priority; ties broken by slug alpha order)
    for (const row of earnedRows) {
      const current = badgesByUser.get(row.userId);
      const rowPriority = TIER_PRIORITY[row.tier] ?? 0;
      const currentPriority = current ? (TIER_PRIORITY[current.tier] ?? 0) : -1;
      if (rowPriority > currentPriority) {
        badgesByUser.set(row.userId, { slug: row.slug, name: row.name, icon: row.icon, tier: row.tier });
      }
    }
  }

  // Fetch achievement bonus points per user
  const achievementBonuses = await db
    .select({
      userId: userAchievements.userId,
      totalBonus: sql<number>`sum(${achievements.pointsBonus})`,
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .groupBy(userAchievements.userId);
  const bonusByUser = new Map(achievementBonuses.map((r) => [r.userId, Number(r.totalBonus)]));

  // Assign ranks (shared rank for ties)
  // totalPoints = prediction points + achievement bonus points
  let rank = 0;
  let lastPoints = -1;
  const data = rows.map((row, idx) => {
    const predPts = Number(row.totalPoints);
    const bonus = bonusByUser.get(row.userId) ?? 0;
    const pts = predPts + bonus;
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
      achievementBonus: bonus,
      leagueCount: leagueCountByUser.get(row.userId) ?? 0,
      predictionCount: Number(row.predictionCount),
      topBadge: badgesByUser.get(row.userId) ?? null,
    };
  });

  return res.json({ data, meta: { limit, offset, total: data.length } });
}
