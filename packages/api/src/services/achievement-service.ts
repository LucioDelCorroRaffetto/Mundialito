import { db } from '../db/index.js';
import {
  userAchievements,
  predictions,
  matches,
  leagueMembers,
  leagues,
  tournamentPredictions,
  playerMatchStats,
  userLoginDays,
  leaguePositionHistory,
  fantasyTeams,
  teams,
} from '../db/schema/index.js';
import { eq, and, count, inArray, sql } from 'drizzle-orm';
import { isHiddenUser } from '../lib/hidden-users.js';

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

  // Hidden users (e.g. the app owner) opt out of every logro so they
  // don't artificially sit at the top of any ranking.
  if (isHiddenUser(userId)) return awarded;

  switch (event.type) {
    case 'prediction_saved': {
      await maybeAward(userId, 'first_prediction', awarded);
      // Loyal can fire on any authenticated action; saving a prediction is a
      // good trigger because it's an intentional one.
      await evaluateLoyal(userId, awarded);
      // Cheap counters that only need to look at the user's distinct matches
      // predicted. Computed once and reused for every rule below.
      const distinctMatches = await loadDistinctPredictedMatchIds(userId);

      // Small grindy logros — easy wins to keep newcomers engaged.
      if (distinctMatches.length >= 5) await maybeAward(userId, 'predictor_5', awarded);
      if (distinctMatches.length >= 10) await maybeAward(userId, 'predictor_10', awarded);
      if (distinctMatches.length >= 30) await maybeAward(userId, 'predictor_30', awarded);
      if (distinctMatches.length >= 50) await maybeAward(userId, 'predictor_50', awarded);

      // Confederation explorer: predicted a match from each of the 6 confederations.
      await evaluateConfederationExplorer(userId, awarded);
      // Big-game hunter: predicted a match between two top-10 FIFA-ranked teams.
      await evaluateBigGameHunter(userId, awarded);

      // group_completionist: 72 distinct group-stage matches predicted.
      // early_bird: same set, but completed before the opening match kickoff.
      await evaluateGroupCompletion(userId, distinctMatches, awarded);

      // night_owl was removed from the catalog; calling maybeAward for a
      // slug that no longer exists in `achievements` throws on the FK and
      // aborts the rest of this case (incl. group_sampler). Keeping the
      // event.userHour field accepted in case we re-introduce the logro.

      // group_sampler: at least one prediction in each of the 12 groups.
      await evaluateGroupSampler(userId, awarded);
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

      // In-tournament feel-good logros. None of these can fire before a
      // match is actually played, which is why they're inside this case.
      const triggering = history.find((r) => r.matchId === event.matchId);
      if (triggering) {
        await evaluateBullseyeZero(userId, triggering, awarded);
        await evaluateGoalfest(userId, triggering, awarded);
        await evaluateSurvivor(userId, history, awarded);
        await evaluateWeekendPerfect(userId, triggering, history, awarded);
        await evaluateMarathon(userId, history, awarded);
      }

      // Tournament-pick logros. Cheap to evaluate on every score; the
      // queries are bounded to ≤8 R16 matches / 1 final / N players.
      await evaluatePerfectKnockout(userId, event.matchId, awarded);
      await evaluateProphet(userId, event.matchId, awarded);
      await evaluateTopScorerProphet(userId, event.matchId, awarded);

      // upset_hunter: count how many finished matches this user correctly
      // predicted where the lower-ranked team won.
      await evaluateUpsetHunter(userId, awarded);

      // Snapshot every league this user is in so we can answer "was this
      // person ever last?" / "did they reach top 3 before quarters?". Then
      // evaluate comeback_king for the user (cheap once the snapshot exists).
      await snapshotAndEvaluateRankLogros(userId, event.matchId, awarded);
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
      // Creating a league auto-joins the admin as a member, so every
      // "joined a league" rule has to fire here too — otherwise users
      // whose first action is to *create* a league never receive
      // first_league/social_butterfly even though they meet the criteria.
      await maybeAward(userId, 'first_league', awarded);
      const [{ value: myLeagueCount }] = await db
        .select({ value: count() })
        .from(leagueMembers)
        .where(eq(leagueMembers.userId, userId));
      if (myLeagueCount >= 3) {
        await maybeAward(userId, 'social_butterfly', awarded);
      }
      // The new league might already qualify for invite_5 if seeded with
      // members, so check that as well.
      await maybeAwardInviter(event.leagueId, awarded);
      break;
    }

    case 'prediction_shared': {
      // share_master was removed from the catalog; trying to award it now
      // throws on the FK in `user_achievements.achievement_slug → achievements.slug`
      // which made POST /predictions/shared always return 500. Kept as a
      // no-op until / unless the slug is re-added to the catalog.
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
  if (result.length === 0) return;
  if (!awarded.includes(slug)) awarded.push(slug);

  // XP is no longer mutated here. It is computed live from the user's set
  // of earned achievements (see lib/user-xp.ts) — inserting the row above
  // is enough to lift the user's XP, level, and badge in every endpoint.
  // This eliminates the drift class of bugs where a failed UPDATE would
  // leave the stored xp out of sync with the actual achievements held.
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

// ─── Save-time evaluators ────────────────────────────────────────────────────

async function loadDistinctPredictedMatchIds(userId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ matchId: predictions.matchId })
    .from(predictions)
    .where(eq(predictions.userId, userId));
  return rows.map((r) => r.matchId);
}

