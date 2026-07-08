import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { teams } from './teams.js';

export const matches = sqliteTable('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchNumber: integer('match_number').notNull().unique(),
  homeTeamId: integer('home_team_id').references(() => teams.id),
  awayTeamId: integer('away_team_id').references(() => teams.id),
  kickoffUtc: text('kickoff_utc').notNull(),
  /**
   * MUST be set to kickoffUtc - 5 minutes. Use calcPredictionLock() from lib/match-helpers.
   * Worker debe recalcular este campo cada vez que kickoffUtc cambie.
   */
  predictionLockUtc: text('prediction_lock_utc').notNull(),
  venue: text('venue').notNull(),
  city: text('city').notNull(),
  group: text('group'),
  round: text('round').notNull().default('group'), // 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'
  /**
   * 'scheduled' | 'live' | 'finished' | 'suspended'
   *
   * 'suspended' = partido interrumpido (clima/seguridad) o aplazado/cancelado.
   * Es un HOLD pegajoso: una vez en 'suspended' los feeds NO lo vuelven a
   * 'live'/'scheduled' tick a tick (durante una demora por tormenta ESPN suele
   * seguir reportando IN_PLAY) — solo sale de 'suspended' por un 'finished'
   * terminal (pitazo final) o un override manual del admin. reconcile ignora
   * las filas que no están 'live'/'scheduled', así que esto también bloquea el
   * auto-cierre falso de 3,5 h. Caso real (jun-2026): FRA-IRQ suspendido por
   * rayos al 45'+4' quedaba clavado en "EN VIVO" porque no había pitazo final.
   */
  status: text('status').notNull().default('scheduled'),
  /**
   * Sub-estado mientras `status === 'live'`. Refleja la fase de juego que
   * publica el feed de scores (football-data.org `PAUSED` ≡ entretiempo;
   * ESPN `STATUS_HALFTIME` / `STATUS_END_PERIOD`). Permite al frontend
   * distinguir "1° tiempo" / "Entretiempo" / "2° tiempo" en lugar de
   * mostrar siempre "EN VIVO". Null mientras el partido no esté en curso
   * o el feed no aporte detalle.
   *
   * Valores: 'in_play' | 'half_time' | 'cooling_break' | 'extra_time' |
   *          'extra_time_break' | 'penalty_shootout' | 'full_time'
   *
   * Nota de diseño: lo escriben los syncs de score (sync-scores y
   * sync-espn) y también sync-fifa-stats cuando detecta cooling break
   * por descripción de evento (FIFA es la única fuente que lo publica).
   */
  liveStatus: text('live_status'),
  /**
   * Último minuto reportado por FIFA para este partido, como string
   * crudo: "67'", "90'+3'", "ET 5'", etc. Se actualiza en cada tick del
   * sync FIFA con el MatchMinute del evento más reciente. Útil para
   * mostrar "vamos 78'" sin que la app tenga que estimar desde kickoff.
   * Null hasta que el partido tenga al menos un evento.
   */
  currentMinute: text('current_minute'),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  /**
   * Manual score override. When 1, the score sync feeds (sync-scores /
   * sync-espn) will NOT overwrite home_score/away_score nor re-score
   * predictions for this match — the admin set the result by hand because a
   * feed was wrong. Status/liveStatus still sync normally. Set by the admin
   * update-match endpoint (and by hand when correcting a bad feed result).
   * Caso real (jun-2026): football-data publicó ESP-KSA 5-0 cuando terminó
   * 4-0 (ESPN y la timeline FIFA = 4 goles); sin este flag el sync revertía
   * la corrección cada 3 min.
   */
  scoreLocked: integer('score_locked').notNull().default(0),
  /**
   * 1 cuando el partido de eliminación se definió por PENALES. El marcador
   * guardado lleva +1 al ganador (lo suman los syncs para que el delta refleje
   * al ganador), así que este flag es la única señal de que el resultado salió
   * de la tanda — la lista de partidos no expone el timeline para inferirlo.
   * Lo escriben sync-scores (football-data `duration=PENALTY_SHOOTOUT`) y
   * sync-espn (cuando aplica el bump del ganador de la tanda). Permite a la UI
   * (cuadro, lista) anotar "(pen.)" sin tener que cargar el timeline.
   */
  decidedByPenalties: integer('decided_by_penalties').notNull().default(0),
  /**
   * Ganador de la tanda de PENALES expresado como LADO del partido
   * ('home' | 'away'), independiente del marcador. Es la señal explícita que usa
   * el CUADRO para propagar al ganador cuando el marcador guardado quedó EMPATE
   * (sin el +1 del modelo de bump) — caso típico: el feed cierra el KO 0-0 sin
   * reportar la tanda. A diferencia del bump, esto NO toca home_score/away_score,
   * así que el scoring de predicciones (que puntúa contra el marcador guardado)
   * queda intacto. Null cuando el cruce no se definió por penales.
   *
   * Nota: se guarda el LADO (no el team_id) porque en eliminatoria
   * home_team_id/away_team_id siguen apuntando al placeholder TBD; el cuadro
   * resuelve la identidad real del lado por proyección.
   */
  penaltyWinner: text('penalty_winner').$type<'home' | 'away'>(),
  apiFixtureId: integer('api_fixture_id'), // nullable — API-Football fixture ID (no longer used in free tier)
  // FIFA.com API identifiers for the per-match timeline endpoint. We use
  // FIFA's public API for player stats (goals/assists/cards) because
  // API-Football's free tier blocks WC 2026 entirely. fifaIdStage is the
  // bracket stage (group / r32 / r16 / …) that FIFA assigns numerically.
  fifaIdMatch: text('fifa_id_match'),
  fifaIdStage: text('fifa_id_stage'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export type Match = typeof matches.$inferSelect;
