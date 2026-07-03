import { Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

export const updateUserAdminSchema = z.object({
  isAdmin: z.boolean(),
});

export async function updateUserAdminHandler(req: Request, res: Response) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user id' } });
  }

  const parsed = updateUserAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }

  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
  if (!user) throw new NotFoundError('User');

  const [updated] = await db
    .update(users)
    .set({ isAdmin: parsed.data.isAdmin ? 1 : 0 })
    .where(eq(users.id, userId))
    .returning({ id: users.id, username: users.username, isAdmin: users.isAdmin });

  return res.json({ data: updated });
}
