import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions } from '../../../db/schema/index.js';

export async function myPredictionsHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  const rows = await db
    .select()
    .from(predictions)
    .where(eq(predictions.userId, userId));

  return res.json({ data: rows, meta: { total: rows.length } });
}
