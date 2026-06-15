// Safety net for the score sync pipeline. Both football-data.org and ESPN
// occasionally fail to publish status transitions (or skip a match
// entirely on a given tick), leaving our DB with:
//   - matches stuck at `scheduled` long after kickoff
//   - matches stuck at `live` hours after the full-time whistle
// The /sync endpoint already runs the two feeds plus the FIFA timeline
// sync. This reconcile pass runs AFTER all of them and forces the obvious
// status transitions based on elapsed time. It deliberately does NOT
// touch scores — the feeds own that. We only flip status (and recompute
// predictions if we auto-finish a match that already has scores).

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { checkAchievements } from './achievement-service.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';

const FIVE_MIN_MS  = 5 * 60 * 1000;
const TWELVE_H_MS  = 12 * 60 * 60 * 1000;
// Even a knockout that goes to extra time + penalties wraps inside ~3h.
// Anything still 'live' beyond this almost certainly means the feed never
// published the final whistle, not that the match is actually still on.
const FINISH_AGE_MS = 3.5 * 60 * 60 * 1000;

export interface ReconcileResult {
  startedAuto: number;
  finishedAuto: number;
  skippedNoScore: number;
  errors: string[];
}

export async function reconcileMatchStatuses(): Promise<ReconcileResult> {
  const now = Date.now();
  const result: ReconcileResult = {
    startedAuto: 0,
    finishedAuto: 0,
    skippedNoScore: 0,
    errors: [],
  };

  // 1. scheduled → live. The match kicked off 5+ min ago but no feed
  // bumped it. Cap at 12h ago so we don't accidentally "start" a match
  // that was postponed/cancelled (those should be handled manually).
  const stillScheduled = await db
    .select({ id: matches.id, kickoffUtc: matches.kickoffUtc })
    .from(matches)
    .where(eq(matches.status, 'scheduled'));
  for (const m of stillScheduled) {
    const age = now - new Date(m.kickoffUtc).getTime();
    if (age < FIVE_MIN_MS || age > TWELVE_H_MS) continue;
    try {
      await db
        .update(matches)
        .set({ status: 'live', liveStatus: 'in_play' })
        .where(eq(matches.id, m.id));
      result.startedAuto++;
      console.log(`[reconcile] match ${m.id} auto scheduled→live (kickoff ${Math.round(age / 60000)}min ago)`);
    } catch (err) {
      result.errors.push(`auto-start match ${m.id}: ${String(err)}`);
    }
  }

  // 2. live → finished. 3.5h is the safe upper bound for any match —
  // 90' + 2x stoppage + halftime + 30' extra + penalty shootout still
  // wraps comfortably under 3h. If we still see 'live' after that, the
  // feed dropped the transition.
  //
  // We refuse to finish a match whose score is still null on either side
  // — that would create a 'finished' row with no result, which breaks
  // standings + prediction scoring. Better to log a warning and wait for
  // the next feed update.
  const stillLive = await db
    .select({
      id: matches.id,
      kickoffUtc: matches.kickoffUtc,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.status, 'live'));
  let anyFinished = false;
  for (const m of stillLive) {
    const age = now - new Date(m.kickoffUtc).getTime();
    if (age < FINISH_AGE_MS) continue;
    if (m.homeScore == null || m.awayScore == null) {
      console.warn(`[reconcile] match ${m.id} ${(age / 3600000).toFixed(1)}h past kickoff but score is null — NOT auto-finishing`);
      result.skippedNoScore++;
      continue;
    }
    try {
      await db
        .update(matches)
        .set({ status: 'finished', liveStatus: 'full_time' })
        .where(eq(matches.id, m.id));
      result.finishedAuto++;
      anyFinished = true;
      console.log(`[reconcile] match ${m.id} auto live→finished (kickoff ${(age / 3600000).toFixed(1)}h ago, ${m.homeScore}-${m.awayScore})`);
      await scoreMatchPredictions(m.id, m.homeScore, m.awayScore);
    } catch (err) {
      result.errors.push(`auto-finish match ${m.id}: ${String(err)}`);
    }
  }

  // Fantasy points piggyback on a finalized match. Same one-shot pattern
  // sync-scores uses — recompute once across the board if anything moved.
  if (anyFinished) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      result.errors.push(`fantasy recompute: ${String(err)}`);
    }
  }

  return result;
}

/**
 * Scores all predictions for a match that just transitioned to finished
 * via the reconcile path. Mirrors the inline logic in sync-scores so
 * users who predicted correctly still get their points credited even if
 * the feed never published the FT transition.
 */
async function scoreMatchPredictions(
  matchId: number,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  const matchPredictions = await db
    .select()
    .from(predictions)
    .where(eq(predictions.matchId, matchId));
  const scoredUsers = new Map<number, number>();
  for (const pred of matchPredictions) {
    const pts = calculatePoints(
      { homeScore: pred.homeScore, awayScore: pred.awayScore },
      { homeScore, awayScore },
    );
    await db
      .update(predictions)
      .set({ points: pts, updatedAt: sql`(datetime('now'))` })
      .where(eq(predictions.id, pred.id));
    const prev = scoredUsers.get(pred.userId) ?? -1;
    if (pts > prev) scoredUsers.set(pred.userId, pts);
  }
  for (const [uid, pts] of scoredUsers) {
    checkAchievements(uid, { type: 'prediction_scored', matchId, points: pts }).catch(() => {});
  }
}
