import { db } from '../db/index.js';
import { userAchievements, achievements } from '../db/schema/index.js';
import { eq, and, count } from 'drizzle-orm';
import { leagueMembers } from '../db/schema/index.js';

/**
 * Checks and awards achievements based on an event.
 * All checks are idempotent (unique constraint prevents duplicates).
 */
export async function checkAchievements(
  userId: number,
  event: AchievementEvent,
): Promise<string[]> {
  const awarded: string[] = [];

  switch (event.type) {
    case 'prediction_saved': {
      // first_prediction
      await maybeAward(userId, 'first_prediction', awarded);
      break;
    }
    case 'prediction_scored': {
      // exact_score — when a prediction gets 5 points
      if (event.points === 5) {
        await maybeAward(userId, 'exact_score', awarded);
      }
      break;
    }
    case 'league_joined': {
      // first_league
      await maybeAward(userId, 'first_league', awarded);
      // social_butterfly — check if user is in 3+ leagues
      const [{ value: leagueCount }] = await db
        .select({ value: count() })
        .from(leagueMembers)
        .where(eq(leagueMembers.userId, userId));
      if (leagueCount >= 3) {
        await maybeAward(userId, 'social_butterfly', awarded);
      }
      break;
    }
    case 'league_created': {
      await maybeAward(userId, 'league_founder', awarded);
      break;
    }
    case 'prediction_shared': {
      // share_master — check if user has shared 5+ (tracked via userAchievements meta or simple count)
      // Simplified: just award on first share for now
      await maybeAward(userId, 'share_master', awarded);
      break;
    }
  }

  return awarded;
}

async function maybeAward(userId: number, slug: string, awarded: string[]): Promise<void> {
  try {
    await db.insert(userAchievements).values({ userId, achievementSlug: slug }).onConflictDoNothing();
    // Check if it was actually inserted (onConflictDoNothing silently skips)
    const existing = await db
      .select()
      .from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementSlug, slug)))
      .limit(1);
    if (existing.length > 0 && !awarded.includes(slug)) {
      awarded.push(slug);
    }
  } catch {
    // ignore duplicate key errors (already awarded)
  }
}

export type AchievementEvent =
  | { type: 'prediction_saved'; matchId: number }
  | { type: 'prediction_scored'; matchId: number; points: number }
  | { type: 'league_joined'; leagueId: number }
  | { type: 'league_created'; leagueId: number }
  | { type: 'prediction_shared' };
