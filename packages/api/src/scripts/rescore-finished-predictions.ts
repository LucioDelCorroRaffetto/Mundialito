/**
 * rescore-finished-predictions.ts
 *
 * Re-puntúa toda predicción con `points = NULL` cuyo partido ya esté
 * `finished` y tenga marcador conocido. Sirve para reparar las predicciones
 * que quedaron sin puntuar — principalmente las copiadas por el carry-over de
 * `join-league` para partidos ya jugados (sync-scores nunca las re-puntúa
 * porque solo lo hace ante un cambio de estado/score y saltea los partidos
 * score-locked). Esas filas se mostraban como "sin resultado" en la lista y
 * sumaban 0 en la tabla de la liga aunque el pronóstico fuera correcto.
 *
 * Es idempotente y seguro: solo toca filas con points NULL de partidos
 * finished; no re-puntúa nada ya puntuado.
 *
 * Dry-run (default):  cd packages/api && npx tsx src/scripts/rescore-finished-predictions.ts
 * Aplicar cambios:    cd packages/api && npx tsx src/scripts/rescore-finished-predictions.ts --apply
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { predictions, matches } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';

const apply = process.argv.includes('--apply');

async function run() {
  // Predicciones sin puntuar de partidos ya finalizados con marcador conocido.
  const rows = await db
    .select({
      id: predictions.id,
      userId: predictions.userId,
      leagueId: predictions.leagueId,
      matchId: predictions.matchId,
      predHome: predictions.homeScore,
      predAway: predictions.awayScore,
      resHome: matches.homeScore,
      resAway: matches.awayScore,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(
      and(
        isNull(predictions.points),
        eq(matches.status, 'finished'),
      ),
    );

  const fixable = rows.filter((r) => r.resHome !== null && r.resAway !== null);

  console.log(
    `\nPredicciones NULL en partidos finished: ${rows.length} ` +
    `(con marcador conocido: ${fixable.length})\n`,
  );

  let updated = 0;
  for (const r of fixable) {
    const pts = calculatePoints(
      { homeScore: r.predHome, awayScore: r.predAway },
      { homeScore: r.resHome!, awayScore: r.resAway! },
    );
    console.log(
      `  pred#${r.id} user=${r.userId} liga=${r.leagueId} match=${r.matchId} ` +
      `pron=${r.predHome}-${r.predAway} res=${r.resHome}-${r.resAway} → +${pts}`,
    );
    if (apply) {
      await db
        .update(predictions)
        .set({ points: pts, updatedAt: sql`(datetime('now'))` })
        .where(eq(predictions.id, r.id));
      updated++;
    }
  }

  if (apply) {
    console.log(`\n✅ Actualizadas ${updated} predicciones.\n`);
  } else {
    console.log(`\n(dry-run) Volvé a correr con --apply para escribir los cambios.\n`);
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
