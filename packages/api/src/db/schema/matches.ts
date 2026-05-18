import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { teams } from './teams.js';

export const matches = sqliteTable('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchNumber: integer('match_number').notNull().unique(),
  homeTeamId: integer('home_team_id').references(() => teams.id),
  awayTeamId: integer('away_team_id').references(() => teams.id),
  kickoffUtc: text('kickoff_utc').notNull(),
  predictionLockUtc: text('prediction_lock_utc').notNull(), // kickoff - 5 min
  venue: text('venue').notNull(),
  city: text('city').notNull(),
  group: text('group'),
  round: text('round').notNull().default('group'), // 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'
  status: text('status').notNull().default('scheduled'), // 'scheduled' | 'live' | 'finished'
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export type Match = typeof matches.$inferSelect;
