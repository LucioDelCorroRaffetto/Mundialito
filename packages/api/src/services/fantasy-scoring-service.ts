import { eq, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  matches,
  players,
  playerMatchStats,
  fantasyTeams,
  fantasySquadPlayers,
  fantasyLineups,
  fantasyRoundScores,
} from '../db/schema/index.js';
import { calculateFantasyPoints, PlayerPosition } from '../lib/fantasy-scoring.js';
import { FANTASY_ROUNDS, type FantasyRound } from '../lib/fantasy-rounds.js';

export interface RecomputeResult {
  teamsUpdated: number;
  roundsScored: number;
}

// ─── Per-round points ─────────────────────────────────────────────────────────

// Lightweight shapes for the in-memory recompute. They mirror the columns the
// scoring engine actually needs, so the recompute can load `players`, finished
// `matches` and `player_match_stats` ONCE and reuse them across every round
// instead of re-querying per round (a ~7× read amplification on Turso).
type FinishedMatchInfo = {
  id: number;
  round: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  kickoffUtc: string;
};
type PlayerInfo = { id: number; teamId: number; position: string };
type StatInfo = {
  matchId: number;
  playerId: number;
  played: boolean;
  goals: number;
  assists: number;
  yellowCards: number;
  redCard: boolean;
};

/**
 * Returns fantasy points per player restricted to matches that belong to the
 * given fantasy round. This is the core per-round scoring function.
 *
 * Pure / in-memory: it receives the already-loaded finished matches, player
 * lookup and stats grouped by match, so the caller pays the DB cost once for
 * the whole recompute rather than once per round.
 */
function computeFantasyPointsByPlayerForRound(
  round: FantasyRound,
  finishedMatches: FinishedMatchInfo[],
  playerById: Map<number, PlayerInfo>,
  statsByMatchId: Map<number, StatInfo[]>,
): Map<number, number> {
  const dbRounds = Array.isArray(round.dbRound) ? round.dbRound : [round.dbRound];
  let roundMatches = finishedMatches.filter((m) => dbRounds.includes(m.round));

  // For group rounds, further filter by date window.
  if (round.dateStart && round.dateEnd) {
    roundMatches = roundMatches.filter((m) => {
      const day = m.kickoffUtc.slice(0, 10);
      return day >= round.dateStart! && day <= round.dateEnd!;
    });
  }

  if (roundMatches.length === 0) return new Map();

  const points = new Map<number, number>();

  for (const match of roundMatches) {
    const stats = statsByMatchId.get(match.id);
    if (!stats) continue;

    for (const stat of stats) {
      const player = playerById.get(stat.playerId);
      if (!player) continue;

      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;
      let opponentGoals: number | null = null;
      if (player.teamId === match.homeTeamId) opponentGoals = awayScore;
      else if (player.teamId === match.awayTeamId) opponentGoals = homeScore;
      else continue;

      const cleanSheet = stat.played && opponentGoals === 0;
      const pts = calculateFantasyPoints({
        position: player.position as PlayerPosition,
        played: stat.played,
        goals: stat.goals,
        assists: stat.assists,
        cleanSheet,
        yellowCards: stat.yellowCards,
        redCard: stat.redCard,
      });
      points.set(stat.playerId, (points.get(stat.playerId) ?? 0) + pts);
    }
  }

  return points;
}

/**
 * Computes the cumulative fantasy points earned by each player across ALL
 * `finished` matches. Used to update the old fantasy_teams.totalPoints for
 * backwards-compat (the global squad model). Also the source for the per-
 * round scoring (filtered above).
 */
export async function computeFantasyPointsByPlayer(): Promise<Map<number, number>> {
  const finishedMatches = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  const allPlayers = await db
    .select({ id: players.id, teamId: players.teamId, position: players.position })
    .from(players);
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));

  const allStats = await db
    .select({
      matchId: playerMatchStats.matchId,
      playerId: playerMatchStats.playerId,
      played: playerMatchStats.played,
      goals: playerMatchStats.goals,
      assists: playerMatchStats.assists,
      yellowCards: playerMatchStats.yellowCards,
      redCard: playerMatchStats.redCard,
    })
    .from(playerMatchStats);

  const matchById = new Map(finishedMatches.map((m) => [m.id, m]));
  const pointsByPlayer = new Map<number, number>();

  for (const stat of allStats) {
    const match = matchById.get(stat.matchId);
    const player = playerById.get(stat.playerId);
    if (!match || !player) continue;

    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;
    let opponentGoals: number | null = null;
    if (player.teamId === match.homeTeamId) opponentGoals = awayScore;
    else if (player.teamId === match.awayTeamId) opponentGoals = homeScore;
    else continue;

    const cleanSheet = stat.played && opponentGoals === 0;
    const pts = calculateFantasyPoints({
      position: player.position as PlayerPosition,
      played: stat.played,
      goals: stat.goals,
      assists: stat.assists,
      cleanSheet,
      yellowCards: stat.yellowCards,
      redCard: stat.redCard,
    });
    pointsByPlayer.set(stat.playerId, (pointsByPlayer.get(stat.playerId) ?? 0) + pts);
  }

  return pointsByPlayer;
}

// ─── Recompute ────────────────────────────────────────────────────────────────