/**
 * Award group_completionist when the user has a prediction for every group
 * stage match (round = 'group'), and early_bird when that happened before the
 * opening match kicked off.
 *
 * Implementation note: we load the group matches once and intersect with the
 * user's distinct prediction set. Cheap because there are only 72 group
 * matches; bails out early when the user has fewer total predictions.
 */
async function evaluateGroupCompletion(
  userId: number,
  distinctMatches: number[],
  awarded: string[],
): Promise<void> {
  if (distinctMatches.length < 72) return; // fast path

  const groupMatches = await db
    .select({ id: matches.id, kickoffUtc: matches.kickoffUtc })
    .from(matches)
    .where(eq(matches.round, 'group'));
  if (groupMatches.length === 0) return;

  const predictedSet = new Set(distinctMatches);
  for (const m of groupMatches) {
    if (!predictedSet.has(m.id)) return;
  }

  await maybeAward(userId, 'group_completionist', awarded);

  // early_bird requires the save to happen before the opening match kickoff.
  const opening = groupMatches.reduce(
    (min, m) => (m.kickoffUtc < min ? m.kickoffUtc : min),
    groupMatches[0].kickoffUtc,
  );
  if (new Date() < new Date(opening)) {
    await maybeAward(userId, 'early_bird', awarded);
  }
}

/**
 * Confederation explorer: predicted a match involving each of the 6 FIFA
 * confederations (CONMEBOL, UEFA, CONCACAF, CAF, AFC, OFC).
 */
async function evaluateConfederationExplorer(userId: number, awarded: string[]): Promise<void> {
  const rows = await db
    .selectDistinct({ confederation: teams.confederation })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .innerJoin(teams, sql`${teams.id} = ${matches.homeTeamId} OR ${teams.id} = ${matches.awayTeamId}`)
    .where(
      and(
        eq(predictions.userId, userId),
        sql`${teams.confederation} IS NOT NULL`,
      ),
    );
  const confeds = new Set(
    rows.map((r) => r.confederation).filter((c): c is string =>
      typeof c === 'string' && c !== 'PLAYOFF',
    ),
  );
  if (confeds.size >= 6) {
    await maybeAward(userId, 'confederation_explorer', awarded);
  }
}

