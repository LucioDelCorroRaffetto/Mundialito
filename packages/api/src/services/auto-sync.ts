/**
 * Auto-sync service: keeps scores updated during the tournament without
 * manual intervention.
 *
 * Strategy:
 *  Primary:  football-data.org  (every 3 min, requires FOOTBALL_DATA_API_KEY)
 *  Fallback: ESPN public API    (no key, no limits, triggered automatically
 *                                when primary fails or key is missing)
 *
 * Schedule:
 *  - Every 3 min  → sync today
 *  - Every 30 min → also sync yesterday (safety net for late-night finishes)
 */

import { eq } from 'drizzle-orm';
import { syncScores, type SyncScoresOptions, type SyncScoresResult } from './sync-scores.js';
import { syncScoresFromEspn } from './sync-espn.js';
import { syncLiveMatches } from './sync-live.js';
import { invalidateForecastCache } from './forecast-service.js';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';

const THREE_MINUTES  = 3  * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
// Cadencia rápida del vivo. El cuello de botella del lag (gol/cooling break/
// minuto) era la cadencia del cron externo (~3 min): un cooling break dura
// ~2-3 min, así que muestreando cada 3 min casi siempre se mostraba tarde o se
// perdía. Este tick corre seguido SOLO cuando hay partidos en vivo, usando
// ESPN (sin key, sin cuota) para el score y FIFA (público) para timeline +
// cooling break + cierre por pitazo. football-data sigue intacto cada 3 min
// como fuente autoritativa.
//
// 40s: el score y la timeline solo se refrescan en este tick, así que su
// cadencia es el piso del lag del backend. Estuvo en 20s, pero aunque ESPN y
// FIFA no tienen cuota de requests, SÍ cuentan para el bandwidth saliente de
// Render (Service-Initiated): cada tick baja el scoreboard completo de ESPN
// (hoy + ayer) + la timeline FIFA, y a 20s eso consumía la mayor parte de los
// 5 GB del free tier durante el torneo. A 40s se corta ese gasto a la mitad
// con un costo de latencia chico (delay percibido ~55s en vez de ~35s).
const LIVE_TICK_MS = 40 * 1000;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns true if the primary result looks like a failure:
 *  - has errors (network issue, key expired, 4xx/5xx, etc.)
 *  - OR the key is not set at all
 */
function primaryFailed(result: SyncScoresResult): boolean {
  return result.errors.length > 0;
}

// In-flight guard so two simultaneous ticks (the today + yesterday intervals
// align every 30 min, and the initial setTimeout can race with the first
// interval) don't both hit the API and double-update the DB. Also prevents
// the heavy `recomputeAllFantasyPoints` from running concurrently with
// itself.
let syncInFlight = false;

async function runSync(label: string, options: SyncScoresOptions) {
  const date = options.dateFrom ?? todayUTC();
  let provider = 'football-data.org';

  if (syncInFlight) {
    console.log(`[AutoSync:${label}] another sync is in flight — skipping`);
    return;
  }
  syncInFlight = true;

  try {
    // 1️⃣ Try primary (football-data.org)
    let result: SyncScoresResult;

    if (!process.env.FOOTBALL_DATA_API_KEY) {
      // Key not configured — go straight to fallback
      result = { synced: 0, errors: ['FOOTBALL_DATA_API_KEY not set'], matchesChecked: 0 };
    } else {
      result = await syncScores(options);
    }

    if (primaryFailed(result)) {
      // 2️⃣ Fallback: ESPN (no key required, no rate limits)
      provider = 'ESPN';
      console.warn(`[AutoSync:${label}] Primary failed (${result.errors.join('; ')}) — trying ESPN fallback`);
      result = await syncScoresFromEspn(date);
    }

    // Log meaningful activity only
    if (result.synced > 0) {
      console.log(`[AutoSync:${label}][${provider}] synced=${result.synced} checked=${result.matchesChecked}`);
    }
    if (result.errors.length > 0) {
      console.error(`[AutoSync:${label}][${provider}] errors:`, result.errors);
    }
  } catch (err) {
    console.error(`[AutoSync:${label}] unexpected error:`, err);
  } finally {
    syncInFlight = false;
  }
}

/**
 * Tick rápido del vivo. Comparte el `syncInFlight` con runSync para serializar
 * toda la escritura de sync (no hay dos writers concurrentes en la DB). Hace un
 * pre-check barato: si no hay partidos `live` no llama a ninguna fuente externa
 * (este tick corre 24/7, no queremos pegarle a ESPN/FIFA cuando no hay fútbol).
 */
