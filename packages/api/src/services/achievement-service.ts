import { db } from '../db/index.js';
import {
  userAchievements,
  predictions,
  matches,
  leagueMembers,
  leagues,
} from '../db/schema/index.js';
import { eq, and, count, inArray, sql } from 'drizzle-orm';

/**
 * Checks and awards achievements based on an event.
 * Every helper is idempotent — the unique (userId, achievementSlug) index on
 * user_achievements prevents duplicates, and our award helper only reports a
 * slug as "awarded" when it actually inserts a new row.
 */
export async function checkAchievements(
  userId: number,
  event: AchievementEvent,
): Promise<string[]> {
  const awarded: string[] = [];

  switch (event.type) {
    case 'prediction_saved': {
      await maybeAward(userId, 'first_prediction', awarded);
      break;
    }

    case 'prediction_scored': {
      // Exact result.
      if (event.points === 5) {
        await maybeAward(userId, 'exact_score', awarded);
      }

      // Streak / triple-exact / perfect-group all need to look at the user's
      // scoring history across every league. Because a user has the same
      // match prediction in multiple leagues now, we de-duplicate by matchId
      // before evaluating any rule.
      const history = await loadScoredHistory(userId);

      await evaluateHotStreaks(userId, history, awarded);
      await evaluateTripleExact(userId, history, awarded);
      await evaluatePerfectGroup(userId, event.matchId, history, awarded);
      break;
    }

    case 'league_joined': {
      await maybeAward(userId, 'first_league', awarded);

      // social_butterfly: belongs to ≥3 leagues
      const [{ value: myLeagueCount }] = await db
        .select({ value: count() })
        .from(leagueMembers)
        .where(eq(leagueMembers.userId, userId));
      if (myLeagueCount >= 3) {
        await maybeAward(userId, 'social_butterfly', awarded);
      }

      // invite_5: the league this user just joined now has ≥5 members → award
      // its admin.
      await maybeAwardInviter(event.leagueId, awarded);
      break;
    }

    case 'league_created': {
      await maybeAward(userId, 'league_founder', awarded);
      // If admin created with seed members or this is a re-check, evaluate
      // invite_5 immediately.
      await maybeAwardInviter(event.leagueId, awarded);
      break;
    }

    case 'prediction_shared': {
      await maybeAward(userId, 'share_master', awarded);
      break;
    }
  }

  return awarded;
}

// ─── Award helpers ───────────────────────────────────────────────────────────

async function maybeAward(userId: number, slug: string, awarded: string[]): Promise<void> {
  const result = await db
    .insert(userAchievements)
    .values({ userId, achievementSlug: slug })
    .onConflictDoNothing()
    .returning({ id: userAchievements.id });
  if (result.length > 0 && !awarded.includes(slug)) {
    awarded.push(slug);
  }
}

/** Award `invite_5` to the league's admin if the league now has ≥5 members. */
async function maybeAwardInviter(leagueId: number, awarded: string[]): Promise<void> {
  const league = await db.select().from(leagues).where(eq(leagues.id, leagueId)).get();
  if (!league) return;
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  if (memberCount >= 5) {
    await maybeAward(league.adminId, 'invite_5', awarded);
  }
}

// ─── Prediction history & rule evaluators ────────────────────────────────────

interface ScoredRow {
  matchId: number;
  kickoffUtc: string;
  group: string | null;
  status: string;
  predHome: number;
  predAway: number;
  matchHome: number | null;
  matchAway: number | null;
  points: number;
}

/**
 * One row per match (deduped across the user's leagues). Used for streaks and
 * exact-count rules so a user with 3 leagues isn't counted 3× for the same
 * match.
 */
