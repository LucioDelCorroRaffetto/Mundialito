import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { hashPassword } from '../../../lib/password.js';
import { signAccess, signRefresh } from '../../../lib/jwt.js';
import { ConflictError } from '../../../lib/errors.js';
import { eq, or } from 'drizzle-orm';

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo')
    .refine((v) => /[a-zA-Z]/.test(v), 'El nombre de usuario debe tener al menos una letra'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

export async function registerHandler(req: Request, res: Response) {
  const { email, username, password } = req.body as z.infer<typeof registerSchema>;

  const existing = await db.select().from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .get();

  if (existing) {
    throw new ConflictError('Email or username already in use');
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, username, passwordHash }).returning();

  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
  const payload = { sub: user.id, username: user.username };
  return res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAdmin: adminIds.includes(user.id),
    },
    accessToken: signAccess(payload),
    refreshToken: signRefresh(payload),
  });
}
