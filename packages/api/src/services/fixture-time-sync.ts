// Refresca los kickoff times contra el feed oficial FIFA. FIFA suele
// reprogramar partidos cerca del día (cambios de horario, sede). Si
// nuestro `matches.kickoffUtc` queda desactualizado, la app muestra una
// hora que ya pasó (o que no es la real), y los pronósticos pueden
// cerrarse en el momento equivocado.
//
// Esto se llama desde `/sync` con una ventana acotada (typically today +
// tomorrow → 2 requests a FIFA por tick, trivial). El script
// `sync-fixture-times.ts` usa el mismo helper pero con la ventana del
// torneo entero para hacer una sincronización completa cuando hace falta.

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { calcPredictionLock } from '../lib/match-helpers.js';

const FIFA_BASE = 'https://api.fifa.com/api/v3/calendar/matches';
const FIFA_COMPETITION = '17';
const FIFA_SEASON = '285023';

export interface FixtureSyncResult {
  updated: number;
  unchanged: number;
  errors: string[];
}

/**
 * Fetches FIFA calendar for [from, to) and returns a map fifaIdMatch → ISO date.
 * `from` y `to` se redondean al inicio del día UTC: la API rechaza
 * silenciosamente (responde `null` con HTTP 200) si las horas no son
 * medianoche exacta. Partimos en chunks diarios para garantizar cobertura.
 */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function fetchFifaWindow(from: Date, to: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const fromMidnight = startOfUtcDay(from).getTime();
  // Para `to` redondeamos hacia ARRIBA, así una ventana de 48h desde las
  // 16:50 UTC cubre HOY (16:50→00:00) + MAÑANA (00:00→24:00).
  const toMidnight = startOfUtcDay(new Date(to.getTime() + 24 * 3600 * 1000 - 1)).getTime();
  for (let t = fromMidnight; t < toMidnight; t += 24 * 3600 * 1000) {
    const start = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const end = new Date(t + 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const url = `${FIFA_BASE}?idCompetition=${FIFA_COMPETITION}&idSeason=${FIFA_SEASON}&from=${start}&to=${end}&language=en&count=30`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) continue;
    const data: any = await res.json();
    if (!data) continue;
    const ms: any[] = data?.Results ?? [];
    for (const m of ms) {
      if (m?.IdMatch && m?.Date) out.set(m.IdMatch, m.Date);
    }
  }
  return out;
}

/**
 * Compara los kickoffs en la DB contra el feed para una ventana dada y
 * actualiza los que difieran en más de 1 min. No toca scores ni status.
 *
 * @param windowFromMs millis desde now() — default 0 (now).
 * @param windowToMs   millis desde now() — default 48 h.
 */
export async function syncFixtureTimes(
  windowFromMs = 0,
  windowToMs = 48 * 3600 * 1000,
): Promise<FixtureSyncResult> {
  const result: FixtureSyncResult = { updated: 0, unchanged: 0, errors: [] };
  const now = Date.now();
  const from = new Date(now + windowFromMs);
  const to = new Date(now + windowToMs);

  let fifaIndex: Map<string, string>;
  try {
    fifaIndex = await fetchFifaWindow(from, to);
  } catch (err) {
    result.errors.push(`fetch FIFA window: ${String(err)}`);
    return result;
  }

  if (fifaIndex.size === 0) return result;

  const ours = await db.select().from(matches);
  for (const m of ours) {
    if (!m.fifaIdMatch) continue;
    const fifaDate = fifaIndex.get(m.fifaIdMatch);
    if (!fifaDate) continue;
    const ourTs = new Date(m.kickoffUtc).getTime();
    const fifaTs = new Date(fifaDate).getTime();
    if (Math.abs(ourTs - fifaTs) <= 60_000) {
      result.unchanged++;
      continue;
    }
    try {
      await db
        .update(matches)
        .set({ kickoffUtc: fifaDate, predictionLockUtc: calcPredictionLock(fifaDate) })
        .where(eq(matches.id, m.id));
      result.updated++;
      console.log(`[fixture-time-sync] match ${m.id} kickoff updated: ${m.kickoffUtc} → ${fifaDate}`);
    } catch (err) {
      result.errors.push(`update match ${m.id}: ${String(err)}`);
    }
  }

  return result;
}
