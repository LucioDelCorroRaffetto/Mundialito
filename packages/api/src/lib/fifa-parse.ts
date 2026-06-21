// Pure parsing helpers for the FIFA timeline feed. Extracted out of
// services/sync-fifa-stats.ts so they can be unit-tested in isolation
// WITHOUT pulling in the DB layer (drizzle/libsql) that the service imports.
// No side effects, no I/O — only string/array logic.

export interface FifaLocaleString {
  Locale: string;
  Description: string;
}

// FIFA Type 26 = "The final whistle sounds." Señal de fin de partido.
export const FINAL_WHISTLE_TYPE = 26;

export function hasFinalWhistle(
  events: { Type: number; EventDescription?: FifaLocaleString[] }[],
): boolean {
  return events.some(
    (ev) =>
      ev.Type === FINAL_WHISTLE_TYPE ||
      (ev.EventDescription?.[0]?.Description ?? '').toLowerCase().includes('final whistle'),
  );
}

/**
 * Levenshtein-1 truncado: devuelve true sii la distancia es 0 o 1.
 * Mucho más barato que computar la matriz completa cuando solo querés
 * saber si toleramos 1 typo (substitution/insertion/deletion) entre
 * transliteraciones del estilo "Mohebbi" vs "Mohebi", "Solskjær" vs
 * "Solskjaer". No usar para nombres de < 5 chars — la tolerancia ahí
 * mata el matcher (riesgo de "Mota" matchee "Sota").
 */
export function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  // Recorré simultáneamente, permití a lo sumo 1 "tropiezo".
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diffs > 1) return false;
    if (la === lb) { i++; j++; }     // substitution
    else if (la > lb) i++;           // deletion en a
    else j++;                        // insertion en a / deletion en b
  }
  if (i < la || j < lb) diffs++;     // sobra una letra al final
  return diffs <= 1;
}

export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`´ʹ]/g, '')
    .replace(/[.,\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a player surname (+ optional country) from a FIFA event description.
 * Supports the two formats FIFA emits:
 *   "FODEN (England) scores!!"                  → surname=FODEN, country=England
 *   "GANA (Senegal) is booked by the referee."  → surname=GANA,  country=Senegal
 *   "Assisted by KANE."                         → surname=KANE,  country=null
 *   "ROBERTS (in) comes off the bench to ..."   → surname=ROBERTS, country=null
 *
 * When country is null the caller must resolve it from `IdTeam` on the event
 * (which FIFA always populates for events that involve a player).
 */
export function parseDescription(
  desc: string | undefined,
): { surname: string; country: string | null } | null {
  if (!desc) return null;
  // Pattern A: "SURNAME (Country) ..." — country present.
  const a = desc.match(/^([A-ZÁÉÍÓÚÑÜÇA-zÀ-ÿ' .-]+?)\s*\(([^)]+)\)/);
  if (a) {
    const country = a[2].trim();
    // Reject parenthetical text that is clearly NOT a country, e.g. "(in)",
    // "(out)", "(yellow card)".
    const looksLikeCountry = country.length >= 3 && !/^(in|out|penalty|red card|yellow card)$/i.test(country);
    return { surname: a[1].trim(), country: looksLikeCountry ? country : null };
  }
  // Pattern B: "Assisted by SURNAME." — country comes from IdTeam.
  const b = desc.match(/^Assisted by\s+([A-ZÁÉÍÓÚÑÜÇA-zÀ-ÿ' .-]+?)\.?\s*$/);
  if (b) return { surname: b[1].trim(), country: null };
  return null;
}
