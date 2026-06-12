import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { matches } from './matches.js';
import { players } from './players.js';
import { teams } from './teams.js';

/**
 * Eventos individuales del partido con minuto.
 *
 * Es complementaria a player_match_stats (que tiene los agregados por
 * jugador): match_events guarda CADA gol / asistencia / tarjeta con
 * el minuto y el período, para poder mostrar timeline en la UI.
 *
 * Por qué no derivar todo de aquí: el agregado se usa en el scoring
 * fantasy y para los leaderboards; tenerlo precomputado evita queries
 * GROUP BY en hot paths. La duplicación cuesta poco — el sync escribe
 * ambas tablas en la misma corrida.
 *
 * Tipo de eventos: 'goal', 'assist', 'yellow', 'red'. (substitution,
 * fouls neutros, etc. NO se guardan — solo lo que el usuario quiere ver
 * en la pantalla del partido).
 */
export const matchEvents = sqliteTable(
  'match_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['goal', 'assist', 'yellow', 'red'] }).notNull(),
    minute: integer('minute'),  // null = no se publicó el minuto en el feed
    period: integer('period'),  // 1=1T, 2=2T, 3=ET1, 4=ET2, 5=penales
  },
  (t) => ({
    byMatch: index('match_events_match_idx').on(t.matchId),
  }),
);

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
