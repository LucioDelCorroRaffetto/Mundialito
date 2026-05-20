import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers, users } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';
import { eq, count } from 'drizzle-orm';

export async function getLeagueByCodeHandler(req: Request, res: Response) {
  const code = String(req.params.code ?? '').toUpperCase();
  if (!code) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.code, code)).get();
  if (!league) throw new NotFoundError('League');

  const [memberCountRow] = await db
    .select({ count: count() })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, league.id));

  const admin = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, league.adminId))
    .get();

  return res.json({
    id: league.id,
    name: league.name,
    code: league.code,
    isPublic: league.isPublic,
    stakesMeme: league.stakesMeme,
    memberCount: memberCountRow?.count ?? 0,
    adminName: admin?.username ?? null,
  });
}
