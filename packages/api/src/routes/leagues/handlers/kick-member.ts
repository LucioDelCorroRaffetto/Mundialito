import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';

export async function kickMemberHandler(req: Request, res: Response) {
  const adminId = req.user!.id;
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(id) || !Number.isInteger(targetUserId)) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.id, id)).get();
  if (!league) throw new NotFoundError('League');
  if (league.adminId !== adminId) throw new AppError('FORBIDDEN', 'Only admin can kick members', 403);
  if (targetUserId === adminId) throw new AppError('BAD_REQUEST', 'Cannot kick yourself', 400);

  await db.delete(leagueMembers).where(
    and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, targetUserId))
  );
  return res.status(204).send();
}
