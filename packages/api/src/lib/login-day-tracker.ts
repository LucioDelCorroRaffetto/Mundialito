import { db } from '../db/index.js';
import { userLoginDays } from '../db/schema/index.js';

/**
 * Records that `userId` was active today (UTC). Fire-and-forget — we never
 * await this and the request path doesn't care if it fails.
 *
 * In-memory cache short-circuits when we've already recorded the user for
 * today, avoiding hundreds of `INSERT OR IGNORE` round-trips per request
 * burst. Cache resets on cold-start; the unique (user_id, day) index in
 * the DB handles any false-misses safely.
 */
const recentlyRecorded = new Map<number, string>();

export function recordLoginDay(userId: number): void {
  const day = new Date().toISOString().slice(0, 10);
  if (recentlyRecorded.get(userId) === day) return;
  recentlyRecorded.set(userId, day);

  // Best effort, never throws to the caller.
  db.insert(userLoginDays)
    .values({ userId, day })
    .onConflictDoNothing()
    .catch(() => {});
}
