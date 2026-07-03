import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash'),        // nullable for OAuth users
  googleId: text('google_id').unique(),       // nullable for email/password users
  avatarUrl: text('avatar_url'),
  // ─── Achievement-derived prestige (separate from prediction score) ──────
  // xp accumulates from earned achievements without ever touching the
  // prediction leaderboard. Level + tier are derived from xp via
  // computeLevel() in lib/levels.ts.
  xp: integer('xp').notNull().default(0),
  // The slug of the achievement whose `name` is displayed as the user's
  // chosen title under their username. Must correspond to an achievement
  // the user has actually earned (enforced at the title endpoint, not by FK
  // because the column needs to allow temporary inconsistency during
  // achievement renames).
  selectedTitleSlug: text('selected_title_slug'),
  // Admin toggleable en DB (Sesión 8 de PLAN-MEJORAS.md). ADMIN_USER_IDS
  // sigue siendo el fallback/bootstrap — ver require-admin.ts.
  isAdmin: integer('is_admin').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
