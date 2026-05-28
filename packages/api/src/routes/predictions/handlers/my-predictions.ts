import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export async function myPredictionsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const leagueIdRaw = req.query.leagueId;

  const conditions = [eq(predictions.userId, userId)];
  if (leagueIdRaw != null && leagueIdRaw !== '') {
    const leagueId = Number(leagueIdRaw);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      throw new AppError('VALIDATION', 'leagueId must be a positive integer', 400);
    }
    conditions.push(eq(predictions.leagueId, leagueId));
  }

  const rows = await db
    .select()
    .from(predictions)
    .where(and(...conditions));

  return res.json({ data: rows, meta: { total: rows.length } });
}
