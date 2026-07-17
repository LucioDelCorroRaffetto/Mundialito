/**
 * Resuelve y puntúa las predicciones de Copa (`tournament_predictions.points`).
 *
 * Se evalúa AL FINAL del torneo: el goleador, la valla menos vencida y la
 * profundidad alcanzada por cada equipo recién quedan firmes cuando se jugó la
 * final. Por eso `resolveTournamentOutcome` devuelve null hasta que la final
 * esté finished con un ganador, y el resolver no toca nada hasta ese momento.
 *
 * Además expone `resolveProvisionalOutcome()`: el mismo cómputo SIN exigir la
 * final, para mostrar sorpresas/decepciones y la tabla de valla mientras el
 * torneo sigue. Con la final y el 3er puesto ya definidos, las candidatas de
 * sorpresa/decepción de los eliminados son firmes (su profundidad no cambia);
 * la valla y el goleador siguen provisionales hasta el último partido.
 *
 * Es idempotente: sólo reescribe `points` cuando cambió. Se dispara desde el
 * cierre de la final (finalize-match / sync-scores / sync-espn / update-match)
 * y se puede correr a mano con `scripts/resolve-tournament-predictions.ts`.
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

/** Fila de la tabla de valla menos vencida (transparencia de la categoría). */
export interface DefenseRow {
  teamId: number;
  /** Partidos finished jugados. */
  played: number;
  /** Goles en contra DE JUEGO (sin el +1 del bump de penales). */
  ga: number;
  /** ga / played. */
  avg: number;
  /** Cumple el requisito de haber llegado al menos a octavos. */
  qualifies: boolean;
}

/**
 * Outcome + el detalle de las candidatas a sorpresa/decepción (incluidas y
 * rechazadas, con brechas y batacazos) para poder EXPLICAR cada decisión
 * cuando se liberan los puntos.
 */
export interface DetailedOutcome {
  outcome: TournamentOutcome;
  surprises: CategoryCandidate[];
  disappointments: CategoryCandidate[];
  defenseTable: DefenseRow[];
}

/** Mismo detalle pero SIN exigir la final: para mostrar el estado en curso. */
export interface ProvisionalOutcome {
  surprises: CategoryCandidate[];
  disappointments: CategoryCandidate[];
  defenseTable: DefenseRow[];
  /** Goleador(es) parcial(es) al día de hoy. */
  topScorerPlayerIds: number[];
  maxGoals: number;
}

/**
 * Lado ganador de un KO cerrado. Un empate puede estar resuelto igual si el
 * admin cargó el lado ganador de la tanda vía `penalty_winner` (sin bump del
 * score — el mecanismo usado en el match 96 de octavos). Sin esto, una final
 * cerrada así jamás resolvería las predicciones de Copa.
 */
function winnerSide(m: {
  homeScore: number | null;
  awayScore: number | null;
  penaltyWinner: 'home' | 'away' | null;
}): 'home' | 'away' | null {
  if (m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.homeScore < m.awayScore) return 'away';
  return m.penaltyWinner ?? null; // empate ⇒ shootout aún sin resolver
}

interface Insights {
  surprises: CategoryCandidate[];
  disappointments: CategoryCandidate[];
  revelationTeamIds: number[];
  surpriseEliminatedTeamIds: number[];
  bestDefenseTeamIds: number[];
  defenseTable: DefenseRow[];
  topScorerPlayerIds: number[];
  maxGoals: number;
}

/**
 * Núcleo compartido entre el resolver final y el provisional: profundidades,
 * batacazos/méritos, sorpresas/decepciones, valla y goleador, a partir de los
 * partidos finished al momento de la llamada. `championTeamId` null ⇒ nadie
 * recibe el bump de profundidad de campeón (modo provisional).
 */
