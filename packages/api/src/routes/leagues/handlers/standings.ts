import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, leagueMembers, users, matches, userAchievements, achievements, tournamentPredictions } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq, inArray } from 'drizzle-orm';
import { calculatePoints } from '../../../lib/scoring.js';
import { computeLevel } from '../../../lib/levels.js';
import { computeUserXpBulk } from '../../../lib/user-xp.js';

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

  // Get all members of this league. XP is computed live below (single
  // bulk query) so the level badge always reflects the user's current set
  // of earned achievements.
  const members = await db
    .select({
      userId: leagueMembers.userId,
      username: users.username,
      avatarUrl: users.avatarUrl,
      selectedTitleSlug: users.selectedTitleSlug,
    })
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

  // Predicciones de Copa de ESTA liga: se suman al total cuando ya fueron
  // resueltas al final del torneo (points no-null). Antes de eso valen 0.
  const tournamentRows = await db
    .select({
      userId: tournamentPredictions.userId,
      points: tournamentPredictions.points,
    })
    .from(tournamentPredictions)
    .where(and(eq(tournamentPredictions.leagueId, id), inArray(tournamentPredictions.userId, memberIds)));

  const tournamentPointsByUser = new Map<number, number>();
  for (const t of tournamentRows) {
    if (t.points != null) tournamentPointsByUser.set(t.userId, t.points);
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

  // Resolve each member's selected title (slug → achievement name). We do
  // a single bulk lookup over the union of all members' chosen slugs.
  const titleSlugs = members
    .map((m) => m.selectedTitleSlug)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
  const titleNameBySlug = new Map<string, string>();
  if (titleSlugs.length > 0) {
    const titleRows = await db
      .select({ slug: achievements.slug, name: achievements.name })
      .from(achievements)
      .where(inArray(achievements.slug, titleSlugs));
    for (const t of titleRows) titleNameBySlug.set(t.slug, t.name);
  }

  // Live XP per member — one grouped query for the whole league.
  const xpByUser = await computeUserXpBulk(memberIds);

  // Achievement bonuses are NO LONGER added to score — they accumulate as
  // XP derived from earned achievements and surface as a level/title next
  // to the name. The score is pure prediction skill.
  const standings = members
    .map((m) => {
      const predPoints = pointsByUser.get(m.userId)?.total ?? 0;
      const tournamentPoints = tournamentPointsByUser.get(m.userId) ?? 0;
      const titleSlug = m.selectedTitleSlug ?? null;
      return {
        userId: m.userId,
        username: m.username,
        avatarUrl: m.avatarUrl,
        points: predPoints + tournamentPoints,
        matchesPlayed: pointsByUser.get(m.userId)?.matches ?? 0,
        topBadge: badgesByUser.get(m.userId) ?? null,
        level: computeLevel(xpByUser.get(m.userId) ?? 0),
        title: titleSlug
          ? { slug: titleSlug, name: titleNameBySlug.get(titleSlug) ?? titleSlug }
          : null,
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

  return res.json({
    data: ranked,
    meta: { total: ranked.length, bonusesCountTowardRank: false },
  });
}
