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
 * Tipo de eventos: 'goal', 'assist', 'yellow', 'red', 'sub_in', 'sub_out',
 * 'penalty_miss', 'penalty_save', 'penalty_goal'.
 *
 * Los tres últimos son exclusivos de la tanda de penales (Period 11 en FIFA,
 * normalizado a period=5 en nuestra DB):
 *   'penalty_goal'  — penal convertido en la tanda (FIFA Type 41, Period 11)
 *   'penalty_miss'  — penal errado en la tanda (FIFA Type 65)
 *   'penalty_save'  — penal atajado en la tanda (FIFA Type 60)
 * Se diferencian de 'goal' (penal en juego) para que la UI muestre la
 * cronología completa de la definición sin inflar las estadísticas de goles
 * fantasy (la tanda no cuenta como gol en el juego).
 *
 * SQLite no enforce el enum a nivel DB; la restricción vive solo en el tipo TS.
 */
export const matchEvents = sqliteTable(
  'match_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['goal', 'own_goal', 'assist', 'yellow', 'red', 'sub_in', 'sub_out', 'penalty_miss', 'penalty_save', 'penalty_goal'] }).notNull(),
    minute: integer('minute'),  // null = no se publicó el minuto en el feed
    period: integer('period'),  // 1=1T, 2=2T, 3=ET1, 4=ET2, 5=penales
  },
  (t) => ({
    byMatch: index('match_events_match_idx').on(t.matchId),
  }),
);

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
