import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
import { generateInviteCode } from '../../../lib/invite-code.js';
import { eq } from 'drizzle-orm';
import { checkAchievements } from '../../../services/achievement-service.js';

export const createLeagueSchema = z.object({
  // Trim before length check so "   " can't sneak through min(3).
  name: z.string().transform((v) => v.trim()).pipe(z.string().min(3).max(60)),
  isPublic: z.boolean().default(false),
  stakesMeme: z.string().max(120).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().max(400_000).optional().nullable(),
  predictionsVisibility: z.enum(['after_kickoff', 'always']).optional(),
});

export async function createLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { name, isPublic, stakesMeme, description, imageUrl, predictionsVisibility } =
    req.body as z.infer<typeof createLeagueSchema>;

  // Generate a unique invite code AND create the league + admin membership in
  // a single transaction so a crash between the two inserts doesn't leave an
  // ownerless league behind. Retries inside the transaction handle the
  // (very unlikely) code collision.
  const league = await db.transaction(async (tx) => {
    let code: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateInviteCode();
      const existing = await tx.select().from(leagues).where(eq(leagues.code, candidate)).get();
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error('Could not generate unique league code');

    const [created] = await tx.insert(leagues).values({
      name,
      code,
      isPublic,
      adminId: userId,
      stakesMeme: stakesMeme ?? null,
      description: description ?? null,
      imageUrl: imageUrl ?? null,
      ...(predictionsVisibility ? { predictionsVisibility } : {}),
    }).returning();

    // El admin se une automáticamente
    await tx.insert(leagueMembers).values({ leagueId: created.id, userId });
    return created;
  });

  checkAchievements(userId, { type: 'league_created', leagueId: league.id }).catch(() => {});

  return res.status(201).json(league);
}
