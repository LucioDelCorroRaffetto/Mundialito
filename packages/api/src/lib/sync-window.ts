// Computes the score-feed query window so the sync can recover matches that
// got stuck before `finished` (Gotcha: "partidos colgados en scheduled/live").
//
// El bug: el feed se consultaba SIEMPRE con una ventana fija ayer→hoy, y el
// reconcile se autolimita a 12 h tras el kickoff. Un partido que no se resuelve
// dentro de esas ~48 h (cron caído >2 días, o el feed que no lo matchea un
// rato) queda colgado para siempre: el feed ya no lo mira y reconcile lo
// abandonó. Como los resultados SÍ siguen disponibles en football-data por
// fecha, basta con volver a preguntar desde la fecha del colgado más viejo.
//
// Pura a propósito (sin DB ni red) para poder testearla aislada, igual que
// score-sync.ts.

export interface MatchWindowRow {
  /** 'scheduled' | 'live' | 'finished' | 'suspended' */
  status: string;
  /** ISO 8601 kickoff time. */
  kickoffUtc: string;
}

const DAY_MS = 86_400_000;

/** YYYY-MM-DD (UTC) de un Date. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Devuelve el `dateFrom` (YYYY-MM-DD, UTC) con el que el feed de scores debe
 * consultar para que cualquier partido NO finalizado pero con kickoff ya
 * pasado vuelva a re-chequearse — no sólo el de ayer.
 *
 * - En estado normal (nada colgado) devuelve **ayer**: la ventana se mantiene
 *   chica y barata, idéntica al comportamiento previo.
 * - Si hay partidos no-finished con kickoff en el pasado, devuelve la fecha del
 *   kickoff más viejo entre ellos, de modo que el feed los traiga (FINISHED +
 *   score) y la lógica de sync existente los cierre y puntúe sola.
 * - Se acota a `maxLookbackDays` para acotar el costo (un CANCELLED/POSTPONED
 *   que nunca se juega no ensancha la ventana indefinidamente). football-data
 *   acepta el rango en UNA sola request, así que ensanchar es ~gratis.
 *
 * @param rows  filas con status + kickoffUtc (todos los partidos).
 * @param now   instante de referencia.
 * @param maxLookbackDays  tope de días hacia atrás (default 10).
 */
export function computeSyncDateFrom(
  rows: MatchWindowRow[],
  now: Date,
  maxLookbackDays = 10,
): string {
  const nowMs = now.getTime();
  const yesterdayMs = nowMs - DAY_MS;
  const floorMs = nowMs - maxLookbackDays * DAY_MS;

  // Arranca en "ayer": nunca devolvemos una ventana más angosta que la previa.
  let earliestMs = yesterdayMs;

  for (const r of rows) {
    if (r.status === 'finished') continue;
    const koMs = new Date(r.kickoffUtc).getTime();
    if (Number.isNaN(koMs)) continue;
    if (koMs >= nowMs) continue; // partido futuro: no está colgado
    if (koMs < earliestMs) earliestMs = koMs;
  }

  if (earliestMs < floorMs) earliestMs = floorMs;
  return utcDay(new Date(earliestMs));
}
