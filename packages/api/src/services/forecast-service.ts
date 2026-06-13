/**
 * Servicio de pronósticos / probabilidades — el "Oloráculo" portado.
 *
 * Dos productos:
 *   1. forecastMatch(matchId)     — probabilidades 1X2 + marcador más probable.
 *   2. forecastTournament()       — Monte Carlo completo (fase de grupos +
 *      bracket de knockout hasta la Final). Reporta por equipo la probabilidad
 *      de llegar a cada ronda.
 *
 * Bracket WC 2026 (modelo):
 *   32 clasificados = 12 primeros + 12 segundos + 8 mejores terceros.
 *   Seeding: primeros → semillas 1-12 (por puntos/DG), segundos → 13-24,
 *   terceros → 25-32. Parejas R32: semilla 1 vs 32, 2 vs 31, … 16 vs 17.
 *   En cada partido de knockout, si hay empate al 90' → penales (50/50).
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, teams } from '../db/schema/index.js';
import { initialEloFor, updateRatings, K_WORLDCUP } from '../lib/elo.js';
import { lambdasFromElo } from '../lib/goal-model.js';
import {
  scoreDistribution,
  probabilitiesFromGrid,
  samplePoisson,
  type MatchProbabilities,
} from '../lib/poisson.js';

const MC_ITERATIONS = 5000;

interface MatchRow {
  id: number;
  matchNumber: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  group: string | null;
  round: string;
}

// ─── Elo snapshot ─────────────────────────────────────────────────────────────

async function currentEloByTeamId(): Promise<Map<number, number>> {
  const teamRows = await db.select({ id: teams.id, code: teams.code }).from(teams);
  const elo = new Map<number, number>();
  for (const t of teamRows) elo.set(t.id, initialEloFor(t.code));

  const finished = await db.select().from(matches).where(eq(matches.status, 'finished'));
  finished.sort((a, b) => a.matchNumber - b.matchNumber);
  for (const m of finished) {
    if (m.homeTeamId == null || m.awayTeamId == null) continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    const h = elo.get(m.homeTeamId)!;
    const a = elo.get(m.awayTeamId)!;
    const result: 0 | 0.5 | 1 =
      m.homeScore > m.awayScore ? 1 : m.homeScore < m.awayScore ? 0 : 0.5;
    const { newA, newB } = updateRatings(h, a, result, K_WORLDCUP);
    elo.set(m.homeTeamId, newA);
    elo.set(m.awayTeamId, newB);
  }
  return elo;
}

// ─── forecastMatch ────────────────────────────────────────────────────────────

export interface MatchForecast extends MatchProbabilities {
  lambdaHome: number;
  lambdaAway: number;
  homeTeamId: number;
  awayTeamId: number;
}

export async function forecastMatch(matchId: number): Promise<MatchForecast | null> {
  const m = await db
    .select({ id: matches.id, homeTeamId: matches.homeTeamId, awayTeamId: matches.awayTeamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  if (!m || m.homeTeamId == null || m.awayTeamId == null) return null;

  const elo = await currentEloByTeamId();
  const eloHome = elo.get(m.homeTeamId) ?? 1500;
  const eloAway = elo.get(m.awayTeamId) ?? 1500;
  const { lambdaHome, lambdaAway } = lambdasFromElo(eloHome, eloAway);
  const grid = scoreDistribution(lambdaHome, lambdaAway);
  const probs = probabilitiesFromGrid(grid);

  return { ...probs, lambdaHome, lambdaAway, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId };
}

// ─── Monte Carlo completo ─────────────────────────────────────────────────────

export interface TournamentForecast {
  teamId: number;
  teamCode: string;
  teamName: string;
  teamFlag: string;
  group: string;
  /** Probabilidad de clasificar a R32 (top 2 del grupo + 8 mejores terceros). */
  reachR32: number;
  /** Probabilidad de pasar a R16. */
  reachR16: number;
  /** Probabilidad de llegar a QF. */
  reachQF: number;
  /** Probabilidad de llegar a SF. */
  reachSF: number;
  /** Probabilidad de llegar a la Final. */
  reachFinal: number;
  /** Probabilidad de ganar el torneo. */
  winTournament: number;
  /** Pts esperados al final de la fase de grupos. */
  expectedPoints: number;
  /** Probabilidad de salir primero del grupo. */
  topOfGroup: number;
}

