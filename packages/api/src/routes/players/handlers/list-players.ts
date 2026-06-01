import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, count } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { players } from '../../../db/schema/index.js';

const querySchema = z.object({
  teamId: z.coerce.number().int().positive().optional(),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']).optional(),
  // Default is now high enough to return every player in a single request
  // (48 teams × 26 = 1248 + provisional spillover). The previous default
  // of 50 + max of 600 silently truncated the roster — the fantasy picker
  // was missing entire teams.
  limit: z.coerce.number().int().min(1).max(2000).default(2000),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function listPlayersHandler(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
    });
  }

  const { teamId, position, limit, offset } = parsed.data;

  const conditions = [];
  if (teamId !== undefined) conditions.push(eq(players.teamId, teamId));
  if (position !== undefined) conditions.push(eq(players.position, position));

  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const [totalResult, rows] = await Promise.all([
    db.select({ count: count() }).from(players).where(whereClause).get(),
    db.select().from(players).where(whereClause).limit(limit).offset(offset),
  ]);

  const total = totalResult?.count ?? 0;

  return res.json({ data: rows, meta: { total, limit, offset } });
}