/**
 * Big-game hunter: predicted any match between two teams both ranked in the
 * top 10 of the FIFA ranking. Bona fide flex pick — proves you cared about
 * the marquee fixtures.
 */
async function evaluateBigGameHunter(userId: number, awarded: string[]): Promise<void> {
  const rows = await db
    .select({ matchId: predictions.matchId })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .innerJoin(teams, eq(teams.id, matches.homeTeamId))
    .where(
      and(
        eq(predictions.userId, userId),
        sql`${teams.fifaRank} <= 10`,
      ),
    );
  if (rows.length === 0) return;

  // Re-query with awayTeam side and intersect by matchId.
  const matchIdsHomeTop10 = new Set(rows.map((r) => r.matchId));
  const rowsAway = await db
    .select({ matchId: predictions.matchId })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .innerJoin(teams, eq(teams.id, matches.awayTeamId))
    .where(
      and(
        eq(predictions.userId, userId),
        sql`${teams.fifaRank} <= 10`,
      ),
    );

  for (const r of rowsAway) {
    if (matchIdsHomeTop10.has(r.matchId)) {
      await maybeAward(userId, 'big_game_hunter', awarded);
      return;
    }
  }
}

/** group_sampler: predicted at least one match in each of the 12 groups. */
async function evaluateGroupSampler(userId: number, awarded: string[]): Promise<void> {
  const rows = await db
    .selectDistinct({ group: matches.group })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(
      and(eq(predictions.userId, userId), sql`${matches.group} IS NOT NULL`),
    );
  const distinctGroups = rows.map((r) => r.group).filter((g): g is string => g !== null);
  if (distinctGroups.length >= 12) {
    await maybeAward(userId, 'group_sampler', awarded);
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

/** Exact prediction on a 0-0 match. Rare and satisfying. */
async function evaluateBullseyeZero(
  userId: number,
  triggering: ScoredRow,
  awarded: string[],
): Promise<void> {
  if (triggering.points !== 5) return;
  if (triggering.matchHome !== 0 || triggering.matchAway !== 0) return;
  await maybeAward(userId, 'bullseye_zero', awarded);
}

/** Exact prediction on a high-scoring match (4+ total goals). */
async function evaluateGoalfest(
  userId: number,
  triggering: ScoredRow,
  awarded: string[],
): Promise<void> {
  if (triggering.points !== 5) return;
  if (triggering.matchHome == null || triggering.matchAway == null) return;
  if (triggering.matchHome + triggering.matchAway < 4) return;
  await maybeAward(userId, 'goalfest', awarded);
}

/** Scored after 3 consecutive zero-point predictions. Reward for the comeback. */
async function evaluateSurvivor(
  userId: number,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
  if (history.length < 4) return;
  const last4 = history.slice(-4);
  if (last4[3].points <= 0) return;
  if (last4[0].points !== 0 || last4[1].points !== 0 || last4[2].points !== 0) return;
  await maybeAward(userId, 'survivor', awarded);
}

/**
 * Scored on every match of the same calendar date (UTC) as the triggering
 * match, provided that day had at least 3 matches finished. Keeps the bar
 * meaningful — a single-match day doesn't count.
 */
async function evaluateWeekendPerfect(
  userId: number,
  triggering: ScoredRow,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
  const day = triggering.kickoffUtc.slice(0, 10);

  const dayMatches = await db
    .select({ id: matches.id, status: matches.status })
    .from(matches)
    .where(sql`substr(${matches.kickoffUtc}, 1, 10) = ${day}`);

  if (dayMatches.length < 3) return;
  if (dayMatches.some((m) => m.status !== 'finished')) return;

  const userScored = new Map<number, number>();
  for (const r of history) {
    if (r.kickoffUtc.slice(0, 10) === day) userScored.set(r.matchId, r.points);
  }
  for (const m of dayMatches) {
    const pts = userScored.get(m.id);
    if (pts == null || pts <= 0) return;
  }
  await maybeAward(userId, 'weekend_perfect', awarded);
}

/** Scored at least one prediction across 5+ different calendar days. */
async function evaluateMarathon(
  userId: number,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
  const days = new Set<string>();
  for (const r of history) {
    if (r.points > 0) days.add(r.kickoffUtc.slice(0, 10));
  }
  if (days.size >= 5) await maybeAward(userId, 'marathon', awarded);
}

/**
 * upset_hunter: the user correctly predicted the winner in at least 3
 * matches where the "underdog" (higher-ranked number = lower-ranked team)
 * won. Uses the fifa_rank stored on the teams table.
 *
 * An "upset" is defined as: the team with the worse FIFA rank (higher number)
 * won, OR a team with no rank beat one with a rank.
 */
async function evaluateUpsetHunter(userId: number, awarded: string[]): Promise<void> {
  // Load all finished matches with both team ranks.
  const finishedMatches = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  if (finishedMatches.length === 0) return;

  const teamIds = new Set<number>();
  for (const m of finishedMatches) {
    if (m.homeTeamId != null) teamIds.add(m.homeTeamId);
    if (m.awayTeamId != null) teamIds.add(m.awayTeamId);
  }
  const teamRankRows = await db
    .select({ id: teams.id, fifaRank: teams.fifaRank })
    .from(teams)
    .where(inArray(teams.id, [...teamIds]));
  const rankById = new Map<number, number | null>(teamRankRows.map((r) => [r.id, r.fifaRank]));

  // Determine which finished matches were upsets (lower-ranked won).
  const upsetMatchIds: number[] = [];
  for (const m of finishedMatches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    if (m.homeTeamId == null || m.awayTeamId == null) continue;
    if (m.homeScore === m.awayScore) continue; // draws aren't upsets
    const homeRank = rankById.get(m.homeTeamId) ?? 999;
    const awayRank = rankById.get(m.awayTeamId) ?? 999;
    if (homeRank === awayRank) continue; // same rank, skip
    const homeWon = (m.homeScore as number) > (m.awayScore as number);
    const homeFavoured = homeRank < awayRank; // lower rank = better team
    const isUpset = homeWon !== homeFavoured; // underdog won
    if (isUpset) upsetMatchIds.push(m.id);
  }

  if (upsetMatchIds.length === 0) return;

  // How many of those upsets did this user predict correctly?
  const userPreds = await db
    .select({ matchId: predictions.matchId, homeScore: predictions.homeScore, awayScore: predictions.awayScore })
    .from(predictions)
    .where(and(eq(predictions.userId, userId), inArray(predictions.matchId, upsetMatchIds)));

  // Dedupe by matchId (user has N rows per league).
  const predByMatch = new Map<number, { homeScore: number; awayScore: number }>();
  for (const p of userPreds) predByMatch.set(p.matchId, p);

  let upsetsPredicted = 0;
  for (const matchId of upsetMatchIds) {
    const match = finishedMatches.find((m) => m.id === matchId);
    const pred = predByMatch.get(matchId);
    if (!match || !pred || match.homeScore == null || match.awayScore == null) continue;
    // Did the user correctly predict the winner (same sign of goal difference)?
    if (Math.sign(pred.homeScore - pred.awayScore) === Math.sign((match.homeScore as number) - (match.awayScore as number))) {
      upsetsPredicted++;
    }
  }

  if (upsetsPredicted >= 3) await maybeAward(userId, 'upset_hunter', awarded);
}

/** Loyal: ≥7 distinct UTC days the user made an authenticated request. */
async function evaluateLoyal(userId: number, awarded: string[]): Promise<void> {
  const [{ value: days }] = await db
    .select({ value: count() })
    .from(userLoginDays)
    .where(eq(userLoginDays.userId, userId));
  if (days >= 7) await maybeAward(userId, 'loyal', awarded);
}

/**
 * After a match score lands, take a snapshot of the user's position in every
 * league they belong to and check the rank-history logros.
 *
 *   - comeback_king: was ever last AND is now top 3 in the same league.
 *   - underdog: only after the final closes — currently #1 AND never reached
 *     top 3 in any earlier snapshot whose triggering round is in {group, r16}.
 *
 * The snapshot itself is what makes both logros possible — the actual
 * standings live in the predictions table and would otherwise be lost once a
 * later match overwrites the points.
 */
async function snapshotAndEvaluateRankLogros(
  userId: number,
  matchId: number,
  awarded: string[],
): Promise<void> {
  const triggerMatch = await db
    .select({ id: matches.id, round: matches.round })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  if (!triggerMatch) return;

  const myLeagues = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));

  for (const { leagueId } of myLeagues) {
    const positions = await computeLeaguePositions(leagueId);
    const memberCount = positions.length;
    const me = positions.find((p) => p.userId === userId);
    if (!me) continue;

    await db
      .insert(leaguePositionHistory)
      .values({
        leagueId,
        userId,
        position: me.position,
        memberCount,
        triggeringMatchId: triggerMatch.id,
        triggeringRound: triggerMatch.round,
      })
      .onConflictDoNothing();

    await evaluateComebackKing(userId, leagueId, me.position, memberCount, awarded);
    if (triggerMatch.round === 'final') {
      await evaluateUnderdog(userId, leagueId, me.position, awarded);
    }
  }
}

