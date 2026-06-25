/**
 * Pobla players.sub_position desde el artículo individual de Wikipedia
 * de cada jugador. Usa el master '2026 FIFA World Cup squads' para
 * descubrir el TÍTULO del artículo de cada jugador (Wikipedia link en el
 * template `{{nat fs player|name=[[Title]]|...}}`), después fetchea ese
 * artículo, extrae `position = ...` del infobox, y mapea a roles cortos.
 *
 * Idempotente: vuelve a correr y solo escribe cuando cambia algo.
 *
 *   npx tsx packages/api/src/scripts/sync-player-positions.ts
 *   npx tsx packages/api/src/scripts/sync-player-positions.ts --only=ARG,BRA
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { players, teams } from '../db/schema/index.js';
import { parsePositionRoles, extractPositionFromWikitext } from '../lib/position-parser.js';

const HEADERS = {
  'User-Agent': 'MundialitoApp/1.0 (https://mundialito-pi.vercel.app; delcorroraffetto@gmail.com)',
  Accept: 'application/json',
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

let cachedMasterText: string | null = null;
async function getMasterSquadsText(): Promise<string> {
  if (cachedMasterText) return cachedMasterText;
  const url = 'https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=2026_FIFA_World_Cup_squads&prop=wikitext';
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Wikipedia master returned ${res.status}`);
  const data: any = await res.json();
  cachedMasterText = (data?.parse?.wikitext?.['*'] ?? '') as string;
  return cachedMasterText;
}

function stripDisambig(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`´ʹ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extrae { wikiTitle, displayName } por cada jugador en la sección de un
 * país. wikiTitle preserva el disambiguador "(footballer, born X)" para
 * poder fetchear el artículo correcto; displayName es lo que mostramos.
 */
function extractTeamPlayers(countryEN: string): Array<{ title: string; display: string }> | null {
  const text = cachedMasterText;
  if (!text) return null;
  const escaped = countryEN.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const headingMatch = text.match(new RegExp(`\\n===${escaped}===\\s*\\n`, 'i'));
  if (!headingMatch || headingMatch.index === undefined) return null;
  const after = text.slice(headingMatch.index + headingMatch[0].length);
  const next = after.search(/\n==[^=]|\n===[^=]/);
  const section = next > 0 ? after.slice(0, next) : after;

  const re = /\{\{nat fs (?:g )?player[^}]*?name\s*=\s*\[\[([^|\]]+?)(?:\|[^\]]+)?\]\]/gi;
  const out: Array<{ title: string; display: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const title = m[1].trim();
    out.push({ title, display: stripDisambig(title) });
  }
  return out;
}

async function fetchPlayerWikitext(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const data: any = await res.json();
  return data?.parse?.wikitext?.['*'] ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const onlyCodes = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;

  await getMasterSquadsText();

  const dbTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.confederation} IS NOT NULL AND ${teams.code} NOT IN ('PO1','PO2','TBD')`);
  const targets = onlyCodes ? dbTeams.filter((t) => onlyCodes.includes(t.code)) : dbTeams;

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalMissing = 0;

  for (const team of targets) {
    const english = ENGLISH_NAME[team.name];
    if (!english) { console.warn(`  ${team.code}: no English mapping`); continue; }
    const wikiPlayers = extractTeamPlayers(english);
    if (!wikiPlayers) { console.warn(`  ${team.code}: section not found`); continue; }

    const dbRoster = await db.select().from(players).where(eq(players.teamId, team.id));
    // Index roster por nombre normalizado para hacer fuzzy match con
    // displayName del Wikipedia.
    const byNorm = new Map<string, typeof dbRoster[number]>();
    for (const p of dbRoster) byNorm.set(norm(p.name), p);

    let teamUpdated = 0;
    let teamMissing = 0;
    for (const wp of wikiPlayers) {
      const dbPlayer = byNorm.get(norm(wp.display));
      if (!dbPlayer) {
        // Buscar con "last name match" como fallback — el squad-reconcile
        // ya alinea nombres, así que esto debería matchear casi siempre.
        continue;
      }
      const wikitext = await fetchPlayerWikitext(wp.title);
      await new Promise((r) => setTimeout(r, 250)); // polite
      if (!wikitext) { teamMissing++; continue; }
      const raw = extractPositionFromWikitext(wikitext);
      const roles = parsePositionRoles(raw);
      const newSubPos: string | null = roles.length > 0 ? roles.join(',') : null;
      if ((dbPlayer.subPosition ?? null) !== newSubPos) {
        await db.update(players).set({ subPosition: newSubPos }).where(eq(players.id, dbPlayer.id));
        teamUpdated++;
      } else {
        totalSkipped++;
      }
    }
    totalUpdated += teamUpdated;
    totalMissing += teamMissing;
    console.log(`  ${team.code.padEnd(4)} ${team.name.padEnd(22)} updated=${teamUpdated} missing=${teamMissing}`);
  }

  console.log(`\n[sync-player-positions] updated=${totalUpdated} unchanged=${totalSkipped} missing-wikipedia=${totalMissing}`);
}
main().catch((err) => { console.error(err); process.exit(1); });
