import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { leagues } from './leagues.js';
import { teams } from './teams.js';
import { players } from './players.js';

export const tournamentPredictions = sqliteTable('tournament_predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  championTeamId: integer('champion_team_id').references(() => teams.id),
  runnerUpTeamId: integer('runner_up_team_id').references(() => teams.id),
  topScorerPlayerId: integer('top_scorer_player_id').references(() => players.id),
  revelationTeamId: integer('revelation_team_id').references(() => teams.id),
  surpriseEliminatedTeamId: integer('surprise_eliminated_team_id').references(() => teams.id),
  points: integer('points'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqUserLeague: uniqueIndex('tournament_predictions_user_league_idx').on(t.userId, t.leagueId),
}));

export type TournamentPrediction = typeof tournamentPredictions.$inferSelect;
export type NewTournamentPrediction = typeof tournamentPredictions.$inferInsert;
