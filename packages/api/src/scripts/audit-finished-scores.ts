/**
 * Audita los marcadores guardados de partidos FINISHED contra football-data
 * con la lógica corregida de resolveFinalScore (Gotcha #17: fullTime es el
 * agregado total; el código viejo prefería el parcial de extraTime, así el
 * M100 ARG-SUI 3-1 AET quedó guardado 2-0 y puntuado contra eso).
 *
 * Con FIX=1, para cada partido divergente:
 *   - corrige matches.home_score / away_score / decided_by_penalties
 *   - re-puntúa TODAS las predicciones del partido (todas las ligas, incluida
 *     la personal) con la misma lógica que finalize-match (scoringResult
 *     de-bumpea penales antes de calculatePoints).
 *
 * NO toca partidos score_locked (override manual del admin, p.ej. M39) ni
 * placeholders TBD (Gotcha #16 — de esos es dueño FIFA-live).
 *
 *   npx tsx src/scripts/audit-finished-scores.ts        # dry-run
 *   FIX=1 npx tsx src/scripts/audit-finished-scores.ts  # aplica
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions, teams } from '../db/schema/index.js';
import { calculatePoints, scoringResult } from '../lib/scoring.js';
import { resolveFinalScore, isPlaceholderMatch, normalizeEspnCode, type FdScoreLike } from '../lib/score-sync.js';

const FIX = process.env.FIX === '1';

interface FdMatch {
  utcDate: string;
  status: string;
  score: FdScoreLike;
  homeTeam: { tla: string | null };
  awayTeam: { tla: string | null };
}

const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY is not set');

const resp = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
  headers: { 'X-Auth-Token': apiKey },
});
if (!resp.ok) throw new Error(`football-data ${resp.status}: ${await resp.text()}`);
const fdMatches = ((await resp.json()) as { matches: FdMatch[] }).matches ?? [];
const fdFinished = fdMatches.filter((m) => m.status === 'FINISHED');
console.log(`football-data FINISHED: ${fdFinished.length}`);

const ourRaw = await db
  .select({
    id: matches.id,
    matchNumber: matches.matchNumber,
    kickoffUtc: matches.kickoffUtc,
    status: matches.status,
    homeScore: matches.homeScore,
    awayScore: matches.awayScore,
    decidedByPenalties: matches.decidedByPenalties,
    scoreLocked: matches.scoreLocked,
    homeTeamId: matches.homeTeamId,
    awayTeamId: matches.awayTeamId,
  })
  .from(matches)
  .where(eq(matches.status, 'finished'));
const allTeams = await db.select({ id: teams.id, code: teams.code }).from(teams);
const codeById = new Map(allTeams.map((t) => [t.id, t.code.toUpperCase()]));
const ours = ourRaw.map((m) => ({
  ...m,
  homeTeamCode: m.homeTeamId != null ? (codeById.get(m.homeTeamId) ?? '') : '',
  awayTeamCode: m.awayTeamId != null ? (codeById.get(m.awayTeamId) ?? '') : '',
}));

// Matching estricto (mismo criterio que sync-scores.findMatch pass 1):
// kickoff ±10 min + ambos TLA. Sin pass loose — para una auditoría
// correctiva no queremos jamás un match ambiguo.
const TEN_MIN = 10 * 60 * 1000;
function findOurs(fd: FdMatch) {
  const t = new Date(fd.utcDate).getTime();
  // FD comparte la divergencia RSA→ZAF de ESPN; el mapa cubre ambos feeds.
  const h = normalizeEspnCode(fd.homeTeam.tla);
  const a = normalizeEspnCode(fd.awayTeam.tla);
  if (!h || !a) return undefined;
  return ours.find(
    (m) =>
      Math.abs(new Date(m.kickoffUtc).getTime() - t) <= TEN_MIN &&
      ((m.homeTeamCode === h && m.awayTeamCode === a) ||
        (m.homeTeamCode === a && m.awayTeamCode === h)),
  );
}

let diffs = 0;
let skippedLocked = 0;
let unmatched = 0;
for (const fd of fdFinished) {
  const our = findOurs(fd);
  if (!our) {
    unmatched++;
    console.log(
      `  (sin match) ${fd.homeTeam.tla}-${fd.awayTeam.tla} ${fd.utcDate} ` +
      `fullTime ${fd.score.fullTime.home}-${fd.score.fullTime.away}`,
    );
    continue;
  }
  if (isPlaceholderMatch(our)) continue;

  // Si FD lista los equipos al revés que nosotros, swapear el score resuelto
  // (mismo criterio de identidad que resolveCompetitors, Gotcha #13).
  const flipped = our.homeTeamCode === normalizeEspnCode(fd.awayTeam.tla);
  const r = resolveFinalScore(fd.score);
  // (el bump +1 al ganador de penales ya viene aplicado dentro de r.home/r.away,
  // así que el swap lo traslada al lado correcto)
  const wantHome = flipped ? r.away : r.home;
  const wantAway = flipped ? r.home : r.away;
  const wantPens = r.decidedByPenalties ? 1 : 0;

  if (wantHome == null || wantAway == null) continue;
  const same =
    our.homeScore === wantHome &&
    our.awayScore === wantAway &&
    (our.decidedByPenalties ?? 0) === wantPens;
  if (same) continue;

  if (our.scoreLocked === 1) {
    skippedLocked++;
    console.log(
      `  M${our.matchNumber} ${our.homeTeamCode}-${our.awayTeamCode}: DB ` +
      `${our.homeScore}-${our.awayScore} vs feed ${wantHome}-${wantAway} — SKIP (score_locked)`,
    );
    continue;
  }

  diffs++;
  console.log(
    `  M${our.matchNumber} ${our.homeTeamCode}-${our.awayTeamCode}: ` +
    `${our.homeScore}-${our.awayScore} (pens=${our.decidedByPenalties ?? 0}) → ` +
    `${wantHome}-${wantAway} (pens=${wantPens})`,
  );

  if (!FIX) continue;

  await db
    .update(matches)
    .set({
      homeScore: wantHome,
      awayScore: wantAway,
      decidedByPenalties: wantPens,
    })
    .where(eq(matches.id, our.id));

  const scored = scoringResult({
    homeScore: wantHome,
    awayScore: wantAway,
    decidedByPenalties: wantPens,
  });
  const preds = await db
    .select({ id: predictions.id, homeScore: predictions.homeScore, awayScore: predictions.awayScore, points: predictions.points })
    .from(predictions)
    .where(eq(predictions.matchId, our.id));
  let rescored = 0;
  for (const p of preds) {
    const pts = calculatePoints({ homeScore: p.homeScore, awayScore: p.awayScore }, scored);
    if (pts === p.points) continue;
    await db
      .update(predictions)
      .set({ points: pts, updatedAt: sql`(datetime('now'))` })
      .where(eq(predictions.id, p.id));
    rescored++;
  }
  console.log(`    → score corregido, ${rescored}/${preds.length} predicciones re-puntuadas`);
}

console.log(
  `\nDivergentes: ${diffs} | score_locked salteados: ${skippedLocked} | sin match en DB: ${unmatched}`,
);
if (!FIX && diffs > 0) {
  console.log('(dry-run) Para reparar: FIX=1 npx tsx src/scripts/audit-finished-scores.ts');
}
process.exit(0);
