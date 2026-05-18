import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';
import { eq } from 'drizzle-orm';

export async function meHandler(req: Request, res: Response) {
  const user = await db.select().from(users).where(eq(users.id, req.user!.id)).get();
  if (!user) throw new NotFoundError('User');
  return res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  });
}
