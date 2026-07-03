import { Request, Response } from 'express';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  users,
  predictions,
  matches,
  teams,
  leagues,
  leagueMembers,
  tournamentPredictions,
  fantasyTeams,
  userAchievements,
  achievements,
} from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';
import { dedupeBestPerMatch } from '../../../lib/prediction-aggregates.js';
import { computeLevel } from '../../../lib/levels.js';
import { computeUserXp } from '../../../lib/user-xp.js';
import { TOURNAMENT_POINTS } from '../../../lib/tournament-scoring.js';
import { HIDDEN_USER_IDS } from '../../../lib/hidden-users.js';
import {
  longestStreak,
  bestHit,
  nearestRival,
  mostPredictedTeam,
  type PredictionOutcome,
} from '../../../lib/wrapped.js';

function getAdminIds(): number[] {
  return process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
}

async function isTournamentFinished(): Promise<boolean> {
  const finalMatch = await db
    .select({ status: matches.status })
    .from(matches)
    .where(eq(matches.round, 'final'))
    .get();
  return finalMatch?.status === 'finished';
}

interface CacheEntry {
  data: unknown;
  at: number;
}
const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Assigns rank/position sharing ties, same pattern used across leaderboard/standings handlers. */
function rankWithTies<T extends { points: number }>(rows: T[]): Array<T & { position: number }> {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  let position = 0;
  let lastPoints = -1;
  return sorted.map((row, idx) => {
    if (row.points !== lastPoints) {
      position = idx + 1;
      lastPoints = row.points;
    }
    return { ...row, position };
  });
}

export async function wrappedHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const preview = req.query.preview === '1';
  const isAdmin = getAdminIds().includes(userId);

  const finished = await isTournamentFinished();
  if (!finished && !(preview && isAdmin)) {
    throw new AppError(
      'TOURNAMENT_NOT_FINISHED',
      'El Wrapped se abre cuando termine el Mundial',
      409,
    );
  }

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.json({ data: cached.data });
  }

  const data = await buildWrapped(userId);
  cache.set(userId, { data, at: Date.now() });
  return res.json({ data });
}

