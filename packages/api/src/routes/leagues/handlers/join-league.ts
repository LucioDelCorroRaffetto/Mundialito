import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { NotFoundError, ConflictError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';
import { checkAchievements } from '../../../services/achievement-service.js';

export const joinLeagueSchema = z.object({
  code: z.string().min(4).max(12),
});

export async function joinLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { code } = req.body as z.infer<typeof joinLeagueSchema>;

  const league = await db.select().from(leagues).where(eq(leagues.code, code.toUpperCase())).get();
  if (!league) throw new NotFoundError('League');

  const existing = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId))).get();
  if (existing) throw new ConflictError('Already a member of this league');

  await db.insert(leagueMembers).values({ leagueId: league.id, userId });
  checkAchievements(userId, { type: 'league_joined', leagueId: league.id }).catch(() => {});
  return res.status(201).json(league);
}
