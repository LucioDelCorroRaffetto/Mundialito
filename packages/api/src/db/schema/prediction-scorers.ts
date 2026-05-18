import { sqliteTable, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { predictions } from './predictions.js';
import { players } from './players.js';

export const predictionScorers = sqliteTable('prediction_scorers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  predictionId: integer('prediction_id').notNull().references(() => predictions.id, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
}, (t) => ({
  uniqPredictionPlayer: uniqueIndex('prediction_scorers_pred_player_idx').on(t.predictionId, t.playerId),
}));

export type PredictionScorer = typeof predictionScorers.$inferSelect;
export type NewPredictionScorer = typeof predictionScorers.$inferInsert;
