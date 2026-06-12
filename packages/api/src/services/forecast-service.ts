/**
 * Servicio de pronósticos / probabilidades — el "Oloráculo" portado.
 *
 * Dos productos:
 *   1. forecastMatch(matchId) — para un partido específico, probabilidades
 *      1X2 + marcador más probable. Funciona en cualquier fase.
 *   2. forecastTournament() — Monte Carlo de la fase de grupos. Reporta
 *      por cada equipo la probabilidad de clasificar a R32 (top 2 del grupo
 *      + 8 mejores terceros, formato WC 48 equipos).
 *
 * Nota: el bracket del knockout NO está modelado en la BD (no hay columna
 * `winner_source_match_id`), así que no podemos simular cruces de R32 en
 * adelante. Cuando el bracket esté seteado podemos extender este service.
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
  status: 'scheduled' | 'live' | 'finished';
  homeScore: number | null;
  awayScore: number | null;
  group: string | null;
  round: string;
}

/** Snapshot de Elo "actual" — parte de los iniciales y aplica todos los
 *  partidos finished del torneo en orden cronológico para reflejar la
 *  forma de cada equipo dentro del Mundial. */
async function currentEloByTeamId(): Promise<Map<number, number>> {
  const teamRows = await db.select({ id: teams.id, code: teams.code }).from(teams);
  const elo = new Map<number, number>();
  for (const t of teamRows) elo.set(t.id, initialEloFor(t.code));

  const finished = await db
    .select()
    .from(matches)
    .where(eq(matches.status, 'finished'));

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

export interface MatchForecast extends MatchProbabilities {
  lambdaHome: number;
  lambdaAway: number;
  homeTeamId: number;
  awayTeamId: number;
}

export async function forecastMatch(matchId: number): Promise<MatchForecast | null> {
  const m = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
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

  return {
    ...probs,
    lambdaHome,
    lambdaAway,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
  };
}

// ─── Monte Carlo de fase de grupos ───────────────────────────────────────

export interface TournamentForecast {
  teamId: number;
  teamCode: string;
  teamName: string;
  teamFlag: string;
  group: string;
  reachR32: number;
  /** Pts esperados al final de la fase de grupos (promedio sobre simulaciones). */
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

export async function forecastTournament(): Promise<TournamentForecast[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;

  const teamRows = await db
    .select({ id: teams.id, code: teams.code, name: teams.name, flag: teams.flag, group: teams.group })
    .from(teams);

  // Solo equipos con grupo definido participan. Filtramos TBD/PO1/PO2 placeholders.
  const realTeams = teamRows.filter((t) => t.group != null && t.code !== 'TBD');

  // Trae solo partidos de fase de grupos con ambos equipos seteados.
  const groupMatches = (await db.select().from(matches)).filter(
    (m) => m.round === 'group' && m.homeTeamId != null && m.awayTeamId != null,
  ) as unknown as MatchRow[];

  const elo = await currentEloByTeamId();

  // Estado por equipo agregado a través de las simulaciones.
  interface Acc {
    sumPoints: number;
    timesTopOfGroup: number;
    timesQualifiedToR32: number;
  }
  const acc = new Map<number, Acc>();
  for (const t of realTeams) acc.set(t.id, { sumPoints: 0, timesTopOfGroup: 0, timesQualifiedToR32: 0 });

  for (let iter = 0; iter < MC_ITERATIONS; iter++) {
    const standings = new Map<number, SimTeam>();
    for (const t of realTeams) standings.set(t.id, { id: t.id, group: t.group!, points: 0, goalsFor: 0, goalsAgainst: 0 });

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

    // Agrupo por letra de grupo y ranqueo.
    const byGroup = new Map<string, SimTeam[]>();
    for (const s of standings.values()) {
      const list = byGroup.get(s.group) ?? [];
      list.push(s);
      byGroup.set(s.group, list);
    }
    const thirds: SimTeam[] = [];
    for (const [, list] of byGroup) {
      list.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const dA = a.goalsFor - a.goalsAgainst;
        const dB = b.goalsFor - b.goalsAgainst;
        if (dB !== dA) return dB - dA;
        return b.goalsFor - a.goalsFor;
      });
      // Top 2 clasifican directo.
      if (list[0]) {
        acc.get(list[0].id)!.timesTopOfGroup += 1;
        acc.get(list[0].id)!.timesQualifiedToR32 += 1;
      }
      if (list[1]) acc.get(list[1].id)!.timesQualifiedToR32 += 1;
      if (list[2]) thirds.push(list[2]);
    }

    // WC 2026: 8 mejores terceros pasan a R32 (12 grupos × 3er puesto = 12 candidatos).
    thirds.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const dA = a.goalsFor - a.goalsAgainst;
      const dB = b.goalsFor - b.goalsAgainst;
      if (dB !== dA) return dB - dA;
      return b.goalsFor - a.goalsFor;
    });
    for (let i = 0; i < Math.min(8, thirds.length); i++) {
      acc.get(thirds[i].id)!.timesQualifiedToR32 += 1;
    }

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
      reachR32: a.timesQualifiedToR32 / MC_ITERATIONS,
    };
  });
  data.sort((a, b) => b.reachR32 - a.reachR32);

  cache = { expiresAt: Date.now() + CACHE_MS, data };
  return data;
}

/** Invalida la cache — útil tras correr un sync que cambia resultados. */
export function invalidateForecastCache() {
  cache = null;
}
