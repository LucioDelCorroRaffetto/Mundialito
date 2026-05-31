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

async function fetchWikipediaThumbnail(query: string): Promise<string | null> {
  // Step 1: search for the page.
  const searchUrl =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&origin=*' +
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

  // Step 2: fetch the page's thumbnail.
  const thumbUrl =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*' +
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
    // Try the most specific query first, fall back to a looser one.
    const queries = [
      `${p.name} ${p.teamName} footballer`,
      `${p.name} footballer`,
      `${p.name}`,
    ];

    let url: string | null = null;
    for (const q of queries) {
      url = await fetchWikipediaThumbnail(q);
      if (url) break;
    }

    if (url) {
      await db.update(players).set({ photoUrl: url }).where(eq(players.id, p.id));
      found++;
      console.log(`  ✓ ${p.name} (${p.teamName})`);
    } else {
      missing++;
      console.log(`  · ${p.name} (${p.teamName}) — no photo`);
    }

    // Polite rate-limiting: 6 req/sec is well under Wikipedia's limit.
    await new Promise((r) => setTimeout(r, 170));
  }

  console.log(`[photos] done — ${found} matched, ${missing} not found`);
}

main().catch((err) => {
  console.error('[photos] failed:', err);
  process.exit(1);
});
