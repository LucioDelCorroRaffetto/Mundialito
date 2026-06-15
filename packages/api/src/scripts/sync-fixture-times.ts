/**
 * Sincroniza horarios de los partidos contra el feed oficial FIFA. Cubre
 * el caso en que FIFA reprograma un kickoff (cambio de horario, día,
 * sede) entre el sorteo original y el día del partido.
 *
 * - Lee TODOS los matches de la BD que tengan fifaIdMatch.
 * - Pega un GET por match a la página /calendar/match/{id} de la FIFA API
 *   (más confiable que el calendario por rango porque devuelve el match
 *   exacto sin depender de la ventana de fechas).
 * - Si el kickoff difiere por > 1 min, actualiza la BD y recalcula el
 *   predictionLockUtc (kickoff - 5 min). NO toca scores ni status.
 *
 * Reusable: corré cuando aparezca un mismatch entre lo que muestra la app
 * y la realidad. Idempotente. Logea los cambios para revisar.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { calcPredictionLock } from '../lib/match-helpers.js';

async function buildFifaMatchIndex(): Promise<Map<string, string>> {
  // Trae el calendario día por día (entre 2026-06-11 y 2026-07-19) y arma
  // un mapa fifaIdMatch → kickoff ISO. La API rechaza rangos largos así
  // que hacemos una request por día (39 days * ~10 matches = trivial).
  const index = new Map<string, string>();
  const start = new Date('2026-06-11T00:00:00Z');
  const end = new Date('2026-07-20T00:00:00Z');
  for (let t = start.getTime(); t < end.getTime(); t += 24 * 3600 * 1000) {
    // FIFA rechaza ISO con milisegundos ("Invalid parameters"). Saco
    // los millis manualmente: 2026-06-15T00:00:00Z.
    const from = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const to = new Date(t + 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const url = `https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&from=${from}&to=${to}&language=en&count=30`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const data: any = await res.json();
      const ms: any[] = data?.Results ?? [];
      for (const m of ms) {
        if (m?.IdMatch && m?.Date) index.set(m.IdMatch, m.Date);
      }
    } catch (err) {
      console.warn(`[sync-fixture-times] failed day ${from.slice(0, 10)}: ${String(err)}`);
    }
  }
  return index;
}

async function main() {
  console.log('[sync-fixture-times] fetching FIFA calendar...');
  const fifaIndex = await buildFifaMatchIndex();
  console.log(`[sync-fixture-times] FIFA returned ${fifaIndex.size} matches in window`);

  const ours = await db.select().from(matches);
  console.log(`[sync-fixture-times] checking ${ours.length} DB matches`);
  let updated = 0;
  let missing = 0;
  let unchanged = 0;
  for (const m of ours) {
    if (!m.fifaIdMatch) {
      missing++;
      continue;
    }
    const fifaDate = fifaIndex.get(m.fifaIdMatch);
    if (!fifaDate) {
      missing++;
      continue;
    }
    const ourTs = new Date(m.kickoffUtc).getTime();
    const fifaTs = new Date(fifaDate).getTime();
    if (Math.abs(ourTs - fifaTs) <= 60_000) {
      unchanged++;
      continue;
    }
    const newLock = calcPredictionLock(fifaDate);
    console.log(`  match #${m.matchNumber} (id=${m.id}): ${m.kickoffUtc} → ${fifaDate}`);
    await db
      .update(matches)
      .set({ kickoffUtc: fifaDate, predictionLockUtc: newLock })
      .where(eq(matches.id, m.id));
    updated++;
  }
  console.log(`[sync-fixture-times] updated=${updated} unchanged=${unchanged} missing=${missing}`);
}

main().catch((err) => {
  console.error('[sync-fixture-times] fatal:', err);
  process.exit(1);
});
