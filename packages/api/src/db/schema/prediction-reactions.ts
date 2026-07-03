import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { predictions } from './predictions.js';
import { users } from './users.js';

export const predictionReactions = sqliteTable('prediction_reactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  predictionId: integer('prediction_id').notNull()
    .references(() => predictions.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('prediction_reactions_uniq').on(t.predictionId, t.userId, t.emoji),
  byPrediction: index('prediction_reactions_prediction_idx').on(t.predictionId),
}));

export type PredictionReaction = typeof predictionReactions.$inferSelect;
export type NewPredictionReaction = typeof predictionReactions.$inferInsert;
