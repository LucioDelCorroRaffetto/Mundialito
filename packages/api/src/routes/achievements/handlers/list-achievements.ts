import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { achievements } from '../../../db/schema/index.js';
import { desc } from 'drizzle-orm';

export async function listAchievementsHandler(req: Request, res: Response) {
  const all = await db
    .select()
    .from(achievements)
    .orderBy(desc(achievements.pointsBonus));

  return res.status(200).json({ data: all });
}