/**
 * Computes each member's points in a league by summing predictions.points for
 * predictions made WITHIN that league (the per-league predictions migration
 * means every league has its own rows). Members with no predictions show up
 * with 0 points so they still get a position.
 */
async function computeLeaguePositions(leagueId: number): Promise<{ userId: number; position: number }[]> {
  const members = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));

  if (members.length === 0) return [];

  const pointsRows = await db
    .select({
      userId: predictions.userId,
      total: sql<number>`coalesce(sum(${predictions.points}), 0)`.as('total'),
    })
    .from(predictions)
    .where(eq(predictions.leagueId, leagueId))
    .groupBy(predictions.userId);

  const pointsByUser = new Map<number, number>();
  for (const r of pointsRows) pointsByUser.set(r.userId, Number(r.total));

  const sorted = members
    .map((m) => ({ userId: m.userId, total: pointsByUser.get(m.userId) ?? 0 }))
    .sort((a, b) => b.total - a.total);

  // Shared rank for ties so leaderboards line up with our existing standings.
  let position = 0;
  let lastTotal = Number.NaN;
  return sorted.map((row, idx) => {
    if (row.total !== lastTotal) {
      position = idx + 1;
      lastTotal = row.total;
    }
    return { userId: row.userId, position };
  });
}

async function evaluateComebackKing(
  userId: number,
  leagueId: number,
  currentPosition: number,
  memberCount: number,
  awarded: string[],
): Promise<void> {
  if (memberCount < 3) return;
  if (currentPosition > 3) return;

  // Was the user ever LAST in this league?
  const everLast = await db
    .select({ id: leaguePositionHistory.id })
    .from(leaguePositionHistory)
    .where(
      and(
        eq(leaguePositionHistory.leagueId, leagueId),
        eq(leaguePositionHistory.userId, userId),
        // "Last" = position equal to that snapshot's memberCount. Using the
        // snapshot's own memberCount keeps us correct across league-size
        // changes (someone joined mid-tournament).
        sql`${leaguePositionHistory.position} = ${leaguePositionHistory.memberCount}`,
      ),
    )
    .limit(1)
    .get();

  if (everLast) await maybeAward(userId, 'comeback_king', awarded);
}