async function runLiveSync() {
  // Pre-check barato ANTES de tomar el lock: si no hay partidos en vivo no
  // tocamos el guard ni ninguna fuente externa (este tick corre 24/7).
  const live = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.status, 'live'))
    .catch(() => [] as { id: number }[]);
  if (live.length === 0) return;

  if (syncInFlight) return; // un sync (3min o vivo) ya está corriendo
  syncInFlight = true;
  try {
    // Score por ESPN (sin key, sin cuota) para que el marcador se mueva rápido
    // sin quemar football-data. Pedimos hoy + ayer UTC porque un partido que
    // arranca cerca de medianoche UTC sigue "live" pasada la medianoche y
    // ESPN interpreta `dates` en horario del Este (Gotcha #3) — sin `ayer`
    // ese partido se quedaría sin refresco de score en esos ticks.
    // football-data sigue siendo autoritativo cada 3 min y corrige cualquier
    // discrepancia.
    const [espnT, espnY] = await Promise.all([
      syncScoresFromEspn(todayUTC()).catch((err) => {
        console.error('[LiveSync] ESPN score error (today):', err);
        return null;
      }),
      syncScoresFromEspn(yesterdayUTC()).catch((err) => {
        console.error('[LiveSync] ESPN score error (yesterday):', err);
        return null;
      }),
    ]);
    const espnSynced = (espnT?.synced ?? 0) + (espnY?.synced ?? 0);

    // Timeline FIFA + cooling break + cierre por pitazo final.
    const res = await syncLiveMatches();

    // Invalida el cache de forecast si CUALQUIER fuente movió algo — incluido
    // un gol que ESPN ya reflejó pero que FIFA todavía no publicó en la
    // timeline (lag de hasta ~30s), para no servir score viejo hasta el
    // próximo tick.
    if (espnSynced > 0 || res.eventsSynced > 0 || res.anyFinalized) {
      invalidateForecastCache();
    }
  } catch (err) {
    console.error('[LiveSync] unexpected error:', err);
  } finally {
    syncInFlight = false;
  }
}

// Singleton guard: prevent two startAutoSync() calls from spawning duplicate
// intervals. The most common cause is a hot reload during dev or an
// accidental double-import; without this the same DB would be hit 2× per
// tick, doubling fantasy recompute load and the football-data quota burn.
let started = false;
let todayTimer: ReturnType<typeof setInterval> | null = null;
let yesterdayTimer: ReturnType<typeof setInterval> | null = null;
let liveTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSync() {
  if (started) {
    console.warn('[AutoSync] already started — ignoring duplicate startAutoSync()');
    return;
  }
  started = true;

  const hasKey = !!process.env.FOOTBALL_DATA_API_KEY;
  if (!hasKey) {
    console.warn('[AutoSync] FOOTBALL_DATA_API_KEY not set — will use ESPN API as primary');
  } else {
    console.log('[AutoSync] football-data.org primary + ESPN fallback — every 3 min');
  }

  // Initial run shortly after server starts
  setTimeout(() => runSync('today', { dateFrom: todayUTC(), dateTo: todayUTC() }), 15_000);

  // Every 3 minutes: today's matches
  todayTimer = setInterval(() => runSync('today', { dateFrom: todayUTC(), dateTo: todayUTC() }), THREE_MINUTES);

  // Every 30 minutes: yesterday too (catches late finishes / delayed status updates)
  yesterdayTimer = setInterval(() => runSync('yesterday', { dateFrom: yesterdayUTC(), dateTo: yesterdayUTC() }), THIRTY_MINUTES);

  // Cada 40s: tick rápido del vivo (solo actúa si hay partidos en vivo).
  console.log('[AutoSync] live tick (ESPN score + FIFA timeline) — cada 40s mientras haya partidos en vivo');
  liveTimer = setInterval(() => runLiveSync(), LIVE_TICK_MS);
}

/** Stops the auto-sync timers — used by graceful shutdown handlers in server.ts. */
export function stopAutoSync() {
  if (todayTimer) clearInterval(todayTimer);
  if (yesterdayTimer) clearInterval(yesterdayTimer);
  if (liveTimer) clearInterval(liveTimer);
  todayTimer = null;
  yesterdayTimer = null;
  liveTimer = null;
  started = false;
}
