import { sqliteTable, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { fantasyTeams } from './fantasy-teams.js';
import { players } from './players.js';

// Max 15 players per squad: 2 GK + 5 DEF + 5 MID + 3 FWD
// isStarter: 11 starters from the 15
export const fantasySquadPlayers = sqliteTable('fantasy_squad_players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fantasyTeamId: integer('fantasy_team_id').notNull().references(() => fantasyTeams.id, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  isStarter: integer('is_starter', { mode: 'boolean' }).notNull().default(false),
  isCaptain: integer('is_captain', { mode: 'boolean' }).notNull().default(false),
  isViceCaptain: integer('is_vice_captain', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  uniqTeamPlayer: uniqueIndex('fantasy_squad_players_team_player_idx').on(t.fantasyTeamId, t.playerId),
}));

export type FantasySquadPlayer = typeof fantasySquadPlayers.$inferSelect;
export type NewFantasySquadPlayer = typeof fantasySquadPlayers.$inferInsert;