async function evaluateUnderdog(
  userId: number,
  leagueId: number,
  finalPosition: number,
  awarded: string[],
): Promise<void> {
  if (finalPosition !== 1) return;

  // Was the user ever top 3 in this league BEFORE quarter-finals? The
  // WC2026 bracket is group → r32 → r16 → qf → sf → final. "Before QF"
  // therefore includes group, r32 AND r16 (r16 was previously omitted,
  // which let users who only reached top 3 during r16 still claim the
  // logro — they shouldn't).
  const earlyTop3 = await db
    .select({ id: leaguePositionHistory.id })
    .from(leaguePositionHistory)
    .where(
      and(
        eq(leaguePositionHistory.leagueId, leagueId),
        eq(leaguePositionHistory.userId, userId),
        inArray(leaguePositionHistory.triggeringRound, ['group', 'r32', 'r16']),
        sql`${leaguePositionHistory.position} <= 3`,
      ),
    )
    .limit(1)
    .get();

  if (!earlyTop3) await maybeAward(userId, 'underdog', awarded);
}

/**
 * Award perfect_group when the user got the winner right in at least 4 of
 * the 6 matches in a group (previously: all 6). Easier bar so it stays
 * achievable without rewarding luck.
 */
const PERFECT_GROUP_THRESHOLD = 4;

