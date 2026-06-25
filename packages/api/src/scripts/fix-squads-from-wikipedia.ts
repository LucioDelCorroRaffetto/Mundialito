/**
 * Reconciles every WC2026 squad in our DB with Wikipedia's master
 * '2026 FIFA World Cup squads' article.
 *
 * For each team:
 *   1. Fetch Wikipedia's official 23-26 player list for the country.
 *   2. Fuzzy-match each Wikipedia name against the DB roster on
 *      (last name + first initial). When a match exists, rename the DB
 *      row to the canonical Wikipedia spelling (preserving its
 *      photo_url and shirt_number).
 *   3. Insert players present on Wikipedia but absent from the DB.
 *   4. Delete players present in the DB but absent from Wikipedia (cuts
 *      after the preliminary list).
 *   5. Preserves FK integrity — null any tournament_predictions.top_
 *      scorer_player_id pointing at a deleted player before the delete,
 *      and any fantasy_squad_players via cascade.
 *
 * The squad is updated to match Wikipedia's order which usually goes
 * GK / DF / MF / FW so positional grouping survives the rewrite.
 *
 * After this finishes, run sync:photos to populate Wikipedia thumbnails
 * for the freshly inserted players (existing photo URLs are kept
 * untouched).
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/fix-squads-from-wikipedia.ts
 *   pnpm --filter @mundialito/api exec tsx src/scripts/fix-squads-from-wikipedia.ts --only=SEN
 *   pnpm --filter @mundialito/api exec tsx src/scripts/fix-squads-from-wikipedia.ts --dry-run
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { teams, players, tournamentPredictions } from '../db/schema/index.js';
import { eq, sql, inArray } from 'drizzle-orm';

// ─── Wikipedia fetcher (shared with verify-squads-vs-wikipedia.ts) ────────────

const HEADERS = {
  'User-Agent': 'MundialitoApp/1.0 (https://mundialito-pi.vercel.app; delcorroraffetto@gmail.com)',
  'Accept': 'application/json',
};

const ENGLISH_NAME: Record<string, string> = {
  Argentina: 'Argentina', Brasil: 'Brazil', Uruguay: 'Uruguay', Colombia: 'Colombia',
  Paraguay: 'Paraguay', Ecuador: 'Ecuador', México: 'Mexico', 'Estados Unidos': 'United States',
  Canadá: 'Canada', Panamá: 'Panama', Haití: 'Haiti', Curazao: 'Curaçao', España: 'Spain',
  Inglaterra: 'England', Francia: 'France', Alemania: 'Germany', Portugal: 'Portugal',
  'Países Bajos': 'Netherlands', Bélgica: 'Belgium', Croacia: 'Croatia', Suiza: 'Switzerland',
  Austria: 'Austria', Noruega: 'Norway', Suecia: 'Sweden', Escocia: 'Scotland',
  Turquía: 'Turkey', Chequia: 'Czech Republic', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  Japón: 'Japan', 'Corea del Sur': 'South Korea', Australia: 'Australia', Irán: 'Iran',
  'Arabia Saudita': 'Saudi Arabia', Qatar: 'Qatar', Uzbekistán: 'Uzbekistan',
  Jordania: 'Jordan', Iraq: 'Iraq', Marruecos: 'Morocco', Senegal: 'Senegal',
  Egipto: 'Egypt', Nigeria: 'Nigeria', Argelia: 'Algeria', Túnez: 'Tunisia',
  Camerún: 'Cameroon', 'Costa de Marfil': 'Ivory Coast', Ghana: 'Ghana',
  Sudáfrica: 'South Africa', 'Cabo Verde': 'Cape Verde', 'Congo RD': 'DR Congo',
  'Nueva Zelanda': 'New Zealand',
};

const WIKI_POS_MAP: Record<string, 'GK' | 'DEF' | 'MID' | 'FWD'> = {
  GK: 'GK',
  DF: 'DEF',
  MF: 'MID',
  FW: 'FWD',
};

interface WikiPlayer {
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
}

let cachedMasterSquadsText: string | null = null;
async function getMasterSquadsText(): Promise<string> {
  if (cachedMasterSquadsText) return cachedMasterSquadsText;
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*' +
    '&page=2026_FIFA_World_Cup_squads&prop=wikitext';
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  const data = await res.json();
  cachedMasterSquadsText = (data?.parse?.wikitext?.['*'] ?? '') as string;
  return cachedMasterSquadsText;
}

function stripDisambig(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

async function fetchWikiSquad(countryEN: string): Promise<WikiPlayer[] | null> {
  const text = await getMasterSquadsText();
  const escaped = countryEN.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const headingRe = new RegExp(`\\n===${escaped}===\\s*\\n`, 'i');
  const headingMatch = text.match(headingRe);
  if (!headingMatch || headingMatch.index === undefined) return null;
  const startContent = headingMatch.index + headingMatch[0].length;
  const after = text.slice(startContent);
  const next = after.search(/\n==[^=]|\n===[^=]/);
  const section = next > 0 ? after.slice(0, next) : after;

  // Extract both pos= and name= per template call so we get the position too.
  const re = /\{\{nat fs (?:g )?player[^}]*?pos\s*=\s*([A-Z]{2,3})[^}]*?name\s*=\s*\[\[([^|\]]+?)(?:\|[^\]]+)?\]\]/gi;
  const players: WikiPlayer[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const pos = WIKI_POS_MAP[m[1].toUpperCase()];
    if (!pos) continue;
    players.push({ name: stripDisambig(m[2]), position: pos });
  }
  return players.length > 0 ? players : null;
}

// ─── Fuzzy matching ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
     
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`´ʹ]/g, "'")
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface NameTokens {
  raw: string;
  norm: string;
  tokens: string[]; // split by space
  last: string;     // last token (surname)
  first: string;    // first token
}

function tokenize(name: string): NameTokens {
  const normed = norm(name);
  const tokens = normed.split(' ').filter(Boolean);
  return {
    raw: name,
    norm: normed,
    tokens,
    last: tokens[tokens.length - 1] ?? '',
    first: tokens[0] ?? '',
  };
}

/**
 * Returns true if these two names are "probably the same player". Generous:
 *  - exact normalised match
 *  - same last name + same first name
 *  - one tokenization is a subset of the other (e.g. 'Pape Sarr' vs
 *    'Pape Matar Sarr')
 *  - same last name + first initial match
 */
