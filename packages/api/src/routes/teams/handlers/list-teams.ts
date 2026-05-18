import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, asc } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { teams } from '../../../db/schema/index.js';

const querySchema = z.object({
  group: z.string().optional(),
  confederation: z.string().optional(),
});

export async function listTeamsHandler(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
    });
  }
  const { group, confederation } = parsed.data;

  const conditions = [];
  if (group) conditions.push(eq(teams.group, group));
  if (confederation) conditions.push(eq(teams.confederation, confederation));

  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = await db.select().from(teams).where(whereClause).orderBy(asc(teams.code));
  return res.json({ data: rows, meta: { total: rows.length } });
}
