import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { leagues } from './leagues.js';
import { matches } from './matches.js';

/**
 * Snapshot of a user's position in a league taken every time a match's score
 * gets recomputed. Lets us answer historical questions like "was this user
 * ever last?" (comeback_king) or "did they reach top 3 before quarters?"
 * (underdog) without a daily cron — the snapshot is implicitly driven by
 * match scoring, which is the only thing that moves the ranks.
 *
 * Denormalises `triggeringRound` so we can filter "snapshots taken before
 * QF" cheaply without joining matches every time.
 */
export const leaguePositionHistory = sqliteTable('league_position_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  memberCount: integer('member_count').notNull(),
  triggeringMatchId: integer('triggering_match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  triggeringRound: text('triggering_round').notNull(),
  recordedAt: text('recorded_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqLeagueMatchUser: uniqueIndex('league_position_history_league_match_user_idx')
    .on(t.leagueId, t.triggeringMatchId, t.userId),
}));

export type LeaguePositionHistory = typeof leaguePositionHistory.$inferSelect;
export type NewLeaguePositionHistory = typeof leaguePositionHistory.$inferInsert;
