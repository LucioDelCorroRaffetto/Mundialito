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
  status: text('status').notNull().default('scheduled'), // 'scheduled' | 'live' | 'finished'
  /**
   * Sub-estado mientras `status === 'live'`. Refleja la fase de juego que
   * publica el feed de scores (football-data.org `PAUSED` ≡ entretiempo;
   * ESPN `STATUS_HALFTIME` / `STATUS_END_PERIOD`). Permite al frontend
   * distinguir "1° tiempo" / "Entretiempo" / "2° tiempo" en lugar de
   * mostrar siempre "EN VIVO". Null mientras el partido no esté en curso
   * o el feed no aporte detalle.
   *
   * Valores: 'in_play' | 'half_time' | 'extra_time_break' |
   *          'penalty_shootout' | 'full_time'
   *
   * Nota de diseño: derivamos esto de los mismos feeds que ya consumimos
   * para el score (sync-scores y sync-espn) — NO del timeline de FIFA,
   * que se baja una sola vez al finalizar el partido (sync-fifa-stats).
   */
  liveStatus: text('live_status'),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
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
