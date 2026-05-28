import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, leagueMembers, users, matches, userAchievements, achievements } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { calculatePoints } from '../../../lib/scoring.js';

// Tier priority for picking the "top" badge (higher = better)
const TIER_PRIORITY: Record<string, number> = {
  platinum: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

export async function standingsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const membership = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))).get();
  if (!membership) throw new AppError('FORBIDDEN', 'Not a member of this league', 403);

  // Get all members of this league
  const members = await db
    .select({ userId: leagueMembers.userId, username: users.username, avatarUrl: users.avatarUrl })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id));

  const memberIds = members.map((m) => m.userId);

  if (memberIds.length === 0) {
    return res.json({ data: [], meta: { total: 0 } });
  }

  // Per-league standings: only count predictions made within THIS league.
  const preds = await db
    .select({
      userId: predictions.userId,
      points: predictions.points,
      predHome: predictions.homeScore,
      predAway: predictions.awayScore,
      matchHome: matches.homeScore,
      matchAway: matches.awayScore,
      matchStatus: matches.status,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.leagueId, id), inArray(predictions.userId, memberIds)));

  // Sum points per user
  const pointsByUser = new Map<number, { total: number; matches: number }>();
  for (const p of preds) {
    const current = pointsByUser.get(p.userId) ?? { total: 0, matches: 0 };
    let pts = p.points;
    if (pts === null && p.matchStatus === 'finished' && p.matchHome !== null && p.matchAway !== null) {
      pts = calculatePoints(
        { homeScore: p.predHome, awayScore: p.predAway },
        { homeScore: p.matchHome, awayScore: p.matchAway }
      );
    }
    if (pts !== null) {
      current.total += pts;
      current.matches += 1;
    }
    pointsByUser.set(p.userId, current);
  }

  // Fetch top badge per member
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
    .where(inArray(userAchievements.userId, memberIds));

  const badgesByUser = new Map<number, { slug: string; name: string; icon: string; tier: string }>();
  for (const row of earnedRows) {
    const current = badgesByUser.get(row.userId);
    const rowPriority = TIER_PRIORITY[row.tier] ?? 0;
    const currentPriority = current ? (TIER_PRIORITY[current.tier] ?? 0) : -1;
    if (rowPriority > currentPriority) {
      badgesByUser.set(row.userId, { slug: row.slug, name: row.name, icon: row.icon, tier: row.tier });
    }
  }

  // Fetch achievement bonus points per member
  const achievementBonuses = await db
    .select({
      userId: userAchievements.userId,
      totalBonus: sql<number>`sum(${achievements.pointsBonus})`,
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(inArray(userAchievements.userId, memberIds))
    .groupBy(userAchievements.userId);
  const bonusByUser = new Map(achievementBonuses.map((r) => [r.userId, Number(r.totalBonus)]));

  // Build sorted standings (prode points + achievement bonus)
  const standings = members
    .map((m) => {
      const predPoints = pointsByUser.get(m.userId)?.total ?? 0;
      const bonus = bonusByUser.get(m.userId) ?? 0;
      return {
        userId: m.userId,
        username: m.username,
        avatarUrl: m.avatarUrl,
        points: predPoints + bonus,
        achievementBonus: bonus,
        matchesPlayed: pointsByUser.get(m.userId)?.matches ?? 0,
        topBadge: badgesByUser.get(m.userId) ?? null,
      };
    })
    .sort((a, b) => b.points - a.points);

  // Assign positions (ties share the same rank)
  let position = 0;
  let lastPoints = -1;
  const ranked = standings.map((row, idx) => {
    if (row.points !== lastPoints) {
      position = idx + 1;
      lastPoints = row.points;
    }
    return { ...row, position };
  });

  return res.json({ data: ranked, meta: { total: ranked.length } });
}
