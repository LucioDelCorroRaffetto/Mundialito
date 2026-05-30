import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const leagues = sqliteTable('leagues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),      // código de invitación, ej: 'ASADO42'
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  adminId: integer('admin_id').notNull().references(() => users.id),
  stakesMeme: text('stakes_meme'),            // short line, e.g. 'El último paga las birras' (≤120 chars)
  description: text('description'),           // free-form long text shown on league detail (≤1000 chars)
  imageUrl: text('image_url'),               // optional league banner/logo (base64 or URL)
  // 'after_kickoff' (default) hides member predictions until match is live/finished.
  // 'always' lets all members see each other's predictions any time.
  predictionsVisibility: text('predictions_visibility', { enum: ['after_kickoff', 'always'] })
    .notNull()
    .default('after_kickoff'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const leagueMembers = sqliteTable('league_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: text('joined_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqLeagueUser: uniqueIndex('league_members_league_user_idx').on(t.leagueId, t.userId),
}));

export type League = typeof leagues.$inferSelect;
export type LeagueMember = typeof leagueMembers.$inferSelect;
