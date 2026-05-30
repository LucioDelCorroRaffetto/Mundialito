import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { eq, asc } from 'drizzle-orm';

let cachedKickoff: { value: string | null; loadedAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes — kickoff barely changes

/**
 * Returns the ISO kickoff timestamp of the opening (group stage) match, or
 * null if there isn't one yet. Cached for 5 minutes since hammering this on
 * every leaderboard request would be wasteful.
 */
export async function getOpeningKickoffUtc(): Promise<string | null> {
  const now = Date.now();
  if (cachedKickoff && now - cachedKickoff.loadedAt < TTL_MS) {
    return cachedKickoff.value;
  }

  const row = await db
    .select({ kickoffUtc: matches.kickoffUtc })
    .from(matches)
    .where(eq(matches.round, 'group'))
    .orderBy(asc(matches.kickoffUtc))
    .limit(1)
    .get();

  cachedKickoff = { value: row?.kickoffUtc ?? null, loadedAt: now };
  return cachedKickoff.value;
}

/**
 * `true` once the first group-stage match has kicked off. Used to gate
 * achievement bonuses from the leaderboard so people don't accumulate
 * rankings purely from grindy pre-tournament logros.
 */
export async function tournamentHasStarted(): Promise<boolean> {
  const kickoff = await getOpeningKickoffUtc();
  if (!kickoff) return false;
  return Date.now() >= new Date(kickoff).getTime();
}
