import { sqliteTable, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { matches } from './matches.js';
import { players } from './players.js';

// Real-world performance of a player in a single match.
// Clean sheet is NOT stored — it's derived in the fantasy scoring engine
// (played && opponent scored 0 in that finished match).
export const playerMatchStats = sqliteTable('player_match_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  played: integer('played', { mode: 'boolean' }).notNull().default(false),
  goals: integer('goals').notNull().default(0),
  assists: integer('assists').notNull().default(0),
  yellowCards: integer('yellow_cards').notNull().default(0),
  redCard: integer('red_card', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  uniqMatchPlayer: uniqueIndex('player_match_stats_match_player_idx').on(t.matchId, t.playerId),
}));

export type PlayerMatchStat = typeof playerMatchStats.$inferSelect;
export type NewPlayerMatchStat = typeof playerMatchStats.$inferInsert;
