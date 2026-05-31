import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { players } from './players.js';

/**
 * Fantasy lineup per user per tournament round. The user picks up to 11
 * players (isStarter) from their squad of 15 before each round's deadline.
 * They can also designate a captain (x2 points) and vice-captain (x1.5).
 *
 * One row per (user, round, player). Round slugs mirror the match rounds
 * used in the matches table, with group stage split into three windows:
 *   group_1  — matchday 1 per group (Jun 11-18)
 *   group_2  — matchday 2 per group (Jun 19-25)
 *   group_3  — matchday 3 per group (Jun 26-28)
 *   r32      — round of 32
 *   r16      — round of 16
 *   qf       — quarter-finals
 *   sf       — semi-finals
 *   final    — final + 3rd place
 */
export const fantasyLineups = sqliteTable('fantasy_lineups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  round: text('round').notNull(),     // 'group_1' | 'group_2' | 'group_3' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  isStarter: integer('is_starter', { mode: 'boolean' }).notNull().default(false),
  isCaptain: integer('is_captain', { mode: 'boolean' }).notNull().default(false),
  isViceCaptain: integer('is_vice_captain', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqUserRoundPlayer: uniqueIndex('fantasy_lineups_user_round_player_idx')
    .on(t.userId, t.round, t.playerId),
}));

export type FantasyLineup = typeof fantasyLineups.$inferSelect;
export type NewFantasyLineup = typeof fantasyLineups.$inferInsert;

/**
 * Cache of each user's total fantasy points per round. Updated whenever
 * match scores are recomputed. Makes the standings query O(1) instead of
 * recalculating the whole history on every request.
 */
export const fantasyRoundScores = sqliteTable('fantasy_round_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  round: text('round').notNull(),
  points: integer('points').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqUserRound: uniqueIndex('fantasy_round_scores_user_round_idx').on(t.userId, t.round),
}));

export type FantasyRoundScore = typeof fantasyRoundScores.$inferSelect;
