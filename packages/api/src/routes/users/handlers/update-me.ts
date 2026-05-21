import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { eq, and, ne } from 'drizzle-orm';

const bodySchema = z.object({
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo'),
});

export async function updateMeHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
    });
  }

  const { username } = parsed.data;

  // Check uniqueness
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, userId)))
    .limit(1);

  if (existing) {
    return res.status(409).json({
      error: { code: 'USERNAME_TAKEN', message: 'Ese nombre de usuario ya está en uso' },
    });
  }

  const [updated] = await db
    .update(users)
    .set({ username })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      username: users.username,
      avatarUrl: users.avatarUrl,
    });

  return res.json(updated);
}
