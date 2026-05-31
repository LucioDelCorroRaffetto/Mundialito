import { eq, sql, and, inArray } from 'drizzle-orm';
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

/**
 * Returns fantasy points per player restricted to matches that belong to the
 * given fantasy round. This is the core per-round scoring function.
 */
async function computeFantasyPointsByPlayerForRound(
  round: FantasyRound,
): Promise<Map<number, number>> {
  // Fetch only finished matches that belong to this fantasy round.
  const whereConditions = [];
  const dbRounds = Array.isArray(round.dbRound) ? round.dbRound : [round.dbRound];
  whereConditions.push(eq(matches.status, 'finished'));
  whereConditions.push(inArray(matches.round, dbRounds));

  const roundMatches = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      kickoffUtc: matches.kickoffUtc,
    })
    .from(matches)
    .where(and(...whereConditions));

  // For group rounds, further filter by date window.
  let filteredMatches = roundMatches;
  if (round.dateStart && round.dateEnd) {
    filteredMatches = roundMatches.filter((m) => {
      const day = m.kickoffUtc.slice(0, 10);
      return day >= round.dateStart! && day <= round.dateEnd!;
    });
  }

  if (filteredMatches.length === 0) return new Map();

  const matchIds = filteredMatches.map((m) => m.id);
  const allPlayers = await db
    .select({ id: players.id, teamId: players.teamId, position: players.position })
    .from(players);
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));

  const stats = await db
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
    .where(inArray(playerMatchStats.matchId, matchIds));

  const matchById = new Map(filteredMatches.map((m) => [m.id, m]));
  const points = new Map<number, number>();

  for (const stat of stats) {
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
    points.set(stat.playerId, (points.get(stat.playerId) ?? 0) + pts);
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
 */
export async function recomputeAllFantasyPoints(): Promise<RecomputeResult> {
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

  const userIds = [...new Set(allLineups.map((r) => r.userId))];
  let roundsScored = 0;
  const totalByUser = new Map<number, number>();

  for (const round of FANTASY_ROUNDS) {
    const playerPoints = await computeFantasyPointsByPlayerForRound(round);
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
