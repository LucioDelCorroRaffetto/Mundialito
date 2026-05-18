import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { hashPassword } from '../../../lib/password.js';
import { signAccess, signRefresh } from '../../../lib/jwt.js';
import { ConflictError } from '../../../lib/errors.js';
import { eq, or } from 'drizzle-orm';

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
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

  const payload = { sub: user.id, username: user.username };
  return res.status(201).json({
    user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl },
    accessToken: signAccess(payload),
    refreshToken: signRefresh(payload),
  });
}
