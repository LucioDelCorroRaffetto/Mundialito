import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),      // SHA-256 hex del JWT completo
  familyId: text('family_id').notNull(),        // uuid; se hereda al rotar
  expiresAt: text('expires_at').notNull(),      // ISO; espeja el exp del JWT
  revokedAt: text('revoked_at'),                // null = vigente
  replacedByHash: text('replaced_by_hash'),     // hash del sucesor al rotar
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqHash: uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
  byUser: index('refresh_tokens_user_idx').on(t.userId),
  byFamily: index('refresh_tokens_family_idx').on(t.familyId),
}));

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
