import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { users, achievements } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';
import { eq } from 'drizzle-orm';
import { computeLevel } from '../../../lib/levels.js';
import { computeUserXp } from '../../../lib/user-xp.js';

function isAdminUser(userId: number): boolean {
  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
  return adminIds.includes(userId);
}

export async function meHandler(req: Request, res: Response) {
  const user = await db.select().from(users).where(eq(users.id, req.user!.id)).get();
  if (!user) throw new NotFoundError('User');

  // Resolve chosen title (if any) into a display name in the same response,
  // so the client doesn't need to round-trip again to render the username
  // chip with title underneath.
  let title: { slug: string; name: string } | null = null;
  if (user.selectedTitleSlug) {
    const row = await db
      .select({ slug: achievements.slug, name: achievements.name })
      .from(achievements)
      .where(eq(achievements.slug, user.selectedTitleSlug))
      .get();
    if (row) title = row;
  }

  // XP is derived live from the user's earned achievements — see
  // lib/user-xp.ts for the rationale. Stored `users.xp` is no longer the
  // source of truth.
  const xp = await computeUserXp(user.id);

  return res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    isAdmin: isAdminUser(user.id),
    xp,
    level: computeLevel(xp),
    title,
  });
}