async function loadScoredHistory(userId: number): Promise<ScoredRow[]> {
  const rows = await db
    .select({
      matchId: predictions.matchId,
      kickoffUtc: matches.kickoffUtc,
      group: matches.group,
      status: matches.status,
      predHome: predictions.homeScore,
      predAway: predictions.awayScore,
      matchHome: matches.homeScore,
      matchAway: matches.awayScore,
      points: predictions.points,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.userId, userId), eq(matches.status, 'finished')));

  // Dedupe by matchId — same prediction lives in N leagues but the score is
  // identical, so any row is fine.
  const byMatch = new Map<number, ScoredRow>();
  for (const r of rows) {
    if (r.points == null) continue;
    if (!byMatch.has(r.matchId)) {
      byMatch.set(r.matchId, { ...r, points: r.points } as ScoredRow);
    }
  }
  return [...byMatch.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

async function evaluateHotStreaks(
  userId: number,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
  // Longest trailing streak of "points > 0" predictions (correct winner / draw / exact).
  let streak = 0;
  let maxStreak = 0;
  for (const row of history) {
    if (row.points > 0) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  if (maxStreak >= 3) await maybeAward(userId, 'hot_streak_3', awarded);
  if (maxStreak >= 5) await maybeAward(userId, 'hot_streak_5', awarded);
}

async function evaluateTripleExact(
  userId: number,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
  // 3 exact results on matches that kicked off on the same calendar date (UTC).
  const exactByDay = new Map<string, number>();
  for (const row of history) {
    if (row.points !== 5) continue;
    const day = row.kickoffUtc.slice(0, 10);
    exactByDay.set(day, (exactByDay.get(day) ?? 0) + 1);
  }
  for (const cnt of exactByDay.values()) {
    if (cnt >= 3) {
      await maybeAward(userId, 'triple_exact', awarded);
      break;
    }
  }
}

async function evaluatePerfectGroup(
  userId: number,
  triggeringMatchId: number,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
  // Find the group of the match that just got scored. If every match in that
  // group is finished AND the user's prediction has the correct winner for
  // each, award perfect_group.
  const trigger = history.find((r) => r.matchId === triggeringMatchId);
  if (!trigger?.group) return;

  const groupMatches = await db
    .select({
      id: matches.id,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(eq(matches.group, trigger.group));

  if (groupMatches.length === 0) return;
  if (groupMatches.some((m) => m.status !== 'finished')) return;

  const userPredsRaw = await db
    .select({
      matchId: predictions.matchId,
      homeScore: predictions.homeScore,
      awayScore: predictions.awayScore,
    })
    .from(predictions)
    .where(
      and(
        eq(predictions.userId, userId),
        inArray(predictions.matchId, groupMatches.map((m) => m.id)),
      ),
    );

  // Dedupe by matchId (same score across leagues).
  const predByMatch = new Map<number, { homeScore: number; awayScore: number }>();
  for (const p of userPredsRaw) predByMatch.set(p.matchId, p);

  for (const m of groupMatches) {
    const pred = predByMatch.get(m.id);
    if (!pred || m.homeScore == null || m.awayScore == null) return;
    if (Math.sign(pred.homeScore - pred.awayScore) !== Math.sign(m.homeScore - m.awayScore)) return;
  }

  await maybeAward(userId, 'perfect_group', awarded);
}

// ─── Public re-evaluators (used by scripts & batch jobs) ────────────────────

/**
 * Re-runs every rule for a single user. Used by the backfill script when we
 * want to grant achievements people already earned but never received because
 * the scoring services didn't fire `prediction_scored`.
 */
export async function recomputeUserAchievements(userId: number): Promise<string[]> {
  const awarded: string[] = [];

  // prediction_saved
  const [{ value: predCount }] = await db
    .select({ value: count() })
    .from(predictions)
    .where(eq(predictions.userId, userId));
  if (predCount > 0) await maybeAward(userId, 'first_prediction', awarded);

  // league_joined family
  const [{ value: leagueCount }] = await db
    .select({ value: count() })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  if (leagueCount > 0) await maybeAward(userId, 'first_league', awarded);
  if (leagueCount >= 3) await maybeAward(userId, 'social_butterfly', awarded);

  // league_founder
  const ownedLeagues = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.adminId, userId));
  if (ownedLeagues.length > 0) await maybeAward(userId, 'league_founder', awarded);

  // invite_5
  for (const l of ownedLeagues) {
    await maybeAwardInviter(l.id, awarded);
  }

  // Scoring-based rules
  const history = await loadScoredHistory(userId);
  if (history.some((r) => r.points === 5)) {
    await maybeAward(userId, 'exact_score', awarded);
  }
  await evaluateHotStreaks(userId, history, awarded);
  await evaluateTripleExact(userId, history, awarded);

  // Perfect group: try every group with finished matches
  const groupsWithFinished = await db
    .selectDistinct({ group: matches.group })
    .from(matches)
    .where(and(sql`${matches.group} IS NOT NULL`, eq(matches.status, 'finished')));
  for (const g of groupsWithFinished) {
    if (!g.group) continue;
    // pick any one of the user's predictions in that group as the triggering match
    const trig = history.find((r) => r.group === g.group);
    if (!trig) continue;
    await evaluatePerfectGroup(userId, trig.matchId, history, awarded);
  }

  return awarded;
}

export type AchievementEvent =
  | { type: 'prediction_saved'; matchId: number }
  | { type: 'prediction_scored'; matchId: number; points: number }
  | { type: 'league_joined'; leagueId: number }
  | { type: 'league_created'; leagueId: number }
  | { type: 'prediction_shared' };
