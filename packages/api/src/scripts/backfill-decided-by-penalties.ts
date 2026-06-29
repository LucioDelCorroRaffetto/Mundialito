/**
 * Backfill de `matches.decided_by_penalties` para los cruces que YA terminaron
 * por penales antes de que existiera la columna. Señal: el partido está
 * `finished` y tiene al menos un evento de la tanda (match_events.period = 5).
 *
 * Idempotente: solo escribe las filas que todavía están en 0. Correr una vez
 * después de aplicar el schema (`yarn workspace api db:push`):
 *   yarn workspace api tsx src/scripts/backfill-decided-by-penalties.ts
 */
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, matchEvents } from '../db/schema/index.js';

async function main() {
  // Partidos finished con algún evento de período 5 (tanda de penales).
  const shootoutMatchIds = await db
    .selectDistinct({ matchId: matchEvents.matchId })
    .from(matchEvents)
    .innerJoin(matches, eq(matchEvents.matchId, matches.id))
    .where(and(eq(matches.status, 'finished'), eq(matchEvents.period, 5)));

  const ids = shootoutMatchIds.map((r) => r.matchId);
  if (ids.length === 0) {
    console.log('No hay partidos terminados por penales para marcar.');
    return;
  }

  const res = await db
    .update(matches)
    .set({ decidedByPenalties: 1 })
    .where(and(inArray(matches.id, ids), eq(matches.decidedByPenalties, 0)))
    .returning({ id: matches.id, matchNumber: matches.matchNumber });

  console.log(
    `Candidatos por penales: ${ids.length}. Marcados ahora: ${res.length}` +
      (res.length ? ` (match_number: ${res.map((r) => r.matchNumber).join(', ')})` : ' (ya estaban marcados).'),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
