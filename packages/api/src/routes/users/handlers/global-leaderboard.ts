import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, users, leagueMembers, userAchievements, achievements, leagues } from '../../../db/schema/index.js';
import { eq, sql, desc, inArray, notInArray } from 'drizzle-orm';
import { computeLevel } from '../../../lib/levels.js';
import { computeUserXpBulk } from '../../../lib/user-xp.js';

// Tier priority for picking the "top" badge (higher = better)
const TIER_PRIORITY: Record<string, number> = {
  platinum: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

export async function globalLeaderboardHandler(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  // Exclude admin/bot accounts from the leaderboard
  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
  // Merge ADMIN_USER_IDS with the hidden-users list (e.g. the app owner)
  // so neither shows up in the global leaderboard.
  const { HIDDEN_USER_IDS } = await import('../../../lib/hidden-users.js');
  const hiddenIds = [...new Set([...adminIds, ...HIDDEN_USER_IDS])];

  // Per-user totals: predictions are stored per (user, match, league), so for a
  // user-level leaderboard we collapse to one row per (user, match) by taking
  // the best score across the user's leagues. This avoids counting the same
  // match multiple times when a user belongs to several leagues.
  const bestPerMatch = db
    .select({
      userId: predictions.userId,
      matchId: predictions.matchId,
      bestPoints: sql<number>`max(${predictions.points})`.as('best_points'),
    })
    .from(predictions)
    .groupBy(predictions.userId, predictions.matchId)
    .as('best_per_match');

  const baseSelect = {
    userId: users.id,
    username: users.username,
    avatarUrl: users.avatarUrl,
    selectedTitleSlug: users.selectedTitleSlug,
    totalPoints: sql<number>`coalesce(sum(${bestPerMatch.bestPoints}), 0)`,
    predictionCount: sql<number>`count(${bestPerMatch.matchId})`,
  };

  const groupCols = [
    users.id,
    users.username,
    users.avatarUrl,
    users.selectedTitleSlug,
  ] as const;

  const rows = hiddenIds.length > 0
    ? await db
        .select(baseSelect)
        .from(users)
        .leftJoin(bestPerMatch, eq(bestPerMatch.userId, users.id))
        .where(notInArray(users.id, hiddenIds))
        .groupBy(...groupCols)
        .orderBy(desc(sql`coalesce(sum(${bestPerMatch.bestPoints}), 0)`))
        .limit(limit)
        .offset(offset)
    : await db
        .select(baseSelect)
        .from(users)
        .leftJoin(bestPerMatch, eq(bestPerMatch.userId, users.id))
        .groupBy(...groupCols)
        .orderBy(desc(sql`coalesce(sum(${bestPerMatch.bestPoints}), 0)`))
        .limit(limit)
        .offset(offset);

  // Count distinct leagues per user — but NOT counting the auto-created
  // personal league, otherwise every new user appears to be "in 1 league"
  // when they haven't joined anything.
  const leagueCounts = await db
    .select({
      userId: leagueMembers.userId,
      leagueCount: sql<number>`count(distinct ${leagueMembers.leagueId})`,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(eq(leagues.isPersonal, false))
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

    for (const row of earnedRows) {
      const current = badgesByUser.get(row.userId);
      const rowPriority = TIER_PRIORITY[row.tier] ?? 0;
      const currentPriority = current ? (TIER_PRIORITY[current.tier] ?? 0) : -1;
      if (rowPriority > currentPriority) {
        badgesByUser.set(row.userId, { slug: row.slug, name: row.name, icon: row.icon, tier: row.tier });
      }
    }
  }

  // Resolve titles in a single bulk lookup.
  const titleSlugs = rows
    .map((r) => r.selectedTitleSlug)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
  const titleNameBySlug = new Map<string, string>();
  if (titleSlugs.length > 0) {
    const titleRows = await db
      .select({ slug: achievements.slug, name: achievements.name })
      .from(achievements)
      .where(inArray(achievements.slug, titleSlugs));
    for (const t of titleRows) titleNameBySlug.set(t.slug, t.name);
  }

  // Live XP per user — one grouped query for the whole page.
  const xpByUser = await computeUserXpBulk(userIds);

  // Achievement XP no longer adds to the leaderboard score. It powers the
  // level + title shown next to the username, which travels alongside the
  // row but doesn't influence rank order.
  const enriched = rows.map((row) => {
    const predPts = Number(row.totalPoints);
    const titleSlug = row.selectedTitleSlug ?? null;
    return {
      userId: row.userId,
      username: row.username,
      avatarUrl: row.avatarUrl,
      totalPoints: predPts,
      leagueCount: leagueCountByUser.get(row.userId) ?? 0,
      predictionCount: Number(row.predictionCount),
      topBadge: badgesByUser.get(row.userId) ?? null,
      level: computeLevel(xpByUser.get(row.userId) ?? 0),
      title: titleSlug
        ? { slug: titleSlug, name: titleNameBySlug.get(titleSlug) ?? titleSlug }
        : null,
    };
  });

  enriched.sort((a, b) => b.totalPoints - a.totalPoints);

  let rank = 0;
  let lastPoints = -1;
  const data = enriched.map((row, idx) => {
    if (row.totalPoints !== lastPoints) {
      rank = offset + idx + 1;
      lastPoints = row.totalPoints;
    }
    return { rank, ...row };
  });

  return res.json({
    data,
    meta: { limit, offset, total: data.length, bonusesCountTowardRank: false },
  });
}
