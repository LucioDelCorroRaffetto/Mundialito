import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { comparePassword } from '../../../lib/password.js';
import { signAccess, signRefresh } from '../../../lib/jwt.js';
import { UnauthorizedError } from '../../../lib/errors.js';
import { eq } from 'drizzle-orm';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const payload = { sub: user.id, username: user.username };
  return res.json({
    user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl },
    accessToken: signAccess(payload),
    refreshToken: signRefresh(payload),
  });
}
