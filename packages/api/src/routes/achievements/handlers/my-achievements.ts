import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { userAchievements, achievements } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export async function myAchievementsHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  const rows = await db
    .select({
      slug: achievements.slug,
      name: achievements.name,
      description: achievements.description,
      icon: achievements.icon,
      tier: achievements.tier,
      pointsBonus: achievements.pointsBonus,
      earnedAt: userAchievements.earnedAt,
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(eq(userAchievements.userId, userId));

  return res.status(200).json({ data: rows });
}
