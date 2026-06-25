import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';
import { eq, or } from 'drizzle-orm';
import { signAccess, signRefresh } from '../../../lib/jwt.js';
import { z } from 'zod';
import { GOOGLE_CLIENT_ID } from '../../../constants.js';
import { ensurePersonalLeague } from '../../../lib/personal-league.js';

// Singleton — shares the internal certificate cache across requests
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const bodySchema = z.object({
  credential: z.string().min(1),
});

export async function googleAuthHandler(req: Request, res: Response) {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  const { email, sub: googleId, picture } = payload;

  // Find existing user by googleId or email
  let [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.googleId, googleId), eq(users.email, email)))
    .limit(1);

  if (!user) {
    // Create new user — derive username from email
    const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').slice(0, 30);
    let username = baseUsername;

    // Ensure uniqueness
    let attempt = 0;
    for (;;) {
      const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (!existing) break;
      attempt++;
      username = `${baseUsername}${attempt}`;
    }

    [user] = await db
      .insert(users)
      .values({
        email,
        username,
        passwordHash: null,
        googleId,
        avatarUrl: picture ?? null,
      })
      .returning();
  } else if (!user.googleId) {
    // Existing email-password user — link Google account
    [user] = await db
      .update(users)
      .set({ googleId, avatarUrl: user.avatarUrl ?? picture ?? null })
      .where(eq(users.id, user.id))
      .returning();
  }

  // Every signed-in user gets a personal league (fire-and-forget).
  ensurePersonalLeague(user.id).catch((err) =>
    console.error('[google-auth] ensurePersonalLeague failed:', err),
  );

  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
  const tokenPayload = { sub: user.id, username: user.username };

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAdmin: adminIds.includes(user.id),
    },
    accessToken: signAccess(tokenPayload),
    refreshToken: signRefresh(tokenPayload),
  });
}
