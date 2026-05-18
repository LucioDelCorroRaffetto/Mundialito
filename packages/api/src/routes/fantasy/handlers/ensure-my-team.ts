import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams } from '../../../db/schema/index.js';

export const ensureMyTeamSchema = z.object({
  leagueId: z.number().int().positive(),
  name: z.string().min(1).max(60).optional(),
});

export async function ensureMyTeamHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { leagueId, name } = req.body as z.infer<typeof ensureMyTeamSchema>;

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
