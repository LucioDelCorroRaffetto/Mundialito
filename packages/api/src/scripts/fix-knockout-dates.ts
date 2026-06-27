/**
 * fix-knockout-dates.ts
 *
 * Corrige los kickoff times de los 32 partidos de la fase eliminatoria
 * (matchNumber 73-104) contra el calendario oficial de la FIFA.
 *
 * Problema original:
 *   El seed generaba las fechas de knockout con intervalos fijos (12h/24h)
 *   a partir de fechas aproximadas (R32 desde el 4 de julio). El calendario
 *   real de la FIFA arranca la R32 el 28 de junio, y el orden cronológico
 *   NO coincide con el número de partido del bracket. Resultado: todas las
 *   fechas de la fase final estaban corridas varios días.
 *
 * Solución:
 *   La API de la FIFA expone `MatchNumber` en cada partido, y ese número
 *   coincide exactamente con nuestro `matches.matchNumber` (73-104). Mapeamos
 *   1:1 por número de partido — sin posicional ni matching por equipo, así que
 *   funciona aunque los equipos sean TBD (cruces todavía sin definir).
 *
 * Idempotente. Re-ejecutable en cualquier momento (también después de que se
 * definan los cruces, por si la FIFA reprograma horarios).
 *
 * Run:
 *   pnpm --filter @mundialito/api exec tsx src/scripts/fix-knockout-dates.ts
 *   DRY_RUN=1 pnpm --filter @mundialito/api exec tsx src/scripts/fix-knockout-dates.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { initDb } from '../db/client.js';
import { matches } from '../db/schema/index.js';
import { eq, gt } from 'drizzle-orm';
import { calcPredictionLock } from '../lib/match-helpers.js';

const FIFA_BASE = 'https://api.fifa.com/api/v3/calendar/matches';
const FIFA_COMPETITION = '17';
const FIFA_SEASON = '285023';
const DRY_RUN = process.env.DRY_RUN === '1';

interface FifaFixture {
  matchNumber: number;
  IdMatch: string;
  IdStage: string;
  Date: string;
}

async function main(): Promise<void> {
  console.log(`[fix-knockout-dates] dryRun=${DRY_RUN}`);
  await initDb();

  // 1. Una sola request al calendario completo del torneo. La FIFA devuelve
  //    `MatchNumber` por partido, que es la misma numeración que usamos en DB.
  const url =
    `${FIFA_BASE}?idCompetition=${FIFA_COMPETITION}&idSeason=${FIFA_SEASON}` +
    `&from=2026-06-11&to=2026-07-22&count=200&language=en`;

  console.log('Fetching FIFA full calendar...');
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    console.error(`FIFA returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data: any = await res.json();
  const results: any[] = data?.Results ?? [];

  // Indexar knockout (matchNumber > 72) por número, deduplicando por IdMatch.
  const seen = new Set<string>();
  const fifaByNumber = new Map<number, FifaFixture>();
  for (const m of results) {
    if (!m?.IdMatch || !m?.Date || typeof m?.MatchNumber !== 'number') continue;
    if (seen.has(m.IdMatch)) continue;
    seen.add(m.IdMatch);
    if (m.MatchNumber > 72) {
      fifaByNumber.set(m.MatchNumber, {
        matchNumber: m.MatchNumber,
        IdMatch: m.IdMatch,
        IdStage: m.IdStage ?? '',
        Date: m.Date,
      });
    }
  }
  console.log(`  Got ${fifaByNumber.size} knockout matches from FIFA.`);

  if (fifaByNumber.size < 32) {
    console.error(
      `Expected 32 knockout matches, got ${fifaByNumber.size}. Aborting to avoid partial/wrong update.`,
    );
    process.exit(1);
  }

  // 2. Nuestros partidos de knockout.
  const ourMatches = await db.select().from(matches).where(gt(matches.matchNumber, 72));

  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const m of ourMatches) {
    const fifa = fifaByNumber.get(m.matchNumber);
    if (!fifa) {
      console.warn(`  · match=${m.matchNumber} (${m.round}) — no FIFA match with that number`);
      missing++;
      continue;
    }

    const ourTs = new Date(m.kickoffUtc).getTime();
    const fifaTs = new Date(fifa.Date).getTime();
    const sameTime = Math.abs(ourTs - fifaTs) <= 60_000;
    const sameId = m.fifaIdMatch === fifa.IdMatch;

    if (sameTime && sameId) {
      unchanged++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] match=${m.matchNumber} (${m.round}) ${m.kickoffUtc} → ${fifa.Date}  IdMatch=${fifa.IdMatch}`);
      updated++;
      continue;
    }

    await db
      .update(matches)
      .set({
        kickoffUtc: fifa.Date,
        predictionLockUtc: calcPredictionLock(fifa.Date),
        fifaIdMatch: fifa.IdMatch,
        fifaIdStage: fifa.IdStage,
      })
      .where(eq(matches.id, m.id));

    console.log(`  match=${m.matchNumber} (${m.round}) ${m.kickoffUtc} → ${fifa.Date}  IdMatch=${fifa.IdMatch}`);
    updated++;
  }

  console.log(`\n[fix-knockout-dates] updated=${updated} unchanged=${unchanged} missing=${missing}`);
  if (DRY_RUN) console.log('  (DRY_RUN — no rows written)');
}

main().catch((err) => {
  console.error('[fix-knockout-dates] fatal:', err);
  process.exit(1);
});
