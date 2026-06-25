/**
 * Cross-checks every WC2026 squad in our DB against Wikipedia's
 * "2026 FIFA World Cup squads" article + each per-country squad page.
 *
 * football-data.org keeps publishing partial lists for some teams
 * (Sadio Mané missing from Senegal, Mexico still at 12 names, …).
 * Wikipedia tracks the official call-ups within hours of each
 * federation's announcement, so we use it as the second opinion.
 *
 * Strategy per team:
 *  1. Fetch the country's WC2026 squad article (en.wikipedia.org).
 *     Title pattern: '<Country> at the 2026 FIFA World Cup' → linked
 *     'Squad' subsection table.
 *  2. Parse the player names from the table.
 *  3. Diff against our DB (case-insensitive, accent-folded match).
 *  4. Report missing-in-DB and extra-in-DB names so the operator can
 *     decide whether to manually patch or wait for sync:squads to
 *     catch up.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/verify-squads-vs-wikipedia.ts
 *
 * The script never modifies the DB on its own — it's diagnostic. To
 * actually patch a team after reading the report, see fix-squad.ts
 * (or just edit via the admin panel once it exists).
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { teams, players } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

const HEADERS = {
  'User-Agent': 'MundialitoApp/1.0 (https://mundialito-pi.vercel.app; delcorroraffetto@gmail.com)',
  'Accept': 'application/json',
};

/**
 * Spanish team name → English country name used in Wikipedia article
 * titles. Most match directly; this map covers the ones that don't.
 */
