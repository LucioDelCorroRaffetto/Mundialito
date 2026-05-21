import { Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { players } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

export const updatePlayerSchema = z.object({
  photoUrl: z.string().max(500_000).nullable().optional(),
  name: z.string().min(1).max(100).optional(),
  shirtNumber: z.number().int().min(1).max(99).nullable().optional(),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']).optional(),
});

export async function updatePlayerHandler(req: Request, res: Response) {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid player id' } });
  }

  const parsed = updatePlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }

  const player = await db.select().from(players).where(eq(players.id, playerId)).get();
  if (!player) throw new NotFoundError('Player');

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.photoUrl !== undefined) updatePayload.photoUrl = parsed.data.photoUrl;
  if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
  if (parsed.data.shirtNumber !== undefined) updatePayload.shirtNumber = parsed.data.shirtNumber;
  if (parsed.data.position !== undefined) updatePayload.position = parsed.data.position;

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
  }

  const [updated] = await db
    .update(players)
    .set(updatePayload)
    .where(eq(players.id, playerId))
    .returning();

  return res.json({ data: updated });
}
