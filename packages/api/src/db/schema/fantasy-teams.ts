import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { leagues } from './leagues.js';

export const fantasyTeams = sqliteTable('fantasy_teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Global fantasy: league_id is no longer part of the key.
  // One squad per user counts for all leagues they belong to.
  leagueId: integer('league_id').references(() => leagues.id, { onDelete: 'set null' }),
  name: text('name').notNull().default('Mi equipo'),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  // One fantasy team per user (global)
  uniqUser: uniqueIndex('fantasy_teams_user_idx').on(t.userId),
}));

export type FantasyTeam = typeof fantasyTeams.$inferSelect;
export type NewFantasyTeam = typeof fantasyTeams.$inferInsert;
