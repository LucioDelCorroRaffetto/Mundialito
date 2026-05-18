import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagueMembers, users } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';

export async function listMembersHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const membership = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))).get();
  if (!membership) throw new AppError('FORBIDDEN', 'Not a member of this league', 403);

  const rows = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl, joinedAt: leagueMembers.joinedAt })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id));

  return res.json({ data: rows, meta: { total: rows.length } });
}
