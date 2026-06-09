import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teams } from './teams.js';

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: text('position').notNull(), // 'GK' | 'DEF' | 'MID' | 'FWD'
  shirtNumber: integer('shirt_number'),
  photoUrl: text('photo_url'),           // URL or base64 — optional player photo
  // FIFA.com player ID, populated lazily on first match-event match. Once
  // set, future event lookups skip the fuzzy-name matching step.
  fifaIdPlayer: text('fifa_id_player'),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