async function buildWrapped(userId: number) {
  // ── Predicciones partido-a-partido del usuario (matches finished) ─────────
  const rawRows = await db
    .select({
      matchId: predictions.matchId,
      predHomeScore: predictions.homeScore,
      predAwayScore: predictions.awayScore,
      points: predictions.points,
      matchHomeScore: matches.homeScore,
      matchAwayScore: matches.awayScore,
      kickoffUtc: matches.kickoffUtc,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.userId, userId), eq(matches.status, 'finished')));

  const rows = dedupeBestPerMatch(rawRows);
  const totalPredictions = rows.length;

  let exactCount = 0;
  let correctCount = 0;
  let totalPoints = 0;
  const streakEntries: { kickoffUtc: string; outcome: PredictionOutcome }[] = [];
  const exactEntries: { matchId: number; homeScore: number; awayScore: number }[] = [];

  for (const row of rows) {
    const pts = row.points ?? 0;
    totalPoints += pts;

    const isExact =
      row.matchHomeScore !== null &&
      row.matchAwayScore !== null &&
      row.predHomeScore === row.matchHomeScore &&
      row.predAwayScore === row.matchAwayScore;

    let outcome: PredictionOutcome;
    if (isExact) {
      exactCount++;
      outcome = 'exact';
      exactEntries.push({ matchId: row.matchId, homeScore: row.predHomeScore, awayScore: row.predAwayScore });
    } else if (pts > 0) {
      correctCount++;
      outcome = 'correct';
    } else {
      outcome = 'wrong';
    }
    streakEntries.push({ kickoffUtc: row.kickoffUtc, outcome });
  }

  const accuracy = totalPredictions > 0 ? Math.round((exactCount / totalPredictions) * 100) : 0;
  const streak = longestStreak(streakEntries);

  const bestHitRaw = bestHit(exactEntries);
  const matchTeamsById = new Map(rows.map((r) => [r.matchId, { homeTeamId: r.homeTeamId, awayTeamId: r.awayTeamId }]));

  const predictedWinnerTeamId = mostPredictedTeam(
    rows.map((r) => ({ matchId: r.matchId, homeScore: r.predHomeScore, awayScore: r.predAwayScore })),
    rows.map((r) => ({ id: r.matchId, homeTeamId: r.homeTeamId, awayTeamId: r.awayTeamId })),
  );

  // ── Ligas del usuario (se excluye la personal, igual que leagueCount) ─────
  const membershipRows = await db
    .select({ leagueId: leagueMembers.leagueId, name: leagues.name })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(and(eq(leagueMembers.userId, userId), eq(leagues.isPersonal, false)));

  const leagueIds = membershipRows.map((m) => m.leagueId);

  let perLeague: { leagueId: number; name: string; position: number; points: number }[] = [];
  let principalLeagueId: number | null = null;
  let nearestRivalResult: ReturnType<typeof nearestRival> = null;

  if (leagueIds.length > 0) {
    const allMembersRows = await db
      .select({ leagueId: leagueMembers.leagueId, userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(inArray(leagueMembers.leagueId, leagueIds));

    const membersByLeague = new Map<number, number[]>();
    for (const m of allMembersRows) {
      const list = membersByLeague.get(m.leagueId) ?? [];
      list.push(m.userId);
      membersByLeague.set(m.leagueId, list);
    }

    // Liga principal = la de más miembros.
    principalLeagueId = leagueIds.reduce((best, id) => {
      const count = membersByLeague.get(id)?.length ?? 0;
      const bestCount = best == null ? -1 : (membersByLeague.get(best)?.length ?? 0);
      return count > bestCount ? id : best;
    }, null as number | null);

    const predRows = await db
      .select({
        leagueId: predictions.leagueId,
        userId: predictions.userId,
        points: predictions.points,
      })
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .where(inArray(predictions.leagueId, leagueIds));

    const tournamentRows = await db
      .select({
        leagueId: tournamentPredictions.leagueId,
        userId: tournamentPredictions.userId,
        points: tournamentPredictions.points,
      })
      .from(tournamentPredictions)
      .where(inArray(tournamentPredictions.leagueId, leagueIds));

    const pointsByLeagueUser = new Map<string, number>();
    for (const p of predRows) {
      if (p.points == null) continue;
      const key = `${p.leagueId}:${p.userId}`;
      pointsByLeagueUser.set(key, (pointsByLeagueUser.get(key) ?? 0) + p.points);
    }
    for (const t of tournamentRows) {
      if (t.points == null) continue;
      const key = `${t.leagueId}:${t.userId}`;
      pointsByLeagueUser.set(key, (pointsByLeagueUser.get(key) ?? 0) + t.points);
    }

    perLeague = membershipRows.map((league) => {
      const memberIds = membersByLeague.get(league.leagueId) ?? [];
      const standings = rankWithTies(
        memberIds.map((uid) => ({
          userId: uid,
          points: pointsByLeagueUser.get(`${league.leagueId}:${uid}`) ?? 0,
        })),
      );
      const mine = standings.find((s) => s.userId === userId)!;
      return { leagueId: league.leagueId, name: league.name, position: mine.position, points: mine.points };
    });

    if (principalLeagueId != null) {
      const principalMemberIds = membersByLeague.get(principalLeagueId) ?? [];
      const standings = rankWithTies(
        principalMemberIds.map((uid) => ({
          userId: uid,
          points: pointsByLeagueUser.get(`${principalLeagueId}:${uid}`) ?? 0,
        })),
      );
      const mine = standings.find((s) => s.userId === userId)!;
      nearestRivalResult = nearestRival(userId, mine.points, standings);
    }
  }

  // ── Rank global (misma lógica que /users/leaderboard) ─────────────────────
  const hiddenIds = [...new Set([...getAdminIds(), ...HIDDEN_USER_IDS])];
  const bestPerMatch = db
    .select({
      userId: predictions.userId,
      matchId: predictions.matchId,
      bestPoints: sql<number>`max(${predictions.points})`.as('best_points'),
    })
    .from(predictions)
    .groupBy(predictions.userId, predictions.matchId)
    .as('best_per_match');

  const totalsQuery = db
    .select({
      userId: users.id,
      totalPoints: sql<number>`coalesce(sum(${bestPerMatch.bestPoints}), 0)`,
    })
    .from(users)
    .leftJoin(bestPerMatch, eq(bestPerMatch.userId, users.id))
    .groupBy(users.id);

  const totals = hiddenIds.length > 0
    ? await totalsQuery.where(notInArray(users.id, hiddenIds))
    : await totalsQuery;

  const globalStandings = rankWithTies(totals.map((t) => ({ userId: t.userId, points: Number(t.totalPoints) })));
  const globalRank = globalStandings.find((s) => s.userId === userId)?.position ?? null;

  // ── Campeón elegido ─────────────────────────────────────────────────────
  const tournamentPickRow = await db
    .select({
      championTeamId: tournamentPredictions.championTeamId,
      points: tournamentPredictions.points,
    })
    .from(tournamentPredictions)
    .where(
      and(
        eq(tournamentPredictions.userId, userId),
        principalLeagueId != null
          ? eq(tournamentPredictions.leagueId, principalLeagueId)
          : undefined,
      ),
    )
    .get();

  let championPick: { teamId: number; name: string; flag: string; correct: boolean; points: number } | null = null;
  if (tournamentPickRow?.championTeamId != null) {
    const finalMatch = await db
      .select({
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
      })
      .from(matches)
      .where(eq(matches.round, 'final'))
      .get();

    let actualChampionTeamId: number | null = null;
    if (
      finalMatch &&
      finalMatch.homeScore != null &&
      finalMatch.awayScore != null &&
      finalMatch.homeScore !== finalMatch.awayScore
    ) {
      actualChampionTeamId =
        finalMatch.homeScore > finalMatch.awayScore ? finalMatch.homeTeamId : finalMatch.awayTeamId;
    }

    const correct = actualChampionTeamId != null && actualChampionTeamId === tournamentPickRow.championTeamId;
    championPick = {
      teamId: tournamentPickRow.championTeamId,
      name: '',
      flag: '',
      correct,
      points: correct ? TOURNAMENT_POINTS.champion : 0,
    };
  }

  // ── Fantasy ─────────────────────────────────────────────────────────────
  const fantasyRows = await db
    .select({ userId: fantasyTeams.userId, points: fantasyTeams.totalPoints })
    .from(fantasyTeams);
  let fantasy: { points: number; rank: number } | null = null;
  if (fantasyRows.some((f) => f.userId === userId)) {
    const ranked = rankWithTies(fantasyRows.map((f) => ({ userId: f.userId, points: f.points })));
    const mine = ranked.find((f) => f.userId === userId)!;
    fantasy = { points: mine.points, rank: mine.position };
  }

  // ── Achievements + XP/level ────────────────────────────────────────────
  const earnedRows = await db
    .select({
      slug: achievements.slug,
      name: achievements.name,
      icon: achievements.icon,
      xpReward: achievements.pointsBonus,
      earnedAt: userAchievements.earnedAt,
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(eq(userAchievements.userId, userId));

  const topAchievements = [...earnedRows].sort((a, b) => b.xpReward - a.xpReward).slice(0, 3);

  const xp = await computeUserXp(userId);
  const level = computeLevel(xp);

  // ── Enriquecer con datos de equipos (bestHit, mostPredictedTeam, championPick) ─
  const teamIdsNeeded = new Set<number>();
  if (bestHitRaw) {
    const mt = matchTeamsById.get(bestHitRaw.matchId);
    if (mt?.homeTeamId != null) teamIdsNeeded.add(mt.homeTeamId);
    if (mt?.awayTeamId != null) teamIdsNeeded.add(mt.awayTeamId);
  }
  if (predictedWinnerTeamId != null) teamIdsNeeded.add(predictedWinnerTeamId);
  if (championPick != null) teamIdsNeeded.add(championPick.teamId);

  const teamRows = teamIdsNeeded.size > 0
    ? await db.select({ id: teams.id, name: teams.name, flag: teams.flag }).from(teams).where(inArray(teams.id, [...teamIdsNeeded]))
    : [];
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const bestHitEnriched = bestHitRaw
    ? (() => {
        const mt = matchTeamsById.get(bestHitRaw.matchId);
        return {
          matchId: bestHitRaw.matchId,
          homeScore: bestHitRaw.homeScore,
          awayScore: bestHitRaw.awayScore,
          rarity: bestHitRaw.rarity ?? null,
          homeTeam: mt?.homeTeamId != null ? teamById.get(mt.homeTeamId) ?? null : null,
          awayTeam: mt?.awayTeamId != null ? teamById.get(mt.awayTeamId) ?? null : null,
        };
      })()
    : null;

  const mostPredictedTeamEnriched = predictedWinnerTeamId != null
    ? teamById.get(predictedWinnerTeamId) ?? null
    : null;

  if (championPick) {
    const team = teamById.get(championPick.teamId);
    championPick.name = team?.name ?? '';
    championPick.flag = team?.flag ?? '';
  }

  return {
    totalPoints,
    exactCount,
    correctCount,
    totalPredictions,
    accuracy,
    globalRank,
    perLeague,
    longestStreak: streak,
    bestHit: bestHitEnriched,
    nearestRival: nearestRivalResult,
    mostPredictedTeam: mostPredictedTeamEnriched,
    championPick,
    fantasy,
    topAchievements,
    xp,
    level,
  };
}