const ENGLISH_NAME: Record<string, string> = {
  Argentina: 'Argentina',
  Brasil: 'Brazil',
  Uruguay: 'Uruguay',
  Colombia: 'Colombia',
  Paraguay: 'Paraguay',
  Ecuador: 'Ecuador',
  México: 'Mexico',
  'Estados Unidos': 'United States',
  Canadá: 'Canada',
  Panamá: 'Panama',
  Haití: 'Haiti',
  Curazao: 'Curaçao',
  España: 'Spain',
  Inglaterra: 'England',
  Francia: 'France',
  Alemania: 'Germany',
  Portugal: 'Portugal',
  'Países Bajos': 'Netherlands',
  Bélgica: 'Belgium',
  Croacia: 'Croatia',
  Suiza: 'Switzerland',
  Austria: 'Austria',
  Noruega: 'Norway',
  Suecia: 'Sweden',
  Escocia: 'Scotland',
  Turquía: 'Turkey',
  Chequia: 'Czech Republic',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  Japón: 'Japan',
  'Corea del Sur': 'South Korea',
  Australia: 'Australia',
  Irán: 'Iran',
  'Arabia Saudita': 'Saudi Arabia',
  Qatar: 'Qatar',
  Uzbekistán: 'Uzbekistan',
  Jordania: 'Jordan',
  Iraq: 'Iraq',
  Marruecos: 'Morocco',
  Senegal: 'Senegal',
  Egipto: 'Egypt',
  Nigeria: 'Nigeria',
  Argelia: 'Algeria',
  Túnez: 'Tunisia',
  Camerún: 'Cameroon',
  'Costa de Marfil': 'Ivory Coast',
  Ghana: 'Ghana',
  Sudáfrica: 'South Africa',
  'Cabo Verde': 'Cape Verde',
  'Congo RD': 'DR Congo',
  'Nueva Zelanda': 'New Zealand',
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
     
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`´ʹ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

interface WikiPlayer {
  name: string;
  position?: string;
}

// Stripped Wikipedia article-title disambiguation suffixes:
// 'Antoine Mendy (footballer)' → 'Antoine Mendy',
// 'Abdoulaye Seck (footballer, born 1992)' → 'Abdoulaye Seck'.
function stripDisambig(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Fetches the master '2026 FIFA World Cup squads' article once and slices
 * the section for each country. Way faster than searching per team and
 * also handles the case where no per-country article exists yet.
 */
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

async function fetchWikiSquad(countryEN: string): Promise<WikiPlayer[] | null> {
  const text = await getMasterSquadsText();
  // Each country is a LEVEL-3 heading inside a level-2 group section
  // (===Argentina=== inside ==Group A==). Anchor the search to the
  // level-3 form so we don't accidentally match a substring of a level-4
  // heading, and stop at the NEXT level-3 heading regardless of group.
  const escaped = countryEN.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  // Heading line: \n===Country===\n  (possibly preceded by trailing whitespace).
  const headingRe = new RegExp(`\\n===${escaped}===\\s*\\n`, 'i');
  const headingMatch = text.match(headingRe);
  if (!headingMatch || headingMatch.index === undefined) return null;
  const startContent = headingMatch.index + headingMatch[0].length;
  const after = text.slice(startContent);
  // Bound by the next heading of any level except level 4+ (subsections).
  // Either ===Country=== of the next country, or ==Group X== of the next group,
  // or top-level ==Section==. We just look for \n== which catches both.
  const next = after.search(/\n==[^=]|\n===[^=]/);
  const section = next > 0 ? after.slice(0, next) : after;

  // Each player is a {{nat fs g player ...|name=[[Name]]|...}} call.
  const re = /\{\{nat fs (?:g )?player[^}]*?name\s*=\s*\[\[([^|\]]+?)(?:\|[^\]]+)?\]\]/gi;
  const players: WikiPlayer[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    players.push({ name: stripDisambig(m[1]) });
  }
  return players.length > 0 ? players : null;
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;

  const dbTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.confederation} IS NOT NULL AND ${teams.code} NOT IN ('PO1','PO2','TBD')`);

  const targetTeams = only ? dbTeams.filter((t) => only.includes(t.code)) : dbTeams;

  let totalMissing = 0;
  let totalExtra = 0;
  const summary: { code: string; missing: string[]; extra: string[] }[] = [];

  for (const team of targetTeams) {
    const englishName = ENGLISH_NAME[team.name];
    if (!englishName) {
      console.warn(`  ${team.code}: skipped — no English-name mapping`);
      continue;
    }

    const wikiSquad = await fetchWikiSquad(englishName);
    if (!wikiSquad || wikiSquad.length < 15) {
      console.warn(`  ${team.code}: skipped — Wikipedia article not found (got ${wikiSquad?.length ?? 0})`);
      // be polite
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }

    const dbRows = await db
      .select({ name: players.name })
      .from(players)
      .where(eq(players.teamId, team.id));
    const dbNames = new Set(dbRows.map((r) => norm(r.name)));
    const wikiNames = new Set(wikiSquad.map((p) => norm(p.name)));

    const missing = [...wikiNames].filter((n) => !dbNames.has(n));
    const extra = [...dbNames].filter((n) => !wikiNames.has(n));

    if (missing.length > 0 || extra.length > 0) {
      summary.push({ code: team.code, missing, extra });
      totalMissing += missing.length;
      totalExtra += extra.length;
    }
    console.log(
      `  ${team.code.padEnd(4)} ${team.name.padEnd(22)} ` +
        `DB=${dbRows.length}  Wiki=${wikiSquad.length}  ` +
        `missing=${missing.length}  extra=${extra.length}`,
    );

    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n[verify] ${summary.length} team(s) with discrepancies — ${totalMissing} missing, ${totalExtra} extra`);
  for (const s of summary) {
    console.log(`\n${s.code}`);
    if (s.missing.length > 0) {
      console.log('  Missing in DB (should add):');
      s.missing.slice(0, 30).forEach((n) => console.log('    +', n));
      if (s.missing.length > 30) console.log(`    ... and ${s.missing.length - 30} more`);
    }
    if (s.extra.length > 0) {
      console.log('  Extra in DB (might be wrong / old):');
      s.extra.slice(0, 30).forEach((n) => console.log('    -', n));
      if (s.extra.length > 30) console.log(`    ... and ${s.extra.length - 30} more`);
    }
  }
}

main().catch((err) => {
  console.error('[verify] failed:', err);
  process.exit(1);
});
