/**
 * Sincronización "en vivo" de alta frecuencia: refresca la timeline FIFA
 * (goles/tarjetas/subs minuto a minuto + cooling break + minuto actual) y
 * cierra los partidos por el pitazo final (Type 26) para todos los matches
 * que están `live` o `suspended`. NO toca scores (eso es del sync de scores), ni
 * reconcile/squads/fixtures.
 *
 * Por qué incluir 'suspended': cuando un partido se suspende (clima, seguridad)
 * y luego se reanuda, sync-scores mantiene el estado 'suspended' en la DB para
 * evitar que reconcile lo cierre automáticamente a las 3.5h. Pero eso hacía
 * que sync-live lo saltee → la cronología FIFA se congelaba desde la suspensión
 * hasta el final. Al incluir 'suspended' aquí la timeline sigue actualizándose
 * durante y después de la reanudación, y el final whistle de FIFA puede cerrar
 * el partido aunque la DB no haya vuelto a 'live'.
 *
 * Se extrajo del handler `POST /sync` (app.ts) para poder reusar exactamente
 * la misma lógica desde un timer interno de alta frecuencia (auto-sync), y así
 * bajar el lag del vivo —gol, cooling break, minuto— SIN depender de la
 * cadencia del cron externo (cron-job.org) ni quemar la cuota de football-data
 * (FIFA es público y sin límite). Idempotente y defensiva por partido: una
 * falla en un match no contamina al resto del tick.
 */
import { inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { syncFifaStatsForMatch } from './sync-fifa-stats.js';
import { finalizeMatchFromFinalWhistle } from './finalize-match.js';

export interface LiveFifaResult {
  matchId: number;
  upserted: number;
  skipped?: string;
  error?: string;
  finalized?: boolean;
}

export interface SyncLiveResult {
  liveMatchCount: number;
  fifaResults: LiveFifaResult[];
  eventsSynced: number;
  anyFinalized: boolean;
}

export async function syncLiveMatches(): Promise<SyncLiveResult> {
  const liveMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(inArray(matches.status, ['live', 'suspended']))
    .catch((err) => {
      console.error('[sync-live] failed loading live matches:', err);
      return [] as { id: number }[];
    });

  if (liveMatches.length === 0) {
    return { liveMatchCount: 0, fifaResults: [], eventsSynced: 0, anyFinalized: false };
  }

  // Sync en paralelo — awaits secuenciales multiplicarían la latencia de cada
  // request FIFA por la cantidad de partidos simultáneos. `inFlight` dentro de
  // syncFifaStatsForMatch evita la re-entrada por match; las llamadas entre
  // matches son independientes así que concurrente es seguro.
  const fifaResults: LiveFifaResult[] = await Promise.all(
    liveMatches.map(async (m) => {
      try {
        const r = await syncFifaStatsForMatch(m.id, { force: true });
        if (r.skipped) {
          console.log(`[sync-live] match ${m.id}: skipped (${r.skipped})`);
        } else {
          console.log(`[sync-live] match ${m.id}: ${r.upserted} events synced`);
        }
        // Si FIFA ya marcó el pitazo final, cerramos el partido sin esperar a
        // que football-data/ESPN lo marquen FINISHED (~10 min de delay).
        let finalized = false;
        if (r.finalWhistle) {
          const fin = await finalizeMatchFromFinalWhistle(m.id);
          finalized = fin.finalized;
          if (fin.finalized) {
            console.log(`[sync-live] match ${m.id}: cerrado por final whistle (${fin.scored} pronósticos)`);
          }
        }
        return { matchId: m.id, upserted: r.upserted, skipped: r.skipped, finalized };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[sync-live] match ${m.id}: ${msg}`);
        return { matchId: m.id, upserted: 0, error: msg };
      }
    }),
  );

  const eventsSynced = fifaResults.reduce((acc, r) => acc + r.upserted, 0);
  const anyFinalized = fifaResults.some((r) => r.finalized);
  return { liveMatchCount: liveMatches.length, fifaResults, eventsSynced, anyFinalized };
}
