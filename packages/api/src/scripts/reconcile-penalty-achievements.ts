/**
 * reconcile-penalty-achievements.ts
 *
 * Tras re-puntuar los cruces por penales (rescore-penalty-matches.ts), los
 * logros que dependen de `predictions.points` quedaron potencialmente
 * desalineados: el sistema de logros es SÓLO-otorga (maybeAward inserta, nunca
 * revoca), así que un usuario pudo:
 *   - conservar un logro que ya NO merece (su único caso calificante era el
 *     cruce por penales, que ahora vale distinto), o
 *   - no tener un logro que AHORA sí merece (el evento prediction_scored no se
 *     volvió a disparar al corregir los puntos).
 *
 * Reconciliamos SÓLO los logros basados en puntos que un cruce por penales
 * puede afectar, recomputando su condición desde la historia puntuada real:
 *   exact_score, hot_streak_3, hot_streak_5, triple_exact, survivor, marathon,
 *   weekend_perfect.
 * El resto de los logros no dependen de estos puntos (o son históricos/sticky),
 * así que no se tocan.
 *
 * Alcance: usuarios que pronosticaron algún cruce por penales terminado (los
 * únicos cuyos puntos cambiaron).
 *
 *   Dry-run:  cd packages/api && npx tsx src/scripts/reconcile-penalty-achievements.ts
 *   Aplicar:  cd packages/api && FIX=1 npx tsx src/scripts/reconcile-penalty-achievements.ts
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions, teams, userAchievements } from '../db/schema/index.js';
import { scoringResult } from '../lib/scoring.js';

const FIX = process.env.FIX === '1';

// Logros que un cruce por penales puede mover: los basados en puntos +
// upset_hunter (un empate por penales ya no es un "upset").
const POINT_SLUGS = [
  'exact_score',
  'hot_streak_3',
  'hot_streak_5',
  'triple_exact',
  'survivor',
  'marathon',
  'weekend_perfect',
  'upset_hunter',
] as const;
type PointSlug = (typeof POINT_SLUGS)[number];

interface ScoredRow {
  matchId: number;
  kickoffUtc: string;
  points: number;
}

/** Historia puntuada, deduplicada por partido (espeja loadScoredHistory). */
async function loadHistory(userId: number): Promise<ScoredRow[]> {
  const rows = await db
    .select({
      matchId: predictions.matchId,
      kickoffUtc: matches.kickoffUtc,
      points: predictions.points,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.userId, userId), eq(matches.status, 'finished')));
  const byMatch = new Map<number, ScoredRow>();
  for (const r of rows) {
    if (r.points == null) continue;
    if (!byMatch.has(r.matchId)) byMatch.set(r.matchId, { matchId: r.matchId, kickoffUtc: r.kickoffUtc, points: r.points });
  }
  return [...byMatch.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

/** Días (UTC) con ≥3 partidos, todos finished — para weekend_perfect. */
async function loadDayIndex(): Promise<Map<string, { total: number; allFinished: boolean; ids: number[] }>> {
  const rows = await db
    .select({ id: matches.id, kickoffUtc: matches.kickoffUtc, status: matches.status })
    .from(matches);
  const byDay = new Map<string, { total: number; allFinished: boolean; ids: number[] }>();
  for (const m of rows) {
    const day = m.kickoffUtc.slice(0, 10);
    const cur = byDay.get(day) ?? { total: 0, allFinished: true, ids: [] };
    cur.total += 1;
    cur.ids.push(m.id);
    if (m.status !== 'finished') cur.allFinished = false;
    byDay.set(day, cur);
  }
  return byDay;
}

/**
 * Partidos que fueron un "upset" (ganó el peor rankeado) → signo del resultado.
 * Espeja evaluateUpsetHunter: un cruce por penales cuenta como empate
 * (scoringResult), así que NO es upset.
 */
async function loadUpsets(): Promise<Map<number, number>> {
  const finished = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      decidedByPenalties: matches.decidedByPenalties,
    })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  const teamIds = new Set<number>();
  for (const m of finished) {
    if (m.homeTeamId != null) teamIds.add(m.homeTeamId);
    if (m.awayTeamId != null) teamIds.add(m.awayTeamId);
  }
  const rankRows = teamIds.size
    ? await db.select({ id: teams.id, fifaRank: teams.fifaRank }).from(teams).where(inArray(teams.id, [...teamIds]))
    : [];
  const rankById = new Map<number, number | null>(rankRows.map((r) => [r.id, r.fifaRank]));

  const out = new Map<number, number>();
  for (const m of finished) {
    const reg = scoringResult(m);
    if (reg.homeScore == null || reg.awayScore == null) continue;
    if (m.homeTeamId == null || m.awayTeamId == null) continue;
    if (reg.homeScore === reg.awayScore) continue; // empates (incl. penales) no son upset
    const homeRank = rankById.get(m.homeTeamId) ?? 999;
    const awayRank = rankById.get(m.awayTeamId) ?? 999;
    if (homeRank === awayRank) continue;
    const homeWon = reg.homeScore > reg.awayScore;
    const homeFavoured = homeRank < awayRank;
    if (homeWon !== homeFavoured) out.set(m.id, Math.sign(reg.homeScore - reg.awayScore));
  }
  return out;
}

