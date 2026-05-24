/**
 * ESPN fallback sync — uses ESPN's unofficial public API.
 * No API key required. Used automatically when football-data.org fails.
 *
 * Endpoint: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD
 *
 * Status mapping:
 *   state "pre"  → scheduled
 *   state "in"   → live  (includes STATUS_IN_PROGRESS, STATUS_HALFTIME, STATUS_END_PERIOD)
 *   state "post" → finished
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../ws/broadcast.js';
import type { SyncScoresResult } from './sync-scores.js';

// ─── ESPN response types ──────────────────────────────────────────────────────

interface EspnStatusType {
  name: string;       // 'STATUS_SCHEDULED' | 'STATUS_IN_PROGRESS' | 'STATUS_HALFTIME' | 'STATUS_FINAL' | …
  state: 'pre' | 'in' | 'post';
  completed: boolean;
}

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score: string;      // "0", "1", "2", …  (string even when 0)
  team: {
    displayName: string;
    abbreviation: string;
  };
}

interface EspnEvent {
  id: string;
  date: string;       // ISO 8601 UTC, e.g. "2026-06-11T19:00Z"
  status: { type: EspnStatusType };
  competitions: Array<{ competitors: EspnCompetitor[] }>;
}

interface EspnResponse {
  events?: EspnEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type OurStatus = 'scheduled' | 'live' | 'finished';

function mapState(state: 'pre' | 'in' | 'post', completed: boolean): OurStatus {
  if (completed || state === 'post') return 'finished';
  if (state === 'in') return 'live';
  return 'scheduled';
}

interface OurMatch {
  id: number;
  kickoffUtc: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

function findMatchByKickoff(ourMatches: OurMatch[], espnDate: string): OurMatch | undefined {
  const espnTime = new Date(espnDate).getTime();
  const TEN_MIN = 10 * 60 * 1000;
  return ourMatches.find((m) => Math.abs(new Date(m.kickoffUtc).getTime() - espnTime) <= TEN_MIN);
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches today's (or any date's) WC matches from ESPN and updates our DB.
 * Returns the same SyncScoresResult shape as syncScores() for consistent logging.
 */
export async function syncScoresFromEspn(date: string): Promise<SyncScoresResult> {
  const errors: string[] = [];
  let synced = 0;
  let anyMatchFinished = false;

  // ESPN wants YYYYMMDD (no dashes)
  const espnDate = date.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${espnDate}`;

  let events: EspnEvent[];
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, // some CDN edges need a UA
    });
    if (!res.ok) {
      return { synced: 0, errors: [`ESPN returned ${res.status}`], matchesChecked: 0 };
    }
    const data = (await res.json()) as EspnResponse;
    events = data.events ?? [];
  } catch (err) {
    return { synced: 0, errors: [`ESPN fetch failed: ${String(err)}`], matchesChecked: 0 };
  }

  if (events.length === 0) {
    return { synced: 0, errors: [], matchesChecked: 0 };
  }

  // Load our DB matches once
  const ourMatches = await db
    .select({ id: matches.id, kickoffUtc: matches.kickoffUtc, homeScore: matches.homeScore, awayScore: matches.awayScore, status: matches.status })
    .from(matches);

  for (const event of events) {
    try {
      const ourMatch = findMatchByKickoff(ourMatches, event.date);
      if (!ourMatch) continue;

      const { state, completed } = event.status.type;
      const newStatus = mapState(state, completed);

      // Extract scores
      const competition = event.competitions[0];
      if (!competition) continue;

      const homeComp = competition.competitors.find((c) => c.homeAway === 'home');
      const awayComp = competition.competitors.find((c) => c.homeAway === 'away');

      // During pre-match ESPN may still send "0" — only store scores when live or finished
      const newHomeScore = (newStatus !== 'scheduled' && homeComp) ? parseInt(homeComp.score, 10) : null;
      const newAwayScore = (newStatus !== 'scheduled' && awayComp) ? parseInt(awayComp.score, 10) : null;

      const statusChanged = ourMatch.status !== newStatus;
      const scoreChanged  = ourMatch.homeScore !== newHomeScore || ourMatch.awayScore !== newAwayScore;
      if (!statusChanged && !scoreChanged) continue;

      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newHomeScore !== null) updatePayload.homeScore = newHomeScore;
      if (newAwayScore !== null) updatePayload.awayScore = newAwayScore;

      const [updatedMatch] = await db
        .update(matches)
        .set(updatePayload)
        .where(eq(matches.id, ourMatch.id))
        .returning();

      synced++;

      // Score predictions when match finishes
      if (newStatus === 'finished' && newHomeScore !== null && newAwayScore !== null) {
        anyMatchFinished = true;
        const matchPredictions = await db.select().from(predictions).where(eq(predictions.matchId, ourMatch.id));
        for (const pred of matchPredictions) {
          const pts = calculatePoints(
            { homeScore: pred.homeScore, awayScore: pred.awayScore },
            { homeScore: newHomeScore, awayScore: newAwayScore },
          );
          await db.update(predictions).set({ points: pts, updatedAt: sql`(datetime('now'))` }).where(eq(predictions.id, pred.id));
        }
      }

      broadcastMatchUpdate(updatedMatch);
    } catch (err) {
      errors.push(`ESPN event ${event.id}: ${String(err)}`);
    }
  }

  if (anyMatchFinished) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      errors.push(`Fantasy recompute failed: ${String(err)}`);
    }
  }

  return { synced, errors, matchesChecked: events.length };
}
