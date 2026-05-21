import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  matches,
  players,
  playerMatchStats,
  fantasyTeams,
  fantasySquadPlayers,
} from '../db/schema/index.js';
import { calculateFantasyPoints, PlayerPosition } from '../lib/fantasy-scoring.js';

export interface RecomputeResult {
  teamsUpdated: number;
}

/**
 * Computes the cumulative fantasy points earned by each player across all
 * `finished` matches. Returns a Map keyed by playerId. Players with no points
 * are simply absent from the map (callers default to 0).
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
    .select({
      id: players.id,
      teamId: players.teamId,
      position: players.position,
    })
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
    if (!match) continue;

    const player = playerById.get(stat.playerId);
    if (!player) continue;

    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;

    let opponentGoals: number | null = null;
    if (player.teamId === match.homeTeamId) {
      opponentGoals = awayScore;
    } else if (player.teamId === match.awayTeamId) {
      opponentGoals = homeScore;
    } else {
      continue;
    }

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

/**
 * Idempotent full recompute of every fantasy team's totalPoints.
 *
 * For each fantasy team, sums the fantasy points of its 11 STARTERS
 * (isStarter=true) across all `finished` matches. The captain (isCaptain=true)
 * scores double. Bench players score 0.
 *
 * Clean sheet is derived here: the player's team did not concede in that match
 * (played && opponent scored 0).
 */
export async function recomputeAllFantasyPoints(): Promise<RecomputeResult> {
  // 1. Cumulative fantasy points per player across all finished matches.
  const pointsByPlayer = await computeFantasyPointsByPlayer();

  // 2. For each fantasy team, sum its starters' points (captain doubled).
  const teams = await db.select({ id: fantasyTeams.id }).from(fantasyTeams);

  const allSquadRows = await db
    .select({
      fantasyTeamId: fantasySquadPlayers.fantasyTeamId,
      playerId: fantasySquadPlayers.playerId,
      isStarter: fantasySquadPlayers.isStarter,
      isCaptain: fantasySquadPlayers.isCaptain,
    })
    .from(fantasySquadPlayers);

  const squadByTeam = new Map<number, typeof allSquadRows>();
  for (const row of allSquadRows) {
    const list = squadByTeam.get(row.fantasyTeamId);
    if (list) list.push(row);
    else squadByTeam.set(row.fantasyTeamId, [row]);
  }

  let teamsUpdated = 0;
  for (const team of teams) {
    const squad = squadByTeam.get(team.id) ?? [];
    let total = 0;
    for (const member of squad) {
      if (!member.isStarter) continue; // bench scores 0
      const playerPts = pointsByPlayer.get(member.playerId) ?? 0;
      total += member.isCaptain ? playerPts * 2 : playerPts;
    }

    await db
      .update(fantasyTeams)
      .set({ totalPoints: total, updatedAt: sql`(datetime('now'))` })
      .where(eq(fantasyTeams.id, team.id));
    teamsUpdated++;
  }

  return { teamsUpdated };
}