function qualifyingSet(
  history: ScoredRow[],
  dayIndex: Map<string, { total: number; allFinished: boolean; ids: number[] }>,
  scoredByMatch: Map<number, number>,
): Set<PointSlug> {
  const q = new Set<PointSlug>();

  if (history.some((r) => r.points === 5)) q.add('exact_score');

  // hot streaks
  let streak = 0;
  let maxStreak = 0;
  for (const r of history) {
    if (r.points > 0) { streak++; if (streak > maxStreak) maxStreak = streak; }
    else streak = 0;
  }
  if (maxStreak >= 3) q.add('hot_streak_3');
  if (maxStreak >= 5) q.add('hot_streak_5');

  // triple exact (3 exactos en el mismo día UTC)
  const exactByDay = new Map<string, number>();
  for (const r of history) {
    if (r.points !== 5) continue;
    const d = r.kickoffUtc.slice(0, 10);
    exactByDay.set(d, (exactByDay.get(d) ?? 0) + 1);
  }
  if ([...exactByDay.values()].some((c) => c >= 3)) q.add('triple_exact');

  // survivor (3 ceros seguidos y luego un acierto)
  for (let i = 3; i < history.length; i++) {
    if (history[i].points > 0 && history[i - 1].points === 0 && history[i - 2].points === 0 && history[i - 3].points === 0) {
      q.add('survivor');
      break;
    }
  }

  // marathon (≥5 días distintos con algún acierto)
  const scoringDays = new Set<string>();
  for (const r of history) if (r.points > 0) scoringDays.add(r.kickoffUtc.slice(0, 10));
  if (scoringDays.size >= 5) q.add('marathon');

  // weekend_perfect: algún día con ≥3 partidos, todos finished, y el usuario
  // puntuó >0 en TODOS.
  for (const [, info] of dayIndex) {
    if (info.total < 3 || !info.allFinished) continue;
    let all = true;
    for (const id of info.ids) {
      const pts = scoredByMatch.get(id);
      if (pts == null || pts <= 0) { all = false; break; }
    }
    if (all) { q.add('weekend_perfect'); break; }
  }

  return q;
}

async function run() {
  // Usuarios afectados: pronosticaron algún cruce por penales terminado.
  const penMatchIds = (
    await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.status, 'finished'), eq(matches.decidedByPenalties, 1)))
  ).map((m) => m.id);
  if (penMatchIds.length === 0) {
    console.log('No hay cruces por penales terminados.');
    return;
  }

  const affected = await db
    .selectDistinct({ userId: predictions.userId })
    .from(predictions)
    .where(inArray(predictions.matchId, penMatchIds));
  const userIds = affected.map((r) => r.userId);
  console.log(`Usuarios afectados (pronosticaron un cruce por penales): ${userIds.length}\n`);

  const dayIndex = await loadDayIndex();
  const upsets = await loadUpsets(); // matchId → signo del resultado (home-away)

  let grants = 0;
  let revokes = 0;
  for (const userId of userIds) {
    const history = await loadHistory(userId);
    const scoredByMatch = new Map(history.map((r) => [r.matchId, r.points]));
    const qualifies = qualifyingSet(history, dayIndex, scoredByMatch);

    // upset_hunter: ≥3 upsets con el ganador bien predicho (empates por penales
    // ya no son upsets, ver loadUpsets).
    if (upsets.size > 0) {
      const userPreds = await db
        .select({ matchId: predictions.matchId, homeScore: predictions.homeScore, awayScore: predictions.awayScore })
        .from(predictions)
        .where(and(eq(predictions.userId, userId), inArray(predictions.matchId, [...upsets.keys()])));
      const byMatch = new Map<number, { homeScore: number; awayScore: number }>();
      for (const p of userPreds) byMatch.set(p.matchId, p);
      let correct = 0;
      for (const [matchId, resultSign] of upsets) {
        const pred = byMatch.get(matchId);
        if (!pred) continue;
        if (Math.sign(pred.homeScore - pred.awayScore) === resultSign) correct++;
      }
      if (correct >= 3) qualifies.add('upset_hunter');
    }

    const held = new Set(
      (
        await db
          .select({ slug: userAchievements.achievementSlug })
          .from(userAchievements)
          .where(and(eq(userAchievements.userId, userId), inArray(userAchievements.achievementSlug, [...POINT_SLUGS])))
      ).map((r) => r.slug as PointSlug),
    );

    const toGrant = [...qualifies].filter((s) => !held.has(s));
    const toRevoke = [...held].filter((s) => !qualifies.has(s));

    for (const slug of toGrant) {
      console.log(`  GRANT  user=${userId} ${slug}`);
      grants++;
      if (FIX) {
        await db.insert(userAchievements).values({ userId, achievementSlug: slug }).onConflictDoNothing();
      }
    }
    for (const slug of toRevoke) {
      console.log(`  REVOKE user=${userId} ${slug}`);
      revokes++;
      if (FIX) {
        await db
          .delete(userAchievements)
          .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementSlug, slug)));
      }
    }
  }

  console.log(`\nTotal: ${grants} a otorgar, ${revokes} a revocar (${userIds.length} usuarios).`);
  if (!FIX) console.log('(dry-run) Volvé a correr con FIX=1 para escribir los cambios.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
