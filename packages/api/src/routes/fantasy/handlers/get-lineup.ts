import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { fantasyLineups, players, teams, fantasyRoundScores, playerMatchStats, matches } from '../../../db/schema/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { AppError } from '../../../lib/errors.js';
import { FANTASY_ROUNDS } from '../../../lib/fantasy-rounds.js';
import { calculateFantasyPoints, PlayerPosition } from '../../../lib/fantasy-scoring.js';

export async function getMyLineupHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const round = req.params.round;

  const roundDef = FANTASY_ROUNDS.find((r) => r.slug === round);
  if (!roundDef) {
    throw new AppError('VALIDATION', `Unknown fantasy round: ${round}`, 400);
  }

  const lineupRows = await db
    .select()
    .from(fantasyLineups)
    .where(and(eq(fantasyLineups.userId, userId), eq(fantasyLineups.round, round as string)));

  if (lineupRows.length === 0) return res.json({ data: null, meta: { round } });

  const playerIds = lineupRows.map((r) => r.playerId);
  const playerData = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      teamId: players.teamId,
      teamCode: teams.code,
      teamFlag: teams.flag,
      teamName: teams.name,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(inArray(players.id, playerIds));
  const playerMap = new Map(playerData.map((p) => [p.id, p]));

  const roundScore = await db
    .select({ points: fantasyRoundScores.points })
    .from(fantasyRoundScores)
    .where(and(eq(fantasyRoundScores.userId, userId), eq(fantasyRoundScores.round, round as string)))
    .get();

  // ─── Per-player breakdown for closed rounds ────────────────────────────────
  // Only computed when the round is closed (deadline has passed), so we don't
  // do the extra DB work for open rounds where points don't exist yet.
  const isOpen = Date.now() < new Date(roundDef.deadline).getTime();
  type PlayerBreakdown = {
    played: boolean;
    goals: number;
    assists: number;
    cleanSheet: boolean;
    yellowCards: number;
    redCard: boolean;
    basePoints: number;   // points before captain/vice multiplier
    totalPoints: number;  // after multiplier
  };
  const breakdownByPlayer = new Map<number, PlayerBreakdown>();

  if (!isOpen) {
    // Fetch finished matches belonging to this round.
    const dbRounds = Array.isArray(roundDef.dbRound) ? roundDef.dbRound : [roundDef.dbRound];
    let roundMatches = await db
      .select({
        id: matches.id,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        kickoffUtc: matches.kickoffUtc,
      })
      .from(matches)
      .where(and(eq(matches.status, 'finished'), inArray(matches.round, dbRounds)));

    // Group rounds are further filtered by date window.
    if (roundDef.dateStart && roundDef.dateEnd) {
      roundMatches = roundMatches.filter((m) => {
        const day = m.kickoffUtc.slice(0, 10);
        return day >= roundDef.dateStart! && day <= roundDef.dateEnd!;
      });
    }

    if (roundMatches.length > 0) {
      const matchIds = roundMatches.map((m) => m.id);
      const matchById = new Map(roundMatches.map((m) => [m.id, m]));

      // Fetch only stats for the players in this lineup.
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
        .where(and(inArray(playerMatchStats.matchId, matchIds), inArray(playerMatchStats.playerId, playerIds)));

      // Fetch full player info (position + teamId) for clean-sheet derivation.
      const fullPlayerData = await db
        .select({ id: players.id, teamId: players.teamId, position: players.position })
        .from(players)
        .where(inArray(players.id, playerIds));
      const fullPlayerById = new Map(fullPlayerData.map((p) => [p.id, p]));

      // Accumulate stats per player across all round matches.
      type RawAccum = { played: boolean; goals: number; assists: number; yellowCards: number; redCard: boolean; cleanSheet: boolean };
      const accum = new Map<number, RawAccum>();

      for (const stat of stats) {
        const match = matchById.get(stat.matchId);
        const player = fullPlayerById.get(stat.playerId);
        if (!match || !player) continue;

        const homeScore = match.homeScore ?? 0;
        const awayScore = match.awayScore ?? 0;
        let opponentGoals: number;
        if (player.teamId === match.homeTeamId) opponentGoals = awayScore;
        else if (player.teamId === match.awayTeamId) opponentGoals = homeScore;
        else continue; // player not in this match (shouldn't happen)

        // Clean sheet: played AND opponent didn't score.
        const cleanSheet = stat.played && opponentGoals === 0;

        const cur = accum.get(stat.playerId);
        if (cur) {
          cur.played = cur.played || stat.played;
          cur.goals += stat.goals;
          cur.assists += stat.assists;
          cur.yellowCards += stat.yellowCards;
          cur.redCard = cur.redCard || stat.redCard;
          // Clean sheet is per-match; OR-ing across matches here means "had at
          // least one clean sheet", which is correct for multi-match rounds.
          cur.cleanSheet = cur.cleanSheet || cleanSheet;
        } else {
          accum.set(stat.playerId, {
            played: stat.played,
            goals: stat.goals,
            assists: stat.assists,
            yellowCards: stat.yellowCards,
            redCard: stat.redCard,
            cleanSheet,
          });
        }
      }

      // Build breakdown using calculateFantasyPoints as single source of truth.
      for (const lineupRow of lineupRows) {
        if (!lineupRow.isStarter) continue;
        const raw = accum.get(lineupRow.playerId);
        const player = fullPlayerById.get(lineupRow.playerId);
        if (!player) continue;

        const input = raw ?? { played: false, goals: 0, assists: 0, yellowCards: 0, redCard: false, cleanSheet: false };
        const basePoints = calculateFantasyPoints({
          position: player.position as PlayerPosition,
          played: input.played,
          goals: input.goals,
          assists: input.assists,
          cleanSheet: input.cleanSheet,
          yellowCards: input.yellowCards,
          redCard: input.redCard,
        });
        const multiplier = lineupRow.isCaptain ? 2 : lineupRow.isViceCaptain ? 1.5 : 1;
        breakdownByPlayer.set(lineupRow.playerId, {
          played: input.played,
          goals: input.goals,
          assists: input.assists,
          cleanSheet: input.cleanSheet,
          yellowCards: input.yellowCards,
          redCard: input.redCard,
          basePoints,
          totalPoints: Math.round(basePoints * multiplier),
        });
      }
    }
  }

  const data = lineupRows.map((row) => ({
    playerId: row.playerId,
    isStarter: row.isStarter,
    isCaptain: row.isCaptain,
    isViceCaptain: row.isViceCaptain,
    player: playerMap.get(row.playerId) ?? null,
    breakdown: breakdownByPlayer.get(row.playerId) ?? null,
  }));

  return res.json({
    data,
    meta: { round, points: roundScore?.points ?? 0 },
  });
}
