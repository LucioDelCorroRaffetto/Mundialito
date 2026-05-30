// Fetches live/finished match scores from football-data.org and updates our DB.
// API docs: https://www.football-data.org/documentation/quickstart
// Free tier: 10 requests/min, no auth needed for public competitions
// WC 2026 competition ID: "WC" (may need adjustment once tournament starts)

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../ws/broadcast.js';
import { checkAchievements } from './achievement-service.js';

// football-data.org status values
type FdStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'CANCELLED';

type OurStatus = 'scheduled' | 'live' | 'finished';

interface FdScore {
  home: number | null;
  away: number | null;
}

interface FdMatch {
  id: number;
  utcDate: string; // ISO 8601
  status: FdStatus;
  score: {
    fullTime: FdScore;
    halfTime: FdScore;
  };
  homeTeam: { id: number; tla: string | null; name: string };
  awayTeam: { id: number; tla: string | null; name: string };
}

interface FdResponse {
  matches: FdMatch[];
}

export interface SyncScoresOptions {
  dateFrom?: string; // ISO date string, e.g. '2026-06-11'
  dateTo?: string;   // ISO date string, e.g. '2026-06-11'
}

export interface SyncScoresResult {
  synced: number;
  errors: string[];
  matchesChecked: number;
}

function mapStatus(fdStatus: FdStatus): OurStatus {
  if (fdStatus === 'IN_PLAY' || fdStatus === 'PAUSED') return 'live';
  if (fdStatus === 'FINISHED') return 'finished';
  return 'scheduled';
}

interface OurMatch {
  id: number;
  kickoffUtc: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

/**
 * Attempts to find our DB match for a given football-data.org match by kickoff
 * time. Allows a ±10 minute window.
 */
function findMatchByKickoff(
  ourMatches: OurMatch[],
  fdKickoff: string,
): OurMatch | undefined {
  const fdTime = new Date(fdKickoff).getTime();
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  return ourMatches.find((m) => {
    const diff = Math.abs(new Date(m.kickoffUtc).getTime() - fdTime);
    return diff <= TEN_MINUTES_MS;
  });
}

export async function syncScores(options: SyncScoresOptions = {}): Promise<SyncScoresResult> {
  const errors: string[] = [];
  let synced = 0;
  let anyMatchFinished = false;

  // --- Build URL ---
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return { synced: 0, errors: ['FOOTBALL_DATA_API_KEY is not set'], matchesChecked: 0 };
  }

  const url = new URL('https://api.football-data.org/v4/competitions/WC/matches');
  if (options.dateFrom) url.searchParams.set('dateFrom', options.dateFrom);
  if (options.dateTo) url.searchParams.set('dateTo', options.dateTo);

  // --- Fetch from football-data.org ---
  let fdMatches: FdMatch[];
  try {
    const response = await fetch(url.toString(), {
      headers: { 'X-Auth-Token': apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        synced: 0,
        errors: [`football-data.org returned ${response.status}: ${text}`],
        matchesChecked: 0,
      };
    }

    const data = (await response.json()) as FdResponse;
    fdMatches = data.matches ?? [];
  } catch (err) {
    return {
      synced: 0,
      errors: [`Failed to fetch from football-data.org: ${String(err)}`],
      matchesChecked: 0,
    };
  }

  if (fdMatches.length === 0) {
    return { synced: 0, errors: [], matchesChecked: 0 };
  }

  // --- Load our matches once ---
  const ourMatches = await db
    .select({ id: matches.id, kickoffUtc: matches.kickoffUtc, homeScore: matches.homeScore, awayScore: matches.awayScore, status: matches.status })
    .from(matches);

  // --- Process each fd match ---
  for (const fdMatch of fdMatches) {
    try {
      const ourMatch = findMatchByKickoff(ourMatches, fdMatch.utcDate);
      if (!ourMatch) continue; // No corresponding match in our DB — skip

      const newStatus = mapStatus(fdMatch.status);
      const newHomeScore = fdMatch.score.fullTime.home ?? null;
      const newAwayScore = fdMatch.score.fullTime.away ?? null;

      // Check if anything changed
      const statusChanged = ourMatch.status !== newStatus;
      const scoreChanged =
        ourMatch.homeScore !== newHomeScore || ourMatch.awayScore !== newAwayScore;

      if (!statusChanged && !scoreChanged) continue;

      // Build update payload
      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newHomeScore !== null) updatePayload.homeScore = newHomeScore;
      if (newAwayScore !== null) updatePayload.awayScore = newAwayScore;

      const [updatedMatch] = await db
        .update(matches)
        .set(updatePayload)
        .where(eq(matches.id, ourMatch.id))
        .returning();

      synced++;

      // Recalculate prediction points when the match just became finished
      if (
        newStatus === 'finished' &&
        newHomeScore !== null &&
        newAwayScore !== null
      ) {
        anyMatchFinished = true;

        const matchPredictions = await db
          .select()
          .from(predictions)
          .where(eq(predictions.matchId, ourMatch.id));

        // Track unique users so we fire `prediction_scored` once per user per
        // match (a user can have N rows — one per league — for the same match).
        const scoredUsers = new Map<number, number>();
        for (const pred of matchPredictions) {
          const pts = calculatePoints(
            { homeScore: pred.homeScore, awayScore: pred.awayScore },
            { homeScore: newHomeScore, awayScore: newAwayScore },
          );
          await db
            .update(predictions)
            .set({ points: pts, updatedAt: sql`(datetime('now'))` })
            .where(eq(predictions.id, pred.id));
          // Highest pts wins if duplicated across leagues (same prediction → same pts).
          const prev = scoredUsers.get(pred.userId) ?? -1;
          if (pts > prev) scoredUsers.set(pred.userId, pts);
        }
        for (const [uid, pts] of scoredUsers) {
          checkAchievements(uid, { type: 'prediction_scored', matchId: ourMatch.id, points: pts })
            .catch(() => {});
        }
      }

      // Broadcast the update to connected WebSocket clients
      broadcastMatchUpdate(updatedMatch);
    } catch (err) {
      errors.push(`Match fd#${fdMatch.id} (${fdMatch.utcDate}): ${String(err)}`);
    }
  }

  // Recompute fantasy points once if any match became finished this sync.
  if (anyMatchFinished) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      errors.push(`Fantasy recompute failed: ${String(err)}`);
    }
  }

  return { synced, errors, matchesChecked: fdMatches.length };
}
