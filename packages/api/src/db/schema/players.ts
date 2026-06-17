import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teams } from './teams.js';

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: text('position').notNull(), // 'GK' | 'DEF' | 'MID' | 'FWD'
  /**
   * Sub-position roles más granulares: CSV ej. "LW,LB" o "ST". Se pobla
   * del campo `position = ...` del infobox de Wikipedia del jugador.
   * Lo usa el asignador de slots del LineupPitch para poner a Haaland en
   * ST aunque sea uno de varios FWD, y a Nico González en LW/LB aunque
   * en `position` figure como MID. Null/vacío cuando Wikipedia no
   * publica info (suplentes muy poco cubiertos) — el caller cae a
   * `position` base.
   */
  subPosition: text('sub_position'),
  shirtNumber: integer('shirt_number'),
  photoUrl: text('photo_url'),           // URL or base64 — optional player photo
  // FIFA.com player ID, populated lazily on first match-event match. Once
  // set, future event lookups skip the fuzzy-name matching step.
  fifaIdPlayer: text('fifa_id_player'),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
