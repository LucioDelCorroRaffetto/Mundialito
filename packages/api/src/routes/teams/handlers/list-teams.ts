import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, asc, isNotNull, notInArray } from 'drizzle-orm';
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

  // Always exclude internal placeholder teams (TBD for knockout slots, PO1/PO2 for intercontinental playoffs)
  // NOTE: use exact codes, NOT a LIKE pattern — 'PO%' would also match 'POR' (Portugal)
  const conditions = [
    isNotNull(teams.confederation),
    notInArray(teams.code, ['TBD', 'PO1', 'PO2']),
  ];
  if (group) conditions.push(eq(teams.group, group));
  if (confederation) conditions.push(eq(teams.confederation, confederation));

  const rows = await db
    .select()
    .from(teams)
    .where(and(...conditions))
    .orderBy(asc(teams.code));
  return res.json({ data: rows, meta: { total: rows.length } });
}
