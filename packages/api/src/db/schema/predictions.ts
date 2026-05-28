import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { matches } from './matches.js';
import { leagues } from './leagues.js';

export const predictions = sqliteTable('predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  // Per-league predictions: a user can have a different score per league for the same match.
  // The first prediction a user makes for a match is propagated to all leagues they belong to;
  // subsequent edits are scoped to the specific league.
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  homeScore: integer('home_score').notNull(),
  awayScore: integer('away_score').notNull(),
  points: integer('points'),  // null until calculated post-match
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqUserMatchLeague: uniqueIndex('predictions_user_match_league_idx').on(t.userId, t.matchId, t.leagueId),
  byMatchLeague: index('predictions_match_league_idx').on(t.matchId, t.leagueId),
}));

export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;
