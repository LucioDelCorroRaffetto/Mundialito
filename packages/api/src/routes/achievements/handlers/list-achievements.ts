import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { achievements } from '../../../db/schema/index.js';
import { desc, ne } from 'drizzle-orm';

/**
 * Public catalog of every regular logro. The 'presidente_fifa' badge is
 * intentionally excluded — it's not a normal "by unlock" achievement and
 * shouldn't appear as a locked entry in non-admin users' /achievements page.
 * It only ever surfaces on the Presidente FIFA's own public profile.
 */
export async function listAchievementsHandler(_req: Request, res: Response) {
  const all = await db
    .select({
      slug: achievements.slug,
      name: achievements.name,
      description: achievements.description,
      icon: achievements.icon,
      tier: achievements.tier,
      // Surface as XP reward — `points_bonus` is just the column name we
      // didn't rename to keep the migration simple. Achievements no longer
      // contribute points to the leaderboard score; they award XP that
      // feeds the level/title system.
      xpReward: achievements.pointsBonus,
    })
    .from(achievements)
    .where(ne(achievements.slug, 'presidente_fifa'))
    .orderBy(desc(achievements.pointsBonus));

  return res.status(200).json({ data: all });
}
