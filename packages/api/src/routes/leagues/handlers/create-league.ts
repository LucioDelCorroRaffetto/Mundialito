import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { generateInviteCode } from '../../../lib/invite-code.js';
import { eq } from 'drizzle-orm';
import { checkAchievements } from '../../../services/achievement-service.js';

export const createLeagueSchema = z.object({
  name: z.string().min(3).max(60),
  isPublic: z.boolean().default(false),
  stakesMeme: z.string().max(120).optional().nullable(),
});

export async function createLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { name, isPublic, stakesMeme } = req.body as z.infer<typeof createLeagueSchema>;

  // Generar código único (reintentar si colisiona)
  let code: string;
  let attempts = 0;
  while (true) {
    code = generateInviteCode();
    const existing = await db.select().from(leagues).where(eq(leagues.code, code)).get();
    if (!existing) break;
    if (++attempts > 10) throw new Error('Could not generate unique league code');
  }

  const [league] = await db.insert(leagues).values({
    name,
    code,
    isPublic,
    adminId: userId,
    stakesMeme: stakesMeme ?? null,
  }).returning();

  // El admin se une automáticamente
  await db.insert(leagueMembers).values({ leagueId: league.id, userId });

  checkAchievements(userId, { type: 'league_created', leagueId: league.id }).catch(() => {});

  return res.status(201).json(league);
}
