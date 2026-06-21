import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, leagueMembers } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export const ensureMyTeamSchema = z.object({
  leagueId: z.number().int().positive(),
  name: z.string().min(1).max(60).optional(),
});

export async function ensureMyTeamHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { leagueId, name } = req.body as z.infer<typeof ensureMyTeamSchema>;

  // Refuse to create a fantasy team in a league the user doesn't belong to —
  // otherwise anyone could seed rows in foreign (incl. other users' personal)
  // leagues just by passing an arbitrary leagueId.
  const membership = await db
    .select({ id: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.leagueId, leagueId)))
    .get();
  if (!membership) {
    throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
  }

  await db
    .insert(fantasyTeams)
    .values({ userId, leagueId, name: name ?? 'Mi equipo' })
    .onConflictDoNothing();

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(and(eq(fantasyTeams.userId, userId), eq(fantasyTeams.leagueId, leagueId)))
    .get();

  return res.status(200).json(team);
}
