import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export async function listMineHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const rows = await db
    .select({ league: leagues })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, userId));

  return res.json({ data: rows.map((r) => r.league), meta: { total: rows.length } });
}
