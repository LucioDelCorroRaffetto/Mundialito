import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { leagues } from '../../../db/schema/index.js';
import { and, eq, like, sql } from 'drizzle-orm';

export const searchPublicSchema = z.object({
  q: z.string().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function searchPublicHandler(req: Request, res: Response) {
  const parsed = searchPublicSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }
  const { q, limit } = parsed.data;

  // Exclude personal leagues from the public explore — they're per-user
  // hidden containers, not joinable communities.
  const conditions = [eq(leagues.isPublic, true), eq(leagues.isPersonal, false)];
  if (q) conditions.push(like(leagues.name, `%${q}%`));

  // Contar miembros con subquery
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      code: leagues.code,
      stakesMeme: leagues.stakesMeme,
      memberCount: sql<number>`(SELECT COUNT(*) FROM league_members WHERE league_id = ${leagues.id})`.as('member_count'),
    })
    .from(leagues)
    .where(and(...conditions))
    .limit(limit);

  return res.json({ data: rows, meta: { total: rows.length } });
}
