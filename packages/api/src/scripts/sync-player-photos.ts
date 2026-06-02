/**
 * Fetches a thumbnail photo for every player from Wikipedia (free, no API key).
 *
 * Strategy: search the player's name on Wikipedia + verify the resulting
 * page actually belongs to the right national team before committing the
 * thumbnail. The verification step is what differentiates "Cristian
 * Romero, Argentina defender" (correct) from "Cristián Romero,
 * Paraguayan midfielder" (homonym).
 *
 * Verification works by inspecting the page's categories. Wikipedia
 * categorises every international footballer with things like
 * "Argentina men's international footballers" or
 * "Argentine men's footballers". If neither the country name nor its
 * demonym appears in any category, the page is rejected and we try the
 * next search hit / language pass. Only verified pages get their
 * thumbnail saved.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/sync-player-photos.ts
 *   pnpm --filter @mundialito/api exec tsx src/scripts/sync-player-photos.ts -- --force
 *
 * Flags:
 *   --force            re-sync every player (not just those missing a photo)
 *   --only=CODE[,…]    restrict to certain team codes
 *   WIKIPEDIA_LIMIT=N  cap players per run (default 9999)
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { players, teams } from '../db/schema/index.js';
import { eq, isNull, and, inArray } from 'drizzle-orm';

const LIMIT = Number(process.env.WIKIPEDIA_LIMIT ?? 9999);
const FORCE = process.argv.includes('--force');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;

// Polite User-Agent — Wikipedia asks for one identifying the app + contact.
const HEADERS = {
  'User-Agent': 'MundialitoApp/1.0 (https://mundialito-pi.vercel.app; delcorroraffetto@gmail.com)',
  Accept: 'application/json',
};

/**
 * Country → English country name + adjective(s) used in Wikipedia category
 * strings. Both are checked because some categories use the noun
 * ("Argentina men's footballers") and others the demonym ("Argentine
 * international footballers"). At least one match in the page's categories
 * is required to accept a candidate.
 */
const COUNTRY_HINTS_EN: Record<string, string[]> = {
  Argentina: ['Argentina', 'Argentine'],
  Brasil: ['Brazil', 'Brazilian'],
  Uruguay: ['Uruguay', 'Uruguayan'],
  Colombia: ['Colombia', 'Colombian'],
  Paraguay: ['Paraguay', 'Paraguayan'],
  Ecuador: ['Ecuador', 'Ecuadorian'],
  México: ['Mexico', 'Mexican'],
  'Estados Unidos': ['United States', 'American', 'U.S.'],
  Canadá: ['Canada', 'Canadian'],
  Panamá: ['Panama', 'Panamanian'],
  Haití: ['Haiti', 'Haitian'],
  Curazao: ['Curaçao', 'Curacao'],
  España: ['Spain', 'Spanish'],
  Inglaterra: ['England', 'English'],
  Francia: ['France', 'French'],
  Alemania: ['Germany', 'German'],
  Portugal: ['Portugal', 'Portuguese'],
  'Países Bajos': ['Netherlands', 'Dutch'],
  Bélgica: ['Belgium', 'Belgian'],
  Croacia: ['Croatia', 'Croatian'],
  Suiza: ['Switzerland', 'Swiss'],
  Austria: ['Austria', 'Austrian'],
  Noruega: ['Norway', 'Norwegian'],
  Suecia: ['Sweden', 'Swedish'],
  Escocia: ['Scotland', 'Scottish'],
  Turquía: ['Turkey', 'Turkish'],
  Chequia: ['Czech Republic', 'Czech'],
  'Bosnia-Herzegovina': ['Bosnia', 'Bosnian', 'Herzegovina'],
  Japón: ['Japan', 'Japanese'],
  'Corea del Sur': ['South Korea', 'Korean'],
  Australia: ['Australia', 'Australian'],
  Irán: ['Iran', 'Iranian'],
  'Arabia Saudita': ['Saudi Arabia', 'Saudi'],
  Qatar: ['Qatar', 'Qatari'],
  Uzbekistán: ['Uzbekistan', 'Uzbek', 'Uzbekistani'],
  Jordania: ['Jordan', 'Jordanian'],
  Iraq: ['Iraq', 'Iraqi'],
  Marruecos: ['Morocco', 'Moroccan'],
  Senegal: ['Senegal', 'Senegalese'],
  Egipto: ['Egypt', 'Egyptian'],
  Nigeria: ['Nigeria', 'Nigerian'],
  Argelia: ['Algeria', 'Algerian'],
  Túnez: ['Tunisia', 'Tunisian'],
  Camerún: ['Cameroon', 'Cameroonian'],
  'Costa de Marfil': ['Ivory Coast', 'Ivorian', "Côte d'Ivoire"],
  Ghana: ['Ghana', 'Ghanaian'],
  Sudáfrica: ['South Africa', 'South African'],
  'Cabo Verde': ['Cape Verde', 'Cape Verdean'],
  'Congo RD': ['DR Congo', 'Congolese', 'Democratic Republic'],
  'Nueva Zelanda': ['New Zealand'],
};

