import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { leagues } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { eq } from 'drizzle-orm';

export const updateLeagueSchema = z.object({
  name: z.string().min(3).max(60).optional(),
  isPublic: z.boolean().optional(),
  stakesMeme: z.string().max(120).nullable().optional(),
  imageUrl: z.string().max(400_000).nullable().optional(),
});

export async function updateLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.id, id)).get();
  if (!league) throw new NotFoundError('League');
  if (league.adminId !== userId) throw new AppError('FORBIDDEN', 'Only admin can edit', 403);

  const updates = req.body as z.infer<typeof updateLeagueSchema>;
  const [updated] = await db.update(leagues).set(updates).where(eq(leagues.id, id)).returning();
  return res.json(updated);
}
