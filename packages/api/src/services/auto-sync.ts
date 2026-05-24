/**
 * Auto-sync service: runs syncScores() on a timer so scores update
 * automatically during the tournament without manual intervention.
 *
 * Strategy:
 *  - Every 3 minutes: sync today's matches (catches live updates & final scores)
 *  - Every 30 minutes: also sync yesterday (safety net for late-night finishes)
 *
 * football-data.org free tier: 10 req/min → 1 req/3min is well within limits.
 */

import { syncScores } from './sync-scores.js';

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

async function runSync(label: string, dateFrom: string, dateTo: string) {
  if (!process.env.FOOTBALL_DATA_API_KEY) return; // silently skip if key not set

  try {
    const result = await syncScores({ dateFrom, dateTo });
    if (result.synced > 0) {
      console.log(`[AutoSync:${label}] synced=${result.synced} checked=${result.matchesChecked}`);
    }
    if (result.errors.length > 0) {
      console.error(`[AutoSync:${label}] errors:`, result.errors);
    }
  } catch (err) {
    console.error(`[AutoSync:${label}] unexpected error:`, err);
  }
}

export function startAutoSync() {
  if (!process.env.FOOTBALL_DATA_API_KEY) {
    console.warn('[AutoSync] FOOTBALL_DATA_API_KEY not set — auto-sync disabled');
    return;
  }

  console.log('[AutoSync] Starting: every 3 min for today, every 30 min for yesterday');

  // Initial run after a short delay (let the server fully start first)
  setTimeout(() => runSync('today', todayUTC(), todayUTC()), 15_000);

  // Every 3 minutes: sync today
  setInterval(() => runSync('today', todayUTC(), todayUTC()), THREE_MINUTES);

  // Every 30 minutes: sync yesterday too (catches any matches that finished
  // after midnight or where status update was delayed)
  setInterval(() => runSync('yesterday', yesterdayUTC(), yesterdayUTC()), THIRTY_MINUTES);
}