/**
 * Country → Spanish hints for verifying pages on ES Wikipedia, where
 * categories use Spanish ('Futbolistas de la selección de fútbol de
 * Argentina'). Falls back to the EN hints when not present here.
 */
const COUNTRY_HINTS_ES: Record<string, string[]> = {
  Argentina: ['Argentina', 'argentino'],
  Brasil: ['Brasil', 'brasileño'],
  Uruguay: ['Uruguay', 'uruguayo'],
  Colombia: ['Colombia', 'colombiano'],
  Paraguay: ['Paraguay', 'paraguayo'],
  Ecuador: ['Ecuador', 'ecuatoriano'],
  México: ['México', 'mexicano'],
  'Estados Unidos': ['Estados Unidos', 'estadounidense'],
  Canadá: ['Canadá', 'canadiense'],
  España: ['España', 'español'],
  Francia: ['Francia', 'francés'],
  Alemania: ['Alemania', 'alemán'],
  Portugal: ['Portugal', 'portugués'],
  Marruecos: ['Marruecos', 'marroquí'],
  Senegal: ['Senegal', 'senegalés'],
};

const NATIVE_WIKI_LANG: Record<string, string> = {
  Marruecos: 'fr',
  Argelia: 'fr',
  Túnez: 'fr',
  Senegal: 'fr',
  'Costa de Marfil': 'fr',
  'Congo RD': 'fr',
  Brasil: 'pt',
  Portugal: 'pt',
  'Cabo Verde': 'pt',
  'Arabia Saudita': 'ar',
  Egipto: 'ar',
  Qatar: 'ar',
  Jordania: 'ar',
  Iraq: 'ar',
  Irán: 'fa',
  Japón: 'ja',
  'Corea del Sur': 'ko',
  Alemania: 'de',
  Austria: 'de',
  Suiza: 'de',
  'Países Bajos': 'nl',
  Suecia: 'sv',
  Noruega: 'no',
  Chequia: 'cs',
  Croacia: 'hr',
  'Bosnia-Herzegovina': 'bs',
  Turquía: 'tr',
  Uzbekistán: 'uz',
};

interface Candidate {
  pageId: number;
  title: string;
  thumbnail: string | null;
  categories: string[];
  extract: string;
}

/**
 * One round-trip: search + pageimages + categories + intro extract for the
 * top N hits. We pull more than one so that if the first hit is a homonym
 * we can still salvage a verified second hit without doubling the API
 * cost.
 */
