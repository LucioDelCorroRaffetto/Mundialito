/**
 * Lock de las predicciones de Copa (campeón, goleador, etc.).
 *
 * Originalmente cerraba 5 min antes del partido inaugural; se extendió
 * primero 24h y luego una semana adicional: los pronósticos de torneo no
 * afectan partidos ya jugados — el scoring se evalúa al final del torneo —
 * así que tuvo sentido aceptar entradas tardías mientras seguía abierta la
 * fase de grupos. Cerró el 2026-06-19 18:55 UTC.
 *
 * Compartido entre el upsert (rechaza escrituras post-lock) y el listado por
 * liga (no muestra picks ajenos ANTES del lock, para que nadie copie).
 */
export const TOURNAMENT_LOCK_UTC = '2026-06-19T18:55:00Z';

export function isTournamentPredictionsLocked(now: Date = new Date()): boolean {
  return new Date(TOURNAMENT_LOCK_UTC) <= now;
}
