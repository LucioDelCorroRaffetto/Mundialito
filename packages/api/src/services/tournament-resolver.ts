/**
 * Resuelve y puntúa las predicciones de Copa (`tournament_predictions.points`).
 *
 * Se evalúa AL FINAL del torneo: el goleador, la valla menos vencida y la
 * profundidad alcanzada por cada equipo recién quedan firmes cuando se jugó la
 * final. Por eso `resolveTournamentOutcome` devuelve null hasta que la final
 * esté finished con un ganador, y el resolver no toca nada hasta ese momento.
 *
 * Es idempotente: sólo reescribe `points` cuando cambió. Se dispara desde el
 * cierre de la final (finalize-match / sync-scores) y se puede correr a mano
 * con `scripts/resolve-tournament-predictions.ts`.
 *
 * Los puntos resultantes se suman a la tabla de cada liga en
 * `routes/leagues/handlers/standings.ts`.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, teams, playerMatchStats, tournamentPredictions } from '../db/schema/index.js';
import { initialEloFor } from '../lib/elo.js';
import {
  depthReachedFrom,
  pickRevelations,
  pickDisappointments,
  scoreTournamentPrediction,
  DEPTH,
  type Round,
  type TeamRun,
  type TournamentOutcome,
} from '../lib/tournament-scoring.js';

/**
 * Calcula el resultado resuelto del torneo a partir del estado actual de la DB.
 * Devuelve null si el torneo todavía no terminó (final no finished o empatada),
 * porque varias categorías no son firmes hasta entonces.
 */
export async function resolveTournamentOutcome(): Promise<TournamentOutcome | null> {
  const finalMatch = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.round, 'final'))
    .get();

  if (
    !finalMatch ||
    finalMatch.status !== 'finished' ||
    finalMatch.homeScore == null ||
    finalMatch.awayScore == null ||
    finalMatch.homeScore === finalMatch.awayScore || // empate ⇒ shootout aún sin resolver
    finalMatch.homeTeamId == null ||
    finalMatch.awayTeamId == null
  ) {
    return null;
  }

  const championTeamId =
    finalMatch.homeScore > finalMatch.awayScore ? finalMatch.homeTeamId : finalMatch.awayTeamId;
  const runnerUpTeamId =
    finalMatch.homeScore > finalMatch.awayScore ? finalMatch.awayTeamId : finalMatch.homeTeamId;

  // ── Tercer puesto: ganador del partido por el bronce, si ya se jugó ──────────
  const thirdMatch = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.round, 'third'))
    .get();

  let thirdPlaceTeamId: number | null = null;
  if (
    thirdMatch &&
    thirdMatch.status === 'finished' &&
    thirdMatch.homeScore != null &&
    thirdMatch.awayScore != null &&
    thirdMatch.homeScore !== thirdMatch.awayScore
  ) {
    thirdPlaceTeamId =
      thirdMatch.homeScore > thirdMatch.awayScore ? thirdMatch.homeTeamId : thirdMatch.awayTeamId;
  }

  // ── Profundidad alcanzada + goles recibidos por equipo ──────────────────────
  const finished = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      round: matches.round,
    })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  const roundsByTeam = new Map<number, Set<Round>>();
  const concededByTeam = new Map<number, { ga: number; played: number }>();
  const note = (teamId: number, round: Round, conceded: number) => {
    const rs = roundsByTeam.get(teamId) ?? new Set<Round>();
    rs.add(round);
    roundsByTeam.set(teamId, rs);
    const c = concededByTeam.get(teamId) ?? { ga: 0, played: 0 };
    c.ga += conceded;
    c.played += 1;
    concededByTeam.set(teamId, c);
  };
  for (const m of finished) {
    if (m.homeTeamId == null || m.awayTeamId == null) continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    const round = m.round as Round;
    note(m.homeTeamId, round, m.awayScore);
    note(m.awayTeamId, round, m.homeScore);
  }

  const teamRows = await db.select({ id: teams.id, code: teams.code }).from(teams);

  // ── Ceniciento / Decepción: brecha entre profundidad esperada (Elo) y real ──
  const runs: TeamRun[] = [];
  for (const t of teamRows) {
    const rounds = roundsByTeam.get(t.id);
    if (!rounds) continue; // equipo que no jugó (placeholder TBD, etc.)
    runs.push({
      teamId: t.id,
      elo: initialEloFor(t.code),
      depthReached: depthReachedFrom(rounds, t.id === championTeamId),
    });
  }
  const revelationTeamIds = pickRevelations(runs);
  const surpriseEliminatedTeamIds = pickDisappointments(runs);

  // ── Valla menos vencida: menor promedio de goles recibidos, mínimo octavos ──
  const depthById = new Map(runs.map((r) => [r.teamId, r.depthReached]));
  let bestAvg = Infinity;
  const avgByTeam: Array<{ teamId: number; avg: number }> = [];
  for (const [teamId, c] of concededByTeam) {
    if ((depthById.get(teamId) ?? 0) < DEPTH.r16) continue; // tiene que llegar a octavos
    if (c.played === 0) continue;
    const avg = c.ga / c.played;
    avgByTeam.push({ teamId, avg });
    if (avg < bestAvg) bestAvg = avg;
  }
  const EPS = 1e-9;
  const bestDefenseTeamIds = avgByTeam
    .filter((t) => Math.abs(t.avg - bestAvg) < EPS)
    .map((t) => t.teamId);

  // ── Goleador: máximo de goles sumando partidos finished (empate ⇒ todos) ────
  const scorerRows = await db
    .select({
      playerId: playerMatchStats.playerId,
      goals: sql<number>`sum(${playerMatchStats.goals})`.as('total'),
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(playerMatchStats.matchId, matches.id))
    .where(eq(matches.status, 'finished'))
    .groupBy(playerMatchStats.playerId);
  const maxGoals = scorerRows.reduce((m, r) => (Number(r.goals) > m ? Number(r.goals) : m), 0);
  const topScorerPlayerIds =
    maxGoals > 0
      ? scorerRows.filter((r) => Number(r.goals) === maxGoals).map((r) => r.playerId)
      : [];

  return {
    championTeamId,
    runnerUpTeamId,
    thirdPlaceTeamId,
    topScorerPlayerIds,
    revelationTeamIds,
    surpriseEliminatedTeamIds,
    bestDefenseTeamIds,
  };
}

export interface ResolveResult {
  resolved: boolean;
  updated: number;
  outcome?: TournamentOutcome;
}

/**
 * Puntúa todas las filas de `tournament_predictions` contra el resultado
 * resuelto y persiste `points`. No-op (resolved:false) si el torneo no terminó.
 * Idempotente: sólo escribe las filas cuyo puntaje cambió.
 */
export async function resolveTournamentPredictions(): Promise<ResolveResult> {
  const outcome = await resolveTournamentOutcome();
  if (!outcome) return { resolved: false, updated: 0 };

  const rows = await db.select().from(tournamentPredictions);
  let updated = 0;
  for (const row of rows) {
    const pts = scoreTournamentPrediction(row, outcome);
    if (row.points === pts) continue;
    await db
      .update(tournamentPredictions)
      .set({ points: pts, updatedAt: sql`(datetime('now'))` })
      .where(eq(tournamentPredictions.id, row.id));
    updated++;
  }
  return { resolved: true, updated, outcome };
}