async function searchAndFetch(
  query: string,
  lang: string,
  limit = 3,
): Promise<Candidate[]> {
  // Step 1: search to get pageIds.
  const searchUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&list=search&origin=*` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=${limit}`;
  let pageIds: number[] = [];
  let titlesByPageId: Record<number, string> = {};
  try {
    const res = await fetch(searchUrl, { headers: HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const hits = (data?.query?.search ?? []) as Array<{ pageid: number; title: string }>;
    pageIds = hits.map((h) => h.pageid).filter(Boolean);
    titlesByPageId = Object.fromEntries(hits.map((h) => [h.pageid, h.title]));
  } catch {
    return [];
  }
  if (pageIds.length === 0) return [];

  // Step 2: batch fetch thumbnails + categories + extract for those pages.
  const detailsUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&pageids=${pageIds.join('|')}` +
    `&prop=pageimages|categories|extracts` +
    `&piprop=thumbnail&pithumbsize=240&cllimit=50&exintro=1&explaintext=1&exsentences=2`;
  try {
    const res = await fetch(detailsUrl, { headers: HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    return pageIds
      .map((id) => {
        const p = pages[id];
        if (!p) return null;
        const categories = (p.categories ?? []).map((c: { title: string }) => c.title);
        const extract = typeof p.extract === 'string' ? p.extract : '';
        const thumbnail = typeof p.thumbnail?.source === 'string' ? p.thumbnail.source : null;
        return {
          pageId: id,
          title: titlesByPageId[id] ?? p.title ?? '',
          thumbnail,
          categories,
          extract,
        } as Candidate;
      })
      .filter((c): c is Candidate => c !== null);
  } catch {
    return [];
  }
}

/**
 * Page belongs to the right country iff any of its categories or
 * intro-extract mention a country hint AND it looks like a footballer
 * page (categories mention "footballer" / "futbolista" / equivalent).
 *
 * Rejecting non-footballer pages avoids the "wrong-Cristian Romero"
 * problem where the search returns a politician or musician.
 */
function verifyCandidate(c: Candidate, hints: string[]): boolean {
  if (hints.length === 0) return true; // no hints available → accept any
  const haystack = (c.categories.join(' | ') + ' || ' + c.extract).toLowerCase();
  const looksLikeFootballer =
    /footballer|football player|futbolista|joueur de football|fußballspieler|サッカー選手|축구 선수|jogador de futebol/.test(
      haystack,
    );
  if (!looksLikeFootballer) return false;
  return hints.some((h) => haystack.includes(h.toLowerCase()));
}

async function pickPhotoFor(
  name: string,
  teamName: string,
): Promise<{ url: string; via: string } | null> {
  const enHints = COUNTRY_HINTS_EN[teamName] ?? [teamName];
  const esHints = COUNTRY_HINTS_ES[teamName] ?? enHints;
  const nativeLang = NATIVE_WIKI_LANG[teamName];

  // Each pass tries multiple query phrasings on a single Wikipedia
  // language edition, and verifies every candidate against the country
  // hints. We prefer EN (broadest article coverage) then ES (best for
  // Hispanic teams) then native.
  const passes: Array<{ lang: string; hints: string[]; queries: string[] }> = [
    {
      lang: 'en',
      hints: enHints,
      queries: [
        `${name} ${enHints[0]} footballer`,
        `${name} ${enHints[1] ?? enHints[0]} footballer`,
        `${name} footballer`,
        name,
      ],
    },
    {
      lang: 'es',
      hints: esHints,
      queries: [
        `${name} ${esHints[0]} futbolista`,
        `${name} futbolista`,
        name,
      ],
    },
  ];
  if (nativeLang && nativeLang !== 'en' && nativeLang !== 'es') {
    passes.push({ lang: nativeLang, hints: enHints, queries: [name] });
  }

  for (const pass of passes) {
    // Dedup queries (some teams have a single hint so the first two queries
    // become identical) to save API calls.
    const seen = new Set<string>();
    for (const q of pass.queries) {
      if (seen.has(q)) continue;
      seen.add(q);
      const candidates = await searchAndFetch(q, pass.lang, 3);
      // Prefer candidates whose title looks like a person's page
      // (contains the surname) over list/article pages that happen to
      // mention the player. E.g. Messi: prefer "Lionel Messi" over
      // "List of international goals scored by Lionel Messi".
      const tokens = name
        .toLowerCase()
        .normalize('NFD')
        // eslint-disable-next-line no-misleading-character-class
        .replace(/[̀-ͯ]/g, '')
        .split(/\s+/)
        .filter((t) => t.length >= 3);
      const surname = tokens[tokens.length - 1] ?? '';
      const scored = candidates
        .filter((c) => c.thumbnail)
        .map((c) => {
          const lower = c.title
            .toLowerCase()
            .normalize('NFD')
            // eslint-disable-next-line no-misleading-character-class
            .replace(/[̀-ͯ]/g, '');
          // Hard requirement: the article title must contain the player's
          // SURNAME, not just any token. Names like "Ali" or "Mohamed" are
          // common enough that "any-token overlap" catches the wrong
          // homonym (e.g. "Ali Jasim" matched "Hussein Ali Al-Saedi" via
          // the shared "Ali"). The surname carries the actual identity.
          if (!surname || !lower.includes(surname)) return { c, score: -10 };
          let score = 0;
          if (lower.endsWith(surname)) score += 2;
          else score += 1;
          // Bonus for first-name overlap on top of the surname match —
          // distinguishes between two players with the same surname on
          // the same team.
          if (tokens.length > 1 && lower.includes(tokens[0])) score += 1;
          if (/^(list of|history of|\d{4}[–-])/i.test(c.title)) score -= 3;
          return { c, score };
        })
        .filter((s) => s.score >= 0)
        .sort((a, b) => b.score - a.score);
      for (const { c } of scored) {
        if (verifyCandidate(c, pass.hints)) {
          return { url: c.thumbnail!, via: `${pass.lang}:${c.title}` };
        }
      }
    }
  }
  return null;
}

async function main() {
  // Build target set.
  const conditions = FORCE ? [] : [isNull(players.photoUrl)];
  let targets = await db
    .select({
      id: players.id,
      name: players.name,
      teamName: teams.name,
      teamCode: teams.code,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  if (ONLY) targets = targets.filter((t) => ONLY!.includes(t.teamCode));
  targets = targets.slice(0, LIMIT);

  console.log(
    `[photos] ${targets.length} player(s) to process ` +
      `(force=${FORCE}, only=${ONLY?.join(',') ?? '-'})`,
  );

  let found = 0;
  let missing = 0;
  let unchanged = 0;
  for (const p of targets) {
    const pick = await pickPhotoFor(p.name, p.teamName);
    if (pick) {
      await db.update(players).set({ photoUrl: pick.url }).where(eq(players.id, p.id));
      found++;
      console.log(`  ✓ ${p.name} (${p.teamName}) ← ${pick.via}`);
    } else if (FORCE) {
      // In --force mode, clearing the URL would lose a previously-good
      // photo for cases where the new verification is too strict. Leave
      // the existing URL alone and just note it.
      unchanged++;
      console.log(`  · ${p.name} (${p.teamName}) — kept existing (no verified match)`);
    } else {
      missing++;
      console.log(`  · ${p.name} (${p.teamName}) — no photo`);
    }
    // ~80 ms between players. Each player fires up to ~6 detail
    // round-trips, so peak is ~12 req/s, well under Wikipedia's limit.
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(
    `[photos] done — ${found} matched, ${missing} not found, ${unchanged} kept existing`,
  );
}

// Silence unused-import warning when not in FORCE mode.
void inArray;

main().catch((err) => {
  console.error('[photos] failed:', err);
  process.exit(1);
});
