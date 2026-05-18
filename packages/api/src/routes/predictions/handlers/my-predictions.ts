import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions } from '../../../db/schema/index.js';

export const myPredictionsQuerySchema = z.object({
  leagueId: z.coerce.number().int().positive().optional(),
});

export async function myPredictionsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const parsed = myPredictionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }
  const { leagueId } = parsed.data;

  const conditions = [eq(predictions.userId, userId)];
  if (leagueId) conditions.push(eq(predictions.leagueId, leagueId));

  const rows = await db.select().from(predictions).where(and(...conditions));
  return res.json({ data: rows, meta: { total: rows.length } });
}
