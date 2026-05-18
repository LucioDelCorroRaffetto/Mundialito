import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches } from '../../../db/schema/index.js';

export const listMatchesQuerySchema = z.object({
  status: z.enum(['scheduled', 'live', 'finished']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  group: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export async function listMatchesHandler(req: Request, res: Response) {
  const parsed = listMatchesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }
  const { status, from, to, group, limit } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(matches.status, status));
  if (from) conditions.push(gte(matches.kickoffUtc, from));
  if (to) conditions.push(lte(matches.kickoffUtc, to));
  if (group) conditions.push(eq(matches.group, group));

  const rows = await db
    .select()
    .from(matches)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(matches.kickoffUtc))
    .limit(limit);

  return res.json({ data: rows, meta: { total: rows.length } });
}