async function evaluatePerfectGroup(
  userId: number,
  triggeringMatchId: number,
  history: ScoredRow[],
  awarded: string[],
): Promise<void> {
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
  // All group matches must be finished so the count is final.
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

  const predByMatch = new Map<number, { homeScore: number; awayScore: number }>();
  for (const p of userPredsRaw) predByMatch.set(p.matchId, p);

  let correct = 0;
  for (const m of groupMatches) {
    const pred = predByMatch.get(m.id);
    if (!pred || m.homeScore == null || m.awayScore == null) continue;
    if (Math.sign(pred.homeScore - pred.awayScore) === Math.sign(m.homeScore - m.awayScore)) {
      correct++;
    }
  }

  if (correct >= PERFECT_GROUP_THRESHOLD) {
    await maybeAward(userId, 'perfect_group', awarded);
  }
}

/**
 * Award perfect_knockout when the user got the winner right in at least 4 of
 * the 8 R16 matches (50%). Eased again after feedback — full 8/8 is
 * essentially a luck check.
 */
const PERFECT_KNOCKOUT_THRESHOLD = 4;

async function evaluatePerfectKnockout(
  userId: number,
  triggeringMatchId: number,
  awarded: string[],
): Promise<void> {
  // Quick guard: only run after a R16 match got scored.
  const triggerMatch = await db
    .select({ round: matches.round })
    .from(matches)
    .where(eq(matches.id, triggeringMatchId))
    .get();
  if (triggerMatch?.round !== 'r16') return;

  const r16Matches = await db
    .select({
      id: matches.id,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(eq(matches.round, 'r16'));

  if (r16Matches.length === 0) return;
  if (r16Matches.some((m) => m.status !== 'finished')) return;

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
        inArray(predictions.matchId, r16Matches.map((m) => m.id)),
      ),
    );

  const predByMatch = new Map<number, { homeScore: number; awayScore: number }>();
  for (const p of userPredsRaw) predByMatch.set(p.matchId, p);

  let correct = 0;
  for (const m of r16Matches) {
    const pred = predByMatch.get(m.id);
    if (!pred || m.homeScore == null || m.awayScore == null) continue;
    // Tie-cases in R16 don't exist in normal time → assume penalties decided.
    // We only use the recorded match.homeScore/awayScore winner.
    if (Math.sign(pred.homeScore - pred.awayScore) === Math.sign(m.homeScore - m.awayScore)) {
      correct++;
    }
  }

  if (correct >= PERFECT_KNOCKOUT_THRESHOLD) {
    await maybeAward(userId, 'perfect_knockout', awarded);
  }
}

/**
 * Award prophet when the user's tournament champion pick matches the actual
 * winner of the final match (round = 'final', match status = finished).
 * Evaluated for every tournamentPrediction the user has across leagues —
 * if at least one is correct, they earn it.
 */
