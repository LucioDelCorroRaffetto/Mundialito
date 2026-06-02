import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { userAchievements, achievements, users } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export async function myAchievementsHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  const me = await db
    .select({ selectedTitleSlug: users.selectedTitleSlug })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const rows = await db
    .select({
      slug: achievements.slug,
      name: achievements.name,
      description: achievements.description,
      icon: achievements.icon,
      tier: achievements.tier,
      // `pointsBonus` is kept as the column name in the catalog, but
      // semantically it's now XP reward. Surface it under the new name to
      // the client so the UI can show "+X XP" instead of "+X pts".
      xpReward: achievements.pointsBonus,
      earnedAt: userAchievements.earnedAt,
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(eq(userAchievements.userId, userId));

  const currentTitleSlug = me?.selectedTitleSlug ?? null;
  const enriched = rows.map((r) => ({
    ...r,
    isSelectedTitle: r.slug === currentTitleSlug,
  }));

  return res.status(200).json({ data: enriched });
}
