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
import { checkAchievements } from './achievement-service.js';
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

  // ESPN's scoreboard endpoint interprets `dates=YYYYMMDD` in Eastern Time
  // (the company's home timezone), NOT in UTC. A WC match kicking off at
  // 02:00 UTC on June 12 is listed under `dates=20260611` (22:00 ET on the
  // 11th) — so passing only the UTC date misses every late-night fixture.
  // We hit BOTH the UTC date and the UTC-prior date and merge.
  const espnDate = date.replace(/-/g, '');
  const dayBefore = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  })();

  async function fetchEspn(d: string): Promise<EspnEvent[]> {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${d}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
    const data = (await res.json()) as EspnResponse;
    return data.events ?? [];
  }

  let events: EspnEvent[];
  try {
    const [a, b] = await Promise.all([fetchEspn(espnDate), fetchEspn(dayBefore).catch(() => [])]);
    // Dedup by event id; a fixture can appear in both windows during the
    // overlap when its kickoff is right at the boundary.
    const byId = new Map<string, EspnEvent>();
    for (const e of [...a, ...b]) byId.set(e.id, e);
    events = [...byId.values()];
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

      // During pre-match ESPN may still send "0" — only store scores when live or finished.
      // Also guard against ESPN returning "" or "—" or any non-numeric (it has on past
      // scoreboards), which would otherwise produce NaN and corrupt the row.
      const parseScore = (raw: string | undefined): number | null => {
        if (raw == null) return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
      };
      let newHomeScore = (newStatus !== 'scheduled') ? parseScore(homeComp?.score) : null;
      let newAwayScore = (newStatus !== 'scheduled') ? parseScore(awayComp?.score) : null;
      // ESPN's `competitors[i].score` reports the regulation score even when
      // a knockout was decided by penalties. Without bumping the winner the
      // DB stores e.g. 1-1 and every "empate" predictor scores 5, while the
      // user who actually predicted Argentina-wins gets 0. ESPN exposes the
      // shootout winner via `competition.status.type.detail` or an "OT" /
      // "SO" tag; we use `winner: true` on the competitor object when set.
      if (newStatus === 'finished' && newHomeScore != null && newAwayScore != null) {
        const detail = (event.status.type as { detail?: string; description?: string }).detail
          ?? (event.status.type as { description?: string }).description
          ?? '';
        const wasShootout = /penalt|shootout|tiros|tanda/i.test(detail);
        if (wasShootout && newHomeScore === newAwayScore) {
          const homeWinnerFlag = (homeComp as unknown as { winner?: boolean })?.winner === true;
          const awayWinnerFlag = (awayComp as unknown as { winner?: boolean })?.winner === true;
          if (homeWinnerFlag && !awayWinnerFlag) newHomeScore += 1;
          else if (awayWinnerFlag && !homeWinnerFlag) newAwayScore += 1;
        }
      }

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
          // Fire the same prediction_scored event the football-data.org
          // sync fires — without this fallback path, no achievements
          // (exact_score, hot_streaks, perfect_group, bullseye_zero, …)
          // would be awarded when ESPN is the active scoring source.
          try {
            await checkAchievements(pred.userId, {
              type: 'prediction_scored',
              matchId: ourMatch.id,
              points: pts,
            });
          } catch (err) {
            errors.push(`Achievement check failed for prediction ${pred.id}: ${String(err)}`);
          }
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