async function computeInsights(championTeamId: number | null): Promise<Insights> {
  // ── Profundidad alcanzada + goles recibidos por equipo ──────────────────────
  const finished = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      round: matches.round,
      decidedByPenalties: matches.decidedByPenalties,
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
    // Valla: goles DE JUEGO. El bump de penales (+1 al ganador de la tanda)
    // define quién avanza, pero no es un gol recibido de verdad — sin esta
    // resta, perder una tanda 0-0 le computaba al perdedor un gol fantasma
    // en contra y podía costarle la valla menos vencida.
    let gameHome = m.homeScore;
    let gameAway = m.awayScore;
    if (m.decidedByPenalties === 1 && gameHome !== gameAway) {
      if (gameHome > gameAway) gameHome -= 1;
      else gameAway -= 1;
    }
    note(m.homeTeamId, round, gameAway);
    note(m.awayTeamId, round, gameHome);
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
  const defenseTable: DefenseRow[] = [];
  for (const [teamId, c] of concededByTeam) {
    if (c.played === 0) continue;
    const qualifies = (depthById.get(teamId) ?? 0) >= DEPTH.r16;
    const avg = c.ga / c.played;
    defenseTable.push({ teamId, played: c.played, ga: c.ga, avg, qualifies });
    if (qualifies && avg < bestAvg) bestAvg = avg;
  }
  defenseTable.sort((a, b) => a.avg - b.avg || a.ga - b.ga || a.teamId - b.teamId);
  const EPS = 1e-9;
  const bestDefenseTeamIds = defenseTable
    .filter((t) => t.qualifies && Math.abs(t.avg - bestAvg) < EPS)
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
    surprises,
    disappointments,
    revelationTeamIds,
    surpriseEliminatedTeamIds,
    bestDefenseTeamIds,
    defenseTable,
    topScorerPlayerIds,
    maxGoals,
  };
}

/**
 * Calcula el resultado resuelto del torneo a partir del estado actual de la DB.
 * Devuelve null si el torneo todavía no terminó (final no finished o empatada
 * sin penalty_winner), porque varias categorías no son firmes hasta entonces.
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

  const insights = await computeInsights(championTeamId);

  return {
    outcome: {
      championTeamId,
      runnerUpTeamId,
      thirdPlaceTeamId,
      topScorerPlayerIds: insights.topScorerPlayerIds,
      revelationTeamIds: insights.revelationTeamIds,
      surpriseEliminatedTeamIds: insights.surpriseEliminatedTeamIds,
      bestDefenseTeamIds: insights.bestDefenseTeamIds,
    },
    surprises: insights.surprises,
    disappointments: insights.disappointments,
    defenseTable: insights.defenseTable,
  };
}

/**
 * Estado provisional de las categorías "de tabla" (sorpresas, decepciones,
 * valla, goleador) SIN exigir que la final haya terminado. Para transparencia
 * durante el torneo: con la final y el 3er puesto ya definidos, las candidatas
 * de los equipos eliminados son firmes; valla y goleador pueden moverse con
 * los partidos que restan.
 */
export async function resolveProvisionalOutcome(): Promise<ProvisionalOutcome> {
  const insights = await computeInsights(null);

  // Equipos con partidos pendientes (finalistas / 3er puesto): su profundidad
  // todavía puede crecer, así que evaluarlos como sorpresa/decepción sería
  // ruido ("Argentina decepción" con la final por jugarse). Se excluyen de las
  // candidatas provisionales; entran recién en el resolver final.
  const pending = await db
    .select({ homeTeamId: matches.homeTeamId, awayTeamId: matches.awayTeamId })
    .from(matches)
    .where(sql`${matches.status} != 'finished'`);
  const stillPlaying = new Set<number>();
  for (const m of pending) {
    if (m.homeTeamId != null) stillPlaying.add(m.homeTeamId);
    if (m.awayTeamId != null) stillPlaying.add(m.awayTeamId);
  }

  return {
    surprises: insights.surprises.filter((c) => !stillPlaying.has(c.teamId)),
    disappointments: insights.disappointments.filter((c) => !stillPlaying.has(c.teamId)),
    defenseTable: insights.defenseTable,
    topScorerPlayerIds: insights.topScorerPlayerIds,
    maxGoals: insights.maxGoals,
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
