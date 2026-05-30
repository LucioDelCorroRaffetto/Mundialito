import { Request, Response } from 'express';
import { inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';

/**
 * Returns a tiny pointer to the "Presidente de la FIFA" account so the client
 * can link to it without hardcoding an id. Reads ADMIN_USER_IDS the same way
 * the public-profile/leaderboard handlers do.
 *
 * Response shape:
 *   { data: { id, username, avatarUrl } | null }
 */
export async function getAdminProfileHandler(_req: Request, res: Response) {
  const ids = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
  if (ids.length === 0) return res.json({ data: null });

  const row = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, ids))
    .limit(1)
    .get();

  return res.json({ data: row ?? null });
}
