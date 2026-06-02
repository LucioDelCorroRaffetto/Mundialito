import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { users, userAchievements } from '../../../db/schema/index.js';
import { eq, and, ne } from 'drizzle-orm';

const bodySchema = z.object({
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo')
    .optional(),
  // base64 data URL or https URL, max ~400 KB
  avatarUrl: z
    .string()
    .max(400_000, 'Imagen demasiado grande')
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
      xp: users.xp,
      selectedTitleSlug: users.selectedTitleSlug,
    });

  return res.json(updated);
}
