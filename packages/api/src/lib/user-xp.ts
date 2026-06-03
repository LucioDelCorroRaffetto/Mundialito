/**
 * Derives user XP from earned achievements at query time instead of relying
 * on a stored `users.xp` column.
 *
 * Why dynamic: the legacy approach was to bump `users.xp` inside
 * `maybeAward()`. That worked but was vulnerable to drift — any failed
 * transaction, NULL-arithmetic edge case (pre-migration users), or future
 * change to a catalogue `pointsBonus` value would leave `users.xp` out of
 * sync with the actual achievements a user holds. Computing on read makes
 * it physically impossible for the two to diverge: XP is, by definition,
 * the sum of the user's earned-achievement rewards right now.
 *
 * Used by /auth/me, /users/:id, /users/leaderboard, /leagues/:id/standings,
 * and the achievement-service "just-awarded" feedback so the
 * frontend's level badge updates instantly.
 *
 * Cost: one indexed JOIN (`user_achievements` × `achievements`) per call.
 * For the leaderboard handlers we pull the totals for all listed users in
 * a single grouped query rather than N round-trips. Negligible at our
 * scale (a few thousand achievement rows total).
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userAchievements, achievements } from '../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';

/** XP for a single user. Returns 0 when the user has no earned achievements. */
export async function computeUserXp(userId: number): Promise<number> {
  const row = await db
    .select({
      xp: sql<number>`coalesce(sum(${achievements.pointsBonus}), 0)`.as('xp'),
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(eq(userAchievements.userId, userId))
    .get();
  return Number(row?.xp ?? 0);
}

/** XP for many users at once. Returns a Map keyed by userId. */
export async function computeUserXpBulk(userIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({
      userId: userAchievements.userId,
      xp: sql<number>`coalesce(sum(${achievements.pointsBonus}), 0)`.as('xp'),
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(inArray(userAchievements.userId, userIds))
    .groupBy(userAchievements.userId);

  for (const r of rows) result.set(r.userId, Number(r.xp));
  // Users with zero earned achievements never appear in the result above,
  // so seed them at 0 to keep the consumer code simple.
  for (const id of userIds) if (!result.has(id)) result.set(id, 0);
  return result;
}
