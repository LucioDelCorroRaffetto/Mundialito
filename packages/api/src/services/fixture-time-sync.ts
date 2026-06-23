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

/**
 * FIFA publica nombres de estadio genéricos por reglas de patrocinio
 * ("Philadelphia Stadium", "Atlanta Stadium", …). Los mapeamos al nombre
 * real/branded de cada sede del Mundial 2026, keyado por la ciudad en-GB que
 * devuelve el feed (las 16 ciudades son únicas). Si FIFA reporta una ciudad
 * que no está en el mapa, caemos al nombre genérico del feed.
 */
const REAL_VENUES: Record<string, { venue: string; city: string }> = {
  'Atlanta':                { venue: 'Mercedes-Benz Stadium',   city: 'Atlanta' },
  'Vancouver':              { venue: 'BC Place',                city: 'Vancouver' },
  'Boston':                 { venue: 'Gillette Stadium',        city: 'Boston' },
  'Dallas':                 { venue: 'AT&T Stadium',            city: 'Dallas' },
  'Guadalajara':            { venue: 'Estadio Akron',           city: 'Guadalajara' },
  'Houston':                { venue: 'NRG Stadium',             city: 'Houston' },
  'Kansas City':            { venue: 'Arrowhead Stadium',       city: 'Kansas City' },
  'Los Angeles':            { venue: 'SoFi Stadium',            city: 'Los Angeles' },
  'Mexico City':            { venue: 'Estadio Azteca',          city: 'Ciudad de México' },
  'Miami':                  { venue: 'Hard Rock Stadium',       city: 'Miami' },
  'Monterrey':              { venue: 'Estadio BBVA',            city: 'Monterrey' },
  'New Jersey':             { venue: 'MetLife Stadium',         city: 'New York/NJ' },
  'Philadelphia':           { venue: 'Lincoln Financial Field', city: 'Philadelphia' },
  'San Francisco Bay Area': { venue: "Levi's Stadium",          city: 'San Francisco' },
  'Seattle':                { venue: 'Lumen Field',             city: 'Seattle' },
  'Toronto':                { venue: 'BMO Field',               city: 'Toronto' },
};

export interface FixtureSyncResult {
  updated: number;
  unchanged: number;
  errors: string[];
}

/** Datos por partido que tomamos del calendario FIFA. */
interface FifaFixture {
  date: string;
  venue: string | null;
  city: string | null;
}

/** FIFA publica nombres/ciudades como array localizado; preferimos en-GB. */
function pickLocalized(
  arr: Array<{ Locale?: string; Description?: string }> | undefined | null,
): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const en = arr.find((x) => x?.Locale === 'en-GB') ?? arr[0];
  return en?.Description?.trim() || null;
}

/**
 * Fetches FIFA calendar for [from, to) and returns a map fifaIdMatch → fixture
 * (fecha + sede + ciudad). `from` y `to` se redondean al inicio del día UTC:
 * la API rechaza silenciosamente (responde `null` con HTTP 200) si las horas
 * no son medianoche exacta. Partimos en chunks diarios para garantizar
 * cobertura.
 */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function fetchFifaWindow(from: Date, to: Date): Promise<Map<string, FifaFixture>> {
  const out = new Map<string, FifaFixture>();
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
      if (m?.IdMatch && m?.Date) {
        out.set(m.IdMatch, {
          date: m.Date,
          venue: pickLocalized(m?.Stadium?.Name),
          city: pickLocalized(m?.Stadium?.CityName),
        });
      }
    }
  }
  return out;
}

/**
 * Compara los kickoffs (y la sede/ciudad) en la DB contra el feed para una
 * ventana dada y actualiza los que difieran. No toca scores ni status.
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

  let fifaIndex: Map<string, FifaFixture>;
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
    const fix = fifaIndex.get(m.fifaIdMatch);
    if (!fix) continue;

    const payload: Partial<{
      kickoffUtc: string;
      predictionLockUtc: string;
      venue: string;
      city: string;
    }> = {};

    // Kickoff: actualizamos si difiere más de 1 min.
    const ourTs = new Date(m.kickoffUtc).getTime();
    const fifaTs = new Date(fix.date).getTime();
    if (Math.abs(ourTs - fifaTs) > 60_000) {
      payload.kickoffUtc = fix.date;
      payload.predictionLockUtc = calcPredictionLock(fix.date);
    }

    // Sede/ciudad: el seed traía sedes ficticias que no matchean los fixtures
    // reales ya sincronizados (FRA-IRQ figuraba en Vancouver cuando fue en
    // Filadelfia). Las corregimos contra FIFA, traduciendo el nombre genérico
    // del feed al real/branded vía REAL_VENUES (keyado por ciudad). Solo si
    // tenemos el dato y difiere — nunca pisamos con null (columnas NOT NULL).
    const real = fix.city ? REAL_VENUES[fix.city] : undefined;
    const targetVenue = real?.venue ?? fix.venue;
    const targetCity = real?.city ?? fix.city;
    if (targetVenue && targetVenue !== m.venue) payload.venue = targetVenue;
    if (targetCity && targetCity !== m.city) payload.city = targetCity;

    if (Object.keys(payload).length === 0) {
      result.unchanged++;
      continue;
    }

    try {
      await db.update(matches).set(payload).where(eq(matches.id, m.id));
      result.updated++;
      const parts: string[] = [];
      if (payload.kickoffUtc) parts.push(`kickoff ${m.kickoffUtc} → ${fix.date}`);
      if (payload.venue) parts.push(`venue "${m.venue}" → "${payload.venue}"`);
      if (payload.city) parts.push(`city "${m.city}" → "${payload.city}"`);
      console.log(`[fixture-time-sync] match ${m.id}: ${parts.join('; ')}`);
    } catch (err) {
      result.errors.push(`update match ${m.id}: ${String(err)}`);
    }
  }

  return result;
}
