import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { matches } from './matches.js';
import { leagues } from './leagues.js';

export const predictions = sqliteTable('predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  // Global predictions: league_id is kept for reference/legacy but NOT part of the unique key.
  // One prediction per (user, match) counts for all leagues the user belongs to.
  leagueId: integer('league_id').references(() => leagues.id, { onDelete: 'set null' }),
  homeScore: integer('home_score').notNull(),
  awayScore: integer('away_score').notNull(),
  points: integer('points'),  // null until calculated post-match
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  // One prediction per user per match (global — not per league)
  uniqUserMatch: uniqueIndex('predictions_user_match_idx').on(t.userId, t.matchId),
}));

export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;
