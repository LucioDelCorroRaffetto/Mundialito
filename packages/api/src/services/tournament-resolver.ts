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
  surpriseCandidates,
  disappointmentCandidates,
  scoreTournamentPrediction,
  DEPTH,
  type CategoryCandidate,
  type Round,
  type TeamRun,
  type TournamentOutcome,
} from '../lib/tournament-scoring.js';

/**
 * Outcome + el detalle de las candidatas a sorpresa/decepción (incluidas y
 * rechazadas, con brechas y batacazos) para poder EXPLICAR cada decisión
 * cuando se liberan los puntos.
 */
export interface DetailedOutcome {
  outcome: TournamentOutcome;
  surprises: CategoryCandidate[];
  disappointments: CategoryCandidate[];
}

/**
 * Calcula el resultado resuelto del torneo a partir del estado actual de la DB.
 * Devuelve null si el torneo todavía no terminó (final no finished o empatada),
 * porque varias categorías no son firmes hasta entonces.
 */
export async function resolveTournamentOutcome(): Promise<TournamentOutcome | null> {
  const detailed = await resolveTournamentOutcomeDetailed();
  return detailed?.outcome ?? null;
}

/** Igual que resolveTournamentOutcome pero con las candidatas explicadas. */
export async function resolveTournamentOutcomeDetailed(): Promise<DetailedOutcome | null> {
  const finalMatch = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
      penaltyWinner: matches.penaltyWinner,
    })
    .from(matches)
    .where(eq(matches.round, 'final'))
    .get();

  // Un KO cerrado en empate puede estar resuelto igual si el admin cargó el
  // lado ganador de la tanda vía `penalty_winner` (sin bump del score — el
  // mecanismo usado en el match 96 de octavos). Sin esto, una final cerrada
  // así jamás resolvería las predicciones de Copa.
  const winnerSide = (m: {
    homeScore: number | null;
    awayScore: number | null;
    penaltyWinner: 'home' | 'away' | null;
  }): 'home' | 'away' | null => {
    if (m.homeScore == null || m.awayScore == null) return null;
    if (m.homeScore > m.awayScore) return 'home';
    if (m.homeScore < m.awayScore) return 'away';
    return m.penaltyWinner ?? null; // empate ⇒ shootout aún sin resolver
  };

  const finalWinner = finalMatch ? winnerSide(finalMatch) : null;
  if (
    !finalMatch ||
    finalMatch.status !== 'finished' ||
    finalWinner == null ||
    finalMatch.homeTeamId == null ||
    finalMatch.awayTeamId == null
  ) {
    return null;
  }

  const championTeamId =
    finalWinner === 'home' ? finalMatch.homeTeamId : finalMatch.awayTeamId;
  const runnerUpTeamId =
    finalWinner === 'home' ? finalMatch.awayTeamId : finalMatch.homeTeamId;

  // ── Tercer puesto: ganador del partido por el bronce, si ya se jugó ──────────
  const thirdMatch = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
      penaltyWinner: matches.penaltyWinner,
    })
    .from(matches)
    .where(eq(matches.round, 'third'))
    .get();

  let thirdPlaceTeamId: number | null = null;
  if (thirdMatch && thirdMatch.status === 'finished') {
    const side = winnerSide(thirdMatch);
    if (side != null) {
      thirdPlaceTeamId = side === 'home' ? thirdMatch.homeTeamId : thirdMatch.awayTeamId;
    }
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
  const eloById = new Map(teamRows.map((t) => [t.id, initialEloFor(t.code)]));

  // ── Batacazos y méritos: peor derrota vs inferior, mejor resultado vs superior ──
  // El score guardado ya trae el +1 del ganador por penales, así que un cruce
  // perdido en la tanda también cuenta como derrota — para el hincha, quedar
  // eliminado por una selección muy inferior es batacazo igual.
  const worstLossById = new Map<number, { diff: number; rivalId: number }>();
  const bestUpsetById = new Map<number, { diff: number; rivalId: number }>();
  const noteUpset = (
    map: Map<number, { diff: number; rivalId: number }>,
    teamId: number,
    rivalId: number,
  ) => {
    const diff = (eloById.get(rivalId) ?? 1500) - (eloById.get(teamId) ?? 1500);
    // Para bestUpset el diff se mide hacia arriba (rival − propio); para
    // worstLoss lo llama invertido (ver call sites). Solo guardamos el máximo.
    if (diff > (map.get(teamId)?.diff ?? -Infinity)) map.set(teamId, { diff, rivalId });
  };
  for (const m of finished) {
    if (m.homeTeamId == null || m.awayTeamId == null) continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    if (m.homeScore === m.awayScore) {
      // Empate: mérito potencial para ambos lados (vs el rival superior).
      noteUpset(bestUpsetById, m.homeTeamId, m.awayTeamId);
      noteUpset(bestUpsetById, m.awayTeamId, m.homeTeamId);
      continue;
    }
    const loserId = m.homeScore > m.awayScore ? m.awayTeamId : m.homeTeamId;
    const winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
    // Ganarle a un superior es mérito del ganador…
    noteUpset(bestUpsetById, winnerId, loserId);
    // …y perder con un inferior es batacazo del perdedor. worstLossEloDiff se
    // define como (propio − rival), que es exactamente −(rival − propio):
    const lossDiff = (eloById.get(loserId) ?? 1500) - (eloById.get(winnerId) ?? 1500);
    if (lossDiff > (worstLossById.get(loserId)?.diff ?? -Infinity))
      worstLossById.set(loserId, { diff: lossDiff, rivalId: winnerId });
  }

  // ── Ceniciento / Decepción: brecha esperado-vs-real + batacazos/méritos ─────
  const runs: TeamRun[] = [];
  for (const t of teamRows) {
    const rounds = roundsByTeam.get(t.id);
    if (!rounds) continue; // equipo que no jugó (placeholder TBD, etc.)
    runs.push({
      teamId: t.id,
      elo: eloById.get(t.id) ?? 1500,
      depthReached: depthReachedFrom(rounds, t.id === championTeamId),
      worstLossEloDiff: worstLossById.get(t.id)?.diff,
      worstLossRivalId: worstLossById.get(t.id)?.rivalId,
      bestUpsetEloDiff: bestUpsetById.get(t.id)?.diff,
      bestUpsetRivalId: bestUpsetById.get(t.id)?.rivalId,
    });
  }
  const surprises = surpriseCandidates(runs);
  const disappointments = disappointmentCandidates(runs);
  const revelationTeamIds = surprises.filter((c) => c.included).map((c) => c.teamId);
  const surpriseEliminatedTeamIds = disappointments.filter((c) => c.included).map((c) => c.teamId);

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
    outcome: {
      championTeamId,
      runnerUpTeamId,
      thirdPlaceTeamId,
      topScorerPlayerIds,
      revelationTeamIds,
      surpriseEliminatedTeamIds,
      bestDefenseTeamIds,
    },
    surprises,
    disappointments,
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