/**
 * Idempotent full recompute of:
 *  1. Each user's fantasy_round_scores row for every round that has any
 *     finished matches — using the per-round lineup (fantasyLineups).
 *  2. Each fantasy_team's legacy totalPoints — sum of all round scores.
 *
 * Captain = x2, ViceCaptain = x1.5, bench = 0.
 *
 * Serialization: this function is wrapped at the export level so only one
 * recompute runs at a time. Multiple concurrent callers (sync-scores,
 * sync-espn, sync-player-stats, admin endpoints) all coalesce into the
 * same in-flight promise. The next request that arrives during a running
 * recompute gets the in-flight promise back; the one after that triggers
 * a fresh run when the current one ends, so we never lose a state-change
 * signal but we also never run two parallel recomputes.
 */
let recomputeInFlight: Promise<RecomputeResult> | null = null;
let recomputePending = false;
export async function recomputeAllFantasyPoints(): Promise<RecomputeResult> {
  if (recomputeInFlight) {
    // Mark that another run is needed once this finishes.
    recomputePending = true;
    return recomputeInFlight;
  }
  recomputeInFlight = (async () => {
    try {
      return await recomputeAllFantasyPointsImpl();
    } finally {
      recomputeInFlight = null;
      if (recomputePending) {
        recomputePending = false;
        // Schedule the deferred re-run on the next tick so the original
        // caller's promise resolves first.
        setImmediate(() => {
          recomputeAllFantasyPoints().catch((err) =>
            console.error('[fantasy] deferred recompute failed:', err),
          );
        });
      }
    }
  })();
  return recomputeInFlight;
}

async function recomputeAllFantasyPointsImpl(): Promise<RecomputeResult> {
  // Load ALL lineups at once — cheaper than per-user queries.
  const allLineups = await db.select().from(fantasyLineups);

  // Group by (userId, round) for lookup.
  type LineupKey = string;
  const lineupByUserRound = new Map<LineupKey, typeof allLineups>();
  for (const row of allLineups) {
    const key: LineupKey = `${row.userId}:${row.round}`;
    const list = lineupByUserRound.get(key);
    if (list) list.push(row);
    else lineupByUserRound.set(key, [row]);
  }

  // Load the scoring inputs ONCE for the whole recompute. Previously each round
  // re-queried `players` (full table) and `matches`, so a recompute scanned the
  // squad ~7× (once per round) — a major Turso read amplification. Players,
  // finished matches and their stats are shared across rounds, so we fetch them
  // here and filter per round in memory.
  const allPlayers = await db
    .select({ id: players.id, teamId: players.teamId, position: players.position })
    .from(players);
  const playerById = new Map<number, PlayerInfo>(allPlayers.map((p) => [p.id, p]));

  const finishedMatches: FinishedMatchInfo[] = await db
    .select({
      id: matches.id,
      round: matches.round,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      kickoffUtc: matches.kickoffUtc,
    })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  const matchIds = finishedMatches.map((m) => m.id);
  const allStats: StatInfo[] = matchIds.length
    ? await db
        .select({
          matchId: playerMatchStats.matchId,
          playerId: playerMatchStats.playerId,
          played: playerMatchStats.played,
          goals: playerMatchStats.goals,
          assists: playerMatchStats.assists,
          yellowCards: playerMatchStats.yellowCards,
          redCard: playerMatchStats.redCard,
        })
        .from(playerMatchStats)
        .where(inArray(playerMatchStats.matchId, matchIds))
    : [];

  const statsByMatchId = new Map<number, StatInfo[]>();
  for (const stat of allStats) {
    const list = statsByMatchId.get(stat.matchId);
    if (list) list.push(stat);
    else statsByMatchId.set(stat.matchId, [stat]);
  }

  const userIds = [...new Set(allLineups.map((r) => r.userId))];
  let roundsScored = 0;
  const totalByUser = new Map<number, number>();

  for (const round of FANTASY_ROUNDS) {
    const playerPoints = computeFantasyPointsByPlayerForRound(
      round,
      finishedMatches,
      playerById,
      statsByMatchId,
    );
    if (playerPoints.size === 0) continue; // no finished matches in this round yet

    for (const userId of userIds) {
      const lineup = lineupByUserRound.get(`${userId}:${round.slug}`) ?? [];
      let roundTotal = 0;
      for (const row of lineup) {
        if (!row.isStarter) continue;
        const base = playerPoints.get(row.playerId) ?? 0;
        const multiplier = row.isCaptain ? 2 : row.isViceCaptain ? 1.5 : 1;
        roundTotal += base * multiplier;
      }

      await db
        .insert(fantasyRoundScores)
        .values({ userId, round: round.slug, points: Math.round(roundTotal) })
        .onConflictDoUpdate({
          target: [fantasyRoundScores.userId, fantasyRoundScores.round],
          set: { points: Math.round(roundTotal), updatedAt: sql`(datetime('now'))` },
        });

      totalByUser.set(userId, (totalByUser.get(userId) ?? 0) + Math.round(roundTotal));
    }
    roundsScored++;
  }

  // Update legacy fantasy_teams.totalPoints (used by global profile / fantasy_legend).
  const teamRows = await db.select({ id: fantasyTeams.id, userId: fantasyTeams.userId }).from(fantasyTeams);
  let teamsUpdated = 0;
  for (const team of teamRows) {
    const total = totalByUser.get(team.userId) ?? 0;
    await db
      .update(fantasyTeams)
      .set({ totalPoints: total, updatedAt: sql`(datetime('now'))` })
      .where(eq(fantasyTeams.id, team.id));
    teamsUpdated++;
  }

  return { teamsUpdated, roundsScored };
}
