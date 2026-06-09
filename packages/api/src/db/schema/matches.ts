import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { teams } from './teams.js';

export const matches = sqliteTable('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchNumber: integer('match_number').notNull().unique(),
  homeTeamId: integer('home_team_id').references(() => teams.id),
  awayTeamId: integer('away_team_id').references(() => teams.id),
  kickoffUtc: text('kickoff_utc').notNull(),
  /**
   * MUST be set to kickoffUtc - 5 minutes. Use calcPredictionLock() from lib/match-helpers.
   * Worker debe recalcular este campo cada vez que kickoffUtc cambie.
   */
  predictionLockUtc: text('prediction_lock_utc').notNull(),
  venue: text('venue').notNull(),
  city: text('city').notNull(),
  group: text('group'),
  round: text('round').notNull().default('group'), // 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'
  status: text('status').notNull().default('scheduled'), // 'scheduled' | 'live' | 'finished'
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  apiFixtureId: integer('api_fixture_id'), // nullable — API-Football fixture ID (no longer used in free tier)
  // FIFA.com API identifiers for the per-match timeline endpoint. We use
  // FIFA's public API for player stats (goals/assists/cards) because
  // API-Football's free tier blocks WC 2026 entirely. fifaIdStage is the
  // bracket stage (group / r32 / r16 / …) that FIFA assigns numerically.
  fifaIdMatch: text('fifa_id_match'),
  fifaIdStage: text('fifa_id_stage'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export type Match = typeof matches.$inferSelect;