// Apostrophe-stripped variant used as a fallback so 'Mbaye' matches
// 'M'Baye' and 'Ndoye' matches 'N'Doye'.
function dropApos(s: string): string {
  return s.replace(/'/g, '');
}

function looksLikeSame(a: NameTokens, b: NameTokens): boolean {
  if (a.norm === b.norm) return true;
  if (dropApos(a.norm) === dropApos(b.norm)) return true;
  const aLast = dropApos(a.last);
  const bLast = dropApos(b.last);
  if (aLast && bLast && aLast === bLast) {
    if (a.first === b.first) return true;
    // 'Pape Sarr' ⊂ 'Pape Matar Sarr' — token-subset comparison done with
    // apostrophes already stripped on both sides.
    const aSet = new Set(a.tokens.map(dropApos));
    const bSet = new Set(b.tokens.map(dropApos));
    const aSubsetB = [...aSet].every((t) => bSet.has(t));
    const bSubsetA = [...bSet].every((t) => aSet.has(t));
    if (aSubsetB || bSubsetA) return true;
    // First-initial match for compound first names
    if (a.first[0] && b.first[0] && a.first[0] === b.first[0]) return true;
  }
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface PlanOp {
  kind: 'rename' | 'insert' | 'delete' | 'update-position';
  detail: string;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;

  const dbTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.confederation} IS NOT NULL AND ${teams.code} NOT IN ('PO1','PO2','TBD')`);
  const targetTeams = only ? dbTeams.filter((t) => only.includes(t.code)) : dbTeams;

  console.log(`[fix-squads] processing ${targetTeams.length} team(s)${dryRun ? ' (dry run)' : ''}\n`);

  let totalRenamed = 0;
  let totalInserted = 0;
  let totalDeleted = 0;
  let totalPosFixed = 0;

  for (const team of targetTeams) {
    const english = ENGLISH_NAME[team.name];
    if (!english) {
      console.warn(`  ${team.code}: skipped — no English-name mapping`);
      continue;
    }
    const wiki = await fetchWikiSquad(english);
    if (!wiki || wiki.length < 15) {
      console.warn(`  ${team.code}: skipped — Wikipedia squad missing or too short`);
      continue;
    }

    const dbRows = await db
      .select({ id: players.id, name: players.name, position: players.position, photoUrl: players.photoUrl, shirtNumber: players.shirtNumber })
      .from(players)
      .where(eq(players.teamId, team.id));

    // Build NameTokens for both sides.
    const dbItems = dbRows.map((r) => ({ row: r, tokens: tokenize(r.name) }));
    const wikiItems = wiki.map((p) => ({ wp: p, tokens: tokenize(p.name) }));

    // Greedy match: for each wiki player, find best db row that's not yet
    // claimed. Mark claimed db rows.
    const claimed = new Set<number>();
    const matchedPairs: { db: typeof dbItems[number]; wp: typeof wikiItems[number] }[] = [];
    for (const wikiI of wikiItems) {
      let found: typeof dbItems[number] | undefined;
      for (const dbI of dbItems) {
        if (claimed.has(dbI.row.id)) continue;
        if (looksLikeSame(dbI.tokens, wikiI.tokens)) {
          found = dbI;
          break;
        }
      }
      if (found) {
        claimed.add(found.row.id);
        matchedPairs.push({ db: found, wp: wikiI });
      }
    }

    const toInsertRaw = wikiItems.filter((w) => !matchedPairs.some((p) => p.wp === w));
    const toDeleteRaw = dbItems.filter((d) => !claimed.has(d.row.id));
    const toRename = matchedPairs.filter((p) => p.db.row.name !== p.wp.wp.name);
    const toUpdatePos = matchedPairs.filter((p) => p.db.row.position !== p.wp.wp.position);

    const ops: PlanOp[] = [
      ...toRename.map((p) => ({ kind: 'rename' as const, detail: `${p.db.row.name} → ${p.wp.wp.name}` })),
      ...toInsertRaw.map((p) => ({ kind: 'insert' as const, detail: `+ ${p.wp.name} (${p.wp.position})` })),
      ...toDeleteRaw.map((p) => ({ kind: 'delete' as const, detail: `- ${p.row.name}` })),
      ...toUpdatePos.map((p) => ({ kind: 'update-position' as const, detail: `${p.db.row.name}: ${p.db.row.position} → ${p.wp.wp.position}` })),
    ];

    if (ops.length === 0) {
      console.log(`  ${team.code.padEnd(4)} ${team.name.padEnd(22)} ✓ already aligned`);
      continue;
    }

    console.log(`\n  ${team.code} ${team.name}`);
    for (const op of ops) console.log(`     ${op.kind.padEnd(16)} ${op.detail}`);

    if (dryRun) continue;

    // Apply.
    if (toRename.length > 0) {
      for (const p of toRename) {
        await db.update(players).set({ name: p.wp.wp.name }).where(eq(players.id, p.db.row.id));
      }
      totalRenamed += toRename.length;
    }
    if (toUpdatePos.length > 0) {
      for (const p of toUpdatePos) {
        await db.update(players).set({ position: p.wp.wp.position }).where(eq(players.id, p.db.row.id));
      }
      totalPosFixed += toUpdatePos.length;
    }
    if (toDeleteRaw.length > 0) {
      const ids = toDeleteRaw.map((p) => p.row.id);
      // Null out top_scorer FK pointers (no CASCADE).
      await db
        .update(tournamentPredictions)
        .set({ topScorerPlayerId: null })
        .where(inArray(tournamentPredictions.topScorerPlayerId, ids));
      await db.delete(players).where(inArray(players.id, ids));
      totalDeleted += toDeleteRaw.length;
    }
    if (toInsertRaw.length > 0) {
      await db.insert(players).values(
        toInsertRaw.map((p) => ({
          teamId: team.id,
          name: p.wp.name,
          position: p.wp.position,
          shirtNumber: null,
          photoUrl: null,
        })),
      );
      totalInserted += toInsertRaw.length;
    }

    // Be polite — even though we cached the master text, queries still hit the DB.
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(
    `\n[fix-squads] done — ` +
      `renamed ${totalRenamed}, inserted ${totalInserted}, ` +
      `deleted ${totalDeleted}, position-fixed ${totalPosFixed}` +
      (dryRun ? '  (DRY RUN)' : ''),
  );

  if (!dryRun && totalInserted > 0) {
    console.log('\nNext step: pnpm --filter @mundialito/api run sync:photos');
    console.log('  → fetches Wikipedia thumbnails for the newly inserted players.');
  }
}

main().catch((err) => {
  console.error('[fix-squads] failed:', err);
  process.exit(1);
});
