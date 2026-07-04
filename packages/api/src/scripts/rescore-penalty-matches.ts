/**
 * rescore-penalty-matches.ts
 *
 * Re-puntúa los pronósticos de los cruces definidos por PENALES contra el
 * marcador de reglamento (empate), aplicando la regla nueva: la tanda decide
 * quién AVANZA en el cuadro, pero para la puntuación el partido terminó
 * empatado (criterio casas de apuestas). Ver `scoringResult` en lib/scoring.ts.
 *
 * Por qué un script aparte: estos partidos están `score_locked=1` (el bump al
 * ganador se fija a mano para que el cuadro avance), así que
 * recompute-prediction-points.ts los saltea. Este los toma explícitamente.
 *
 * Idempotente: sólo escribe las filas cuyo puntaje cambió.
 *
 *   Dry-run:  cd packages/api && npx tsx src/scripts/rescore-penalty-matches.ts
 *   Aplicar:  cd packages/api && FIX=1 npx tsx src/scripts/rescore-penalty-matches.ts
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions } from '../db/schema/index.js';
import { calculatePoints, scoringResult } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from '../services/fantasy-scoring-service.js';

const FIX = process.env.FIX === '1';

async function run() {
  const penMatches = await db
    .select({
      id: matches.id,
      matchNumber: matches.matchNumber,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      decidedByPenalties: matches.decidedByPenalties,
    })
    .from(matches)
    .where(and(eq(matches.status, 'finished'), eq(matches.decidedByPenalties, 1)));

  if (penMatches.length === 0) {
    console.log('No hay cruces por penales terminados.');
    return;
  }

  let totalChanged = 0;
  for (const m of penMatches) {
    const reg = scoringResult(m);
    console.log(
      `M${m.matchNumber}: guardado ${m.homeScore}-${m.awayScore} → puntúa como ${reg.homeScore}-${reg.awayScore} (empate de reglamento)`,
    );
    const preds = await db.select().from(predictions).where(eq(predictions.matchId, m.id));
    let changed = 0;
    for (const p of preds) {
      const pts = calculatePoints({ homeScore: p.homeScore, awayScore: p.awayScore }, reg);
      if (p.points === pts) continue;
      changed++;
      console.log(`  pred#${p.id} user=${p.userId} liga=${p.leagueId} ${p.homeScore}-${p.awayScore}: ${p.points} → ${pts}`);
      if (FIX) {
        await db
          .update(predictions)
          .set({ points: pts, updatedAt: sql`(datetime('now'))` })
          .where(eq(predictions.id, p.id));
      }
    }
    console.log(`  ${changed} pronóstico(s) ${FIX ? 'actualizados' : 'a actualizar'} de ${preds.length}.`);
    totalChanged += changed;
  }

  console.log(`\nTotal: ${totalChanged} pronóstico(s) ${FIX ? 'actualizados' : 'a actualizar'} en ${penMatches.length} cruce(s).`);
  if (!FIX) {
    console.log('(dry-run) Volvé a correr con FIX=1 para escribir los cambios.');
  }
  // Los puntos de pronóstico no afectan el fantasy (que va por stats de
  // jugador), pero recomputamos por las dudas si se aplicó algo.
  if (FIX && totalChanged > 0) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      console.error('Fantasy recompute falló (los puntos de pronóstico YA se corrigieron):', err);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
