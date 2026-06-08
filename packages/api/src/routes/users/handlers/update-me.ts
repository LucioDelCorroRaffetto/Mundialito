import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { users, userAchievements } from '../../../db/schema/index.js';
import { eq, and, ne, sql } from 'drizzle-orm';

const bodySchema = z.object({
  username: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(3, 'Mínimo 3 caracteres')
        .max(30, 'Máximo 30 caracteres')
        .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo'),
    )
    .optional(),
  // base64 image data URL or https URL only — reject `data:text/html`,
  // `javascript:`, `file:`, etc. so a malicious payload can't ride in via
  // the avatar field and execute as an `<a href>` or `<iframe>` somewhere.
  avatarUrl: z
    .string()
    .max(400_000, 'Imagen demasiado grande')
    .regex(
      /^(https:\/\/|data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,)/,
      'Avatar URL inválido',
    )
    .nullable()
    .optional(),
  // Slug of an achievement the user has earned. Pass null to clear the title.
  selectedTitleSlug: z.string().min(1).max(64).nullable().optional(),
});

export async function updateMeHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
    });
  }

  const { username, avatarUrl, selectedTitleSlug } = parsed.data;

  if (!username && avatarUrl === undefined && selectedTitleSlug === undefined) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Nada para actualizar' },
    });
  }

  if (username) {
    // Check uniqueness case-insensitively so "Lucio" and "lucio" can't
    // coexist. SQLite's `eq` is case-sensitive by default, so without this
    // a deliberate attacker (or an honest user with a different shift key)
    // could claim a near-duplicate of another user's name.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = lower(${username})`, ne(users.id, userId)))
      .limit(1);

    if (existing) {
      return res.status(409).json({
        error: { code: 'USERNAME_TAKEN', message: 'Ese nombre de usuario ya está en uso' },
      });
    }
  }

  // The user can only pick a title from achievements they've actually
  // earned. Empty string / explicit null clears the title.
  if (selectedTitleSlug) {
    const owned = await db
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementSlug, selectedTitleSlug),
        ),
      )
      .limit(1)
      .get();
    if (!owned) {
      return res.status(400).json({
        error: {
          code: 'TITLE_NOT_OWNED',
          message: 'Todavía no desbloqueaste ese título',
        },
      });
    }
  }

  const updates: Partial<{
    username: string;
    avatarUrl: string | null;
    selectedTitleSlug: string | null;
  }> = {};
  if (username) updates.username = username;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  if (selectedTitleSlug !== undefined) updates.selectedTitleSlug = selectedTitleSlug;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      username: users.username,
      avatarUrl: users.avatarUrl,
      selectedTitleSlug: users.selectedTitleSlug,
    });

  return res.json(updated);
}
