import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';

export async function getLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.id, id)).get();
  if (!league) throw new NotFoundError('League');

  // Si la liga es privada, el user debe ser miembro
  if (!league.isPublic) {
    const membership = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))).get();
    if (!membership) throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
  }

  return res.json(league);
}
