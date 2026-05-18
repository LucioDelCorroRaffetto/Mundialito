import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';

export async function leaveLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.id, id)).get();
  if (!league) throw new NotFoundError('League');
  if (league.adminId === userId) {
    throw new AppError('FORBIDDEN', 'Admin cannot leave the league. Transfer admin or delete the league.', 403);
  }

  await db.delete(leagueMembers).where(
    and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))
  );
  return res.status(204).send();
}