interface CacheEntry {
  expiresAt: number;
  data: TournamentForecast[];
}

let cache: CacheEntry | null = null;
const CACHE_MS = 60_000;

interface SimTeam {
  id: number;
  group: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}

function sortByPerformance(list: SimTeam[]): SimTeam[] {
  return [...list].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const dA = a.goalsFor - a.goalsAgainst;
    const dB = b.goalsFor - b.goalsAgainst;
    if (dB !== dA) return dB - dA;
    return b.goalsFor - a.goalsFor;
  });
}

/** Simula un partido de knockout: devuelve el id del ganador.
 *  Empate al 90' → penales (Bernoulli 0.5). */
function simulateKnockout(teamAId: number, teamBId: number, elo: Map<number, number>): number {
  const eloA = elo.get(teamAId) ?? 1500;
  const eloB = elo.get(teamBId) ?? 1500;
  const { lambdaHome, lambdaAway } = lambdasFromElo(eloA, eloB);
  const gA = samplePoisson(lambdaHome);
  const gB = samplePoisson(lambdaAway);
  if (gA > gB) return teamAId;
  if (gB > gA) return teamBId;
  return Math.random() < 0.5 ? teamAId : teamBId;
}

export async function forecastTournament(): Promise<TournamentForecast[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;

  const teamRows = await db
    .select({ id: teams.id, code: teams.code, name: teams.name, flag: teams.flag, group: teams.group })
    .from(teams);

  const realTeams = teamRows.filter((t) => t.group != null && t.code !== 'TBD');

  const groupMatches = (await db.select().from(matches)).filter(
    (m) => m.round === 'group' && m.homeTeamId != null && m.awayTeamId != null,
  ) as unknown as MatchRow[];

  const elo = await currentEloByTeamId();

  interface Acc {
    sumPoints: number;
    timesTopOfGroup: number;
    timesR32: number;
    timesR16: number;
    timesQF: number;
    timesSF: number;
    timesFinal: number;
    timesWon: number;
  }
  const acc = new Map<number, Acc>();
  for (const t of realTeams) {
    acc.set(t.id, {
      sumPoints: 0, timesTopOfGroup: 0,
      timesR32: 0, timesR16: 0, timesQF: 0, timesSF: 0, timesFinal: 0, timesWon: 0,
    });
  }

  for (let iter = 0; iter < MC_ITERATIONS; iter++) {
    // ── Fase de grupos ──────────────────────────────────────────────────────
    const standings = new Map<number, SimTeam>();
    for (const t of realTeams) {
      standings.set(t.id, { id: t.id, group: t.group!, points: 0, goalsFor: 0, goalsAgainst: 0 });
    }

    for (const m of groupMatches) {
      let gH: number, gA: number;
      if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) {
        gH = m.homeScore;
        gA = m.awayScore;
      } else {
        const eloH = elo.get(m.homeTeamId!) ?? 1500;
        const eloA = elo.get(m.awayTeamId!) ?? 1500;
        const { lambdaHome, lambdaAway } = lambdasFromElo(eloH, eloA);
        gH = samplePoisson(lambdaHome);
        gA = samplePoisson(lambdaAway);
      }
      const home = standings.get(m.homeTeamId!);
      const away = standings.get(m.awayTeamId!);
      if (!home || !away) continue;
      home.goalsFor += gH; home.goalsAgainst += gA;
      away.goalsFor += gA; away.goalsAgainst += gH;
      if (gH > gA) home.points += 3;
      else if (gH < gA) away.points += 3;
      else { home.points += 1; away.points += 1; }
    }

    // ── Clasificados ────────────────────────────────────────────────────────
    const byGroup = new Map<string, SimTeam[]>();
    for (const s of standings.values()) {
      const list = byGroup.get(s.group) ?? [];
      list.push(s);
      byGroup.set(s.group, list);
    }

    const firsts: SimTeam[] = [];
    const seconds: SimTeam[] = [];
    const allThirds: SimTeam[] = [];

    for (const [, list] of byGroup) {
      const sorted = sortByPerformance(list);
      if (sorted[0]) { firsts.push(sorted[0]); acc.get(sorted[0].id)!.timesTopOfGroup++; }
      if (sorted[1]) seconds.push(sorted[1]);
      if (sorted[2]) allThirds.push(sorted[2]);
    }

    const best8Thirds = sortByPerformance(allThirds).slice(0, 8);

    // ── Seeding bracket R32 ─────────────────────────────────────────────────
    // Semillas 1-12: primeros ordenados por rendimiento, 13-24: segundos, 25-32: mejores terceros.
    // Parejas: semilla i vs semilla (33-i) → 1v32, 2v31, …, 16v17.
    const seeds: number[] = [
      ...sortByPerformance(firsts).map((t) => t.id),
      ...sortByPerformance(seconds).map((t) => t.id),
      ...best8Thirds.map((t) => t.id),
    ]; // length = 32

    for (const id of seeds) acc.get(id)!.timesR32++;

    // ── Bracket de knockout ─────────────────────────────────────────────────
    // Rondas: seeds(32) → R16(16) → QF(8) → SF(4) → finalists(2) → winner(1)
    // Pares dentro de cada ronda: (0, n-1), (1, n-2), ..., bracket "abierto".
    let bracket = seeds;

    for (const round of ['r16', 'qf', 'sf'] as const) {
      const nextBracket: number[] = [];
      for (let i = 0; i < bracket.length / 2; i++) {
        nextBracket.push(simulateKnockout(bracket[i], bracket[bracket.length - 1 - i], elo));
      }
      bracket = nextBracket;
      for (const id of bracket) {
        const a = acc.get(id);
        if (!a) continue;
        if (round === 'r16') a.timesR16++;
        else if (round === 'qf') a.timesQF++;
        else if (round === 'sf') a.timesSF++;
      }
    }

    // Ahora bracket tiene 2 finalistas → ambos suman timesFinal
    // Simulamos la final para obtener el campeón
    for (const id of bracket) acc.get(id)!.timesFinal++;
    const champion = simulateKnockout(bracket[0], bracket[1], elo);
    acc.get(champion)!.timesWon++;

    for (const s of standings.values()) {
      acc.get(s.id)!.sumPoints += s.points;
    }
  }

  const data: TournamentForecast[] = realTeams.map((t) => {
    const a = acc.get(t.id)!;
    return {
      teamId: t.id,
      teamCode: t.code,
      teamName: t.name,
      teamFlag: t.flag,
      group: t.group!,
      expectedPoints: a.sumPoints / MC_ITERATIONS,
      topOfGroup: a.timesTopOfGroup / MC_ITERATIONS,
      reachR32: a.timesR32 / MC_ITERATIONS,
      reachR16: a.timesR16 / MC_ITERATIONS,
      reachQF: a.timesQF / MC_ITERATIONS,
      reachSF: a.timesSF / MC_ITERATIONS,
      reachFinal: a.timesFinal / MC_ITERATIONS,
      winTournament: a.timesWon / MC_ITERATIONS,
    };
  });
  data.sort((a, b) => b.winTournament - a.winTournament);

  cache = { expiresAt: Date.now() + CACHE_MS, data };
  return data;
}

/** Invalida la cache — útil tras correr un sync que cambia resultados. */
export function invalidateForecastCache() {
  cache = null;
}
