/**
 * Fetches a thumbnail photo for every player from Wikipedia (free, no API key).
 * Tries the player's name + team + 'footballer' as the search term, takes the
 * top hit's thumbnail (pithumbsize=240).
 *
 * Skips players that already have a photo. Players without a usable
 * Wikipedia match keep their photoUrl null and the UI falls back to the
 * coloured shirt + number SVG already in place.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/sync-player-photos.ts
 *
 * Honors WIKIPEDIA_LIMIT env (max players per run, default 999) so you can
 * test small batches before committing to the full set.
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { players, teams } from '../db/schema/index.js';
import { eq, isNull, and } from 'drizzle-orm';

const LIMIT = Number(process.env.WIKIPEDIA_LIMIT ?? 999);

// Polite User-Agent — Wikipedia asks for one identifying the app + contact.
const HEADERS = {
  'User-Agent': 'MundialitoApp/1.0 (https://mundialito-pi.vercel.app; delcorroraffetto@gmail.com)',
  'Accept': 'application/json',
};

/**
 * Fetches a thumbnail from a specific Wikipedia language edition. Used to
 * try EN first (broadest coverage), then ES (much better for Latin
 * American and Spanish-speaking national-team players), then the player's
 * own native language as a last resort.
 */
async function fetchWikipediaThumbnail(query: string, lang: string): Promise<string | null> {
  const searchUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&list=search&origin=*` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=1`;
  let pageId: number | null = null;
  try {
    const res = await fetch(searchUrl, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.query?.search?.[0];
    if (!hit?.pageid) return null;
    pageId = hit.pageid;
  } catch {
    return null;
  }

  const thumbUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&pageids=${pageId}&prop=pageimages&piprop=thumbnail&pithumbsize=240`;
  try {
    const res = await fetch(thumbUrl, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const page = data?.query?.pages?.[pageId!];
    const src = page?.thumbnail?.source;
    return typeof src === 'string' ? src : null;
  } catch {
    return null;
  }
}

/**
 * Country code → preferred Wikipedia language edition as a tertiary fallback.
 * EN and ES are always tried first; this adds the player's native language
 * for cases where neither covers them (Arabic for Saudi, Portuguese for
 * Brazilian, etc).
 */
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

async function main() {
  // Load players missing a photo, joined with their team name to build a
  // better search query.
  const targets = await db
    .select({
      id: players.id,
      name: players.name,
      teamName: teams.name,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(and(isNull(players.photoUrl)))
    .limit(LIMIT);

  console.log(`[photos] ${targets.length} player(s) without a photo`);

  let found = 0;
  let missing = 0;
  for (const p of targets) {
    // Cascade: EN Wikipedia (broadest), then ES (best for Latin America +
    // Spain), then the player's native language as a last resort.
    const nativeLang = NATIVE_WIKI_LANG[p.teamName];
    const passes: Array<{ lang: string; queries: string[] }> = [
      {
        lang: 'en',
        queries: [`${p.name} footballer`, `${p.name}`, `${p.name} ${p.teamName} football`],
      },
      {
        lang: 'es',
        queries: [`${p.name} futbolista`, `${p.name}`, `${p.name} ${p.teamName}`],
      },
    ];
    if (nativeLang && nativeLang !== 'en' && nativeLang !== 'es') {
      passes.push({ lang: nativeLang, queries: [p.name] });
    }

    let url: string | null = null;
    outer: for (const pass of passes) {
      for (const q of pass.queries) {
        url = await fetchWikipediaThumbnail(q, pass.lang);
        if (url) break outer;
      }
    }

    if (url) {
      await db.update(players).set({ photoUrl: url }).where(eq(players.id, p.id));
      found++;
      console.log(`  ✓ ${p.name} (${p.teamName})`);
    } else {
      missing++;
      console.log(`  · ${p.name} (${p.teamName}) — no photo`);
    }

    // Polite rate-limiting. Each player may fire 2-6 requests across
    // language passes; 80 ms between players keeps us at ~12 req/s peak
    // which is still under Wikipedia's API limit.
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`[photos] done — ${found} matched, ${missing} not found`);
}

main().catch((err) => {
  console.error('[photos] failed:', err);
  process.exit(1);
});
