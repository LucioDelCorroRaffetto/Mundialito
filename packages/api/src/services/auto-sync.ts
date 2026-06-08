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

import { syncScores, type SyncScoresOptions, type SyncScoresResult } from './sync-scores.js';
import { syncScoresFromEspn } from './sync-espn.js';

const THREE_MINUTES  = 3  * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

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

// Singleton guard: prevent two startAutoSync() calls from spawning duplicate
// intervals. The most common cause is a hot reload during dev or an
// accidental double-import; without this the same DB would be hit 2× per
// tick, doubling fantasy recompute load and the football-data quota burn.
let started = false;
let todayTimer: ReturnType<typeof setInterval> | null = null;
let yesterdayTimer: ReturnType<typeof setInterval> | null = null;

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
}

/** Stops the auto-sync timers — used by graceful shutdown handlers in server.ts. */
export function stopAutoSync() {
  if (todayTimer) clearInterval(todayTimer);
  if (yesterdayTimer) clearInterval(yesterdayTimer);
  todayTimer = null;
  yesterdayTimer = null;
  started = false;
}