async function evaluateProphet(
  userId: number,
  triggeringMatchId: number,
  awarded: string[],
): Promise<void> {
  const finalMatch = await db
    .select({
      id: matches.id,
      round: matches.round,
      status: matches.status,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(eq(matches.id, triggeringMatchId))
    .get();

  if (finalMatch?.round !== 'final') return;
  if (finalMatch.status !== 'finished') return;
  if (finalMatch.homeScore == null || finalMatch.awayScore == null) return;
  if (finalMatch.homeScore === finalMatch.awayScore) return; // shouldn't happen in a final but guard

  const winnerTeamId =
    finalMatch.homeScore > finalMatch.awayScore ? finalMatch.homeTeamId : finalMatch.awayTeamId;
  if (winnerTeamId == null) return;

  const correctPicks = await db
    .select({ id: tournamentPredictions.id })
    .from(tournamentPredictions)
    .where(
      and(
        eq(tournamentPredictions.userId, userId),
        eq(tournamentPredictions.championTeamId, winnerTeamId),
      ),
    )
    .limit(1)
    .get();

  if (correctPicks) await maybeAward(userId, 'prophet', awarded);
}

/**
 * Award top_scorer_prophet when the user picked the actual top scorer of the
 * tournament. Computed only after the final match (because earlier the
 * "top scorer" can still change). A tie at the top is broken by lowest
 * playerId — picking either of tied top scorers wins.
 */
async function evaluateTopScorerProphet(
  userId: number,
  triggeringMatchId: number,
  awarded: string[],
): Promise<void> {
  const finalMatch = await db
    .select({ round: matches.round, status: matches.status })
    .from(matches)
    .where(eq(matches.id, triggeringMatchId))
    .get();
  if (finalMatch?.round !== 'final' || finalMatch.status !== 'finished') return;

  // Top scorer = max(sum(goals)) grouped by player, restricted to finished
  // matches. Ties: return every tied player so any correct pick counts.
  const rows = await db
    .select({
      playerId: playerMatchStats.playerId,
      goals: sql<number>`sum(${playerMatchStats.goals})`.as('total'),
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(playerMatchStats.matchId, matches.id))
    .where(eq(matches.status, 'finished'))
    .groupBy(playerMatchStats.playerId);

  if (rows.length === 0) return;

  const max = rows.reduce((m, r) => (Number(r.goals) > m ? Number(r.goals) : m), 0);
  if (max === 0) return;
  const topPlayerIds = new Set(rows.filter((r) => Number(r.goals) === max).map((r) => r.playerId));

  const userPicks = await db
    .select({ topScorerPlayerId: tournamentPredictions.topScorerPlayerId })
    .from(tournamentPredictions)
    .where(eq(tournamentPredictions.userId, userId));

  for (const pick of userPicks) {
    if (pick.topScorerPlayerId != null && topPlayerIds.has(pick.topScorerPlayerId)) {
      await maybeAward(userId, 'top_scorer_prophet', awarded);
      return;
    }
  }
}

/**
 * Awards `fantasy_legend` to the user with the highest fantasy_teams.totalPoints
 * within each league. Triggered explicitly (admin endpoint) when the fantasy
 * season is over — there isn't a clean event-driven trigger.
 *
 * Returns the slugs/userIds it granted, for the calling endpoint to surface.
 */
export async function finalizeFantasyLegends(): Promise<{ userId: number; leagueId: number }[]> {
  const allLeagues = await db.select({ id: leagues.id }).from(leagues);
  const winners: { userId: number; leagueId: number }[] = [];

  for (const l of allLeagues) {
    const memberRows = await db
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, l.id));
    if (memberRows.length === 0) continue;

    const memberIds = memberRows.map((m) => m.userId);
    const fantasy = await db
      .select({
        userId: fantasyTeams.userId,
        total: fantasyTeams.totalPoints,
      })
      .from(fantasyTeams)
      .where(inArray(fantasyTeams.userId, memberIds));

    if (fantasy.length === 0) continue;

    const max = fantasy.reduce((m, r) => (r.total > m ? r.total : m), 0);
    if (max <= 0) continue;
    const top = fantasy.filter((r) => r.total === max);

    for (const w of top) {
      const dummy: string[] = [];
      await maybeAward(w.userId, 'fantasy_legend', dummy);
      if (dummy.includes('fantasy_legend')) {
        winners.push({ userId: w.userId, leagueId: l.id });
      }
    }
  }

  return winners;
}

// ─── Public re-evaluators (used by scripts & batch jobs) ────────────────────

/**
 * Re-runs every rule for a single user. Used by the backfill script when we
 * want to grant achievements people already earned but never received because
 * the scoring services didn't fire `prediction_scored`.
 */
export async function recomputeUserAchievements(userId: number): Promise<string[]> {
  const awarded: string[] = [];

  // prediction_saved family — derive everything from distinct matches.
  const distinctMatches = await loadDistinctPredictedMatchIds(userId);
  if (distinctMatches.length > 0) await maybeAward(userId, 'first_prediction', awarded);
  if (distinctMatches.length >= 10) await maybeAward(userId, 'predictor_10', awarded);
  if (distinctMatches.length >= 30) await maybeAward(userId, 'predictor_30', awarded);
  await evaluateGroupCompletion(userId, distinctMatches, awarded);
  await evaluateGroupSampler(userId, awarded);

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
  await evaluateSurvivor(userId, history, awarded);
  await evaluateMarathon(userId, history, awarded);

  // Per-match logros: replay them across the user's whole history so the
  // backfill grants anything they earned in the past.
  for (const row of history) {
    await evaluateBullseyeZero(userId, row, awarded);
    await evaluateGoalfest(userId, row, awarded);
    await evaluateWeekendPerfect(userId, row, history, awarded);
  }

  // Perfect group: try every group with finished matches
  const groupsWithFinished = await db
    .selectDistinct({ group: matches.group })
    .from(matches)
    .where(and(sql`${matches.group} IS NOT NULL`, eq(matches.status, 'finished')));
  for (const g of groupsWithFinished) {
    if (!g.group) continue;
    const trig = history.find((r) => r.group === g.group);
    if (!trig) continue;
    await evaluatePerfectGroup(userId, trig.matchId, history, awarded);
  }

  // Tournament-pick logros — replay using the actual final/R16 matches.
  const finalRow = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.round, 'final'), eq(matches.status, 'finished')))
    .limit(1)
    .get();
  if (finalRow) {
    await evaluateProphet(userId, finalRow.id, awarded);
    await evaluateTopScorerProphet(userId, finalRow.id, awarded);
  }
  const aR16 = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.round, 'r16'), eq(matches.status, 'finished')))
    .limit(1)
    .get();
  if (aR16) await evaluatePerfectKnockout(userId, aR16.id, awarded);

  // Rank-history logros — replay against the existing snapshots without
  // generating any new ones.
  const myLeagues = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  for (const { leagueId } of myLeagues) {
    const positions = await computeLeaguePositions(leagueId);
    const me = positions.find((p) => p.userId === userId);
    if (!me) continue;
    await evaluateComebackKing(userId, leagueId, me.position, positions.length, awarded);
    if (finalRow) {
      await evaluateUnderdog(userId, leagueId, me.position, awarded);
    }
  }

  // loyal
  await evaluateLoyal(userId, awarded);

  // upset_hunter
  await evaluateUpsetHunter(userId, awarded);

  return awarded;
}

export type AchievementEvent =
  | { type: 'prediction_saved'; matchId: number; userHour?: number }
  | { type: 'prediction_scored'; matchId: number; points: number }
  | { type: 'league_joined'; leagueId: number }
  | { type: 'league_created'; leagueId: number }
  | { type: 'prediction_shared' };
