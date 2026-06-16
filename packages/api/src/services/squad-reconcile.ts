// Reconcilia los rosters de los 48 equipos contra el artículo maestro
// '2026 FIFA World Cup squads' de Wikipedia. Sirve de safety net contra
// el caso "FIFA call-up de último momento" — un jugador que la cobertura
// inicial no tenía y termina marcando un gol (Logan Rogerson NZL fue
// el caso que motivó esto).
//
// Una sola request HTTP a Wikipedia por corrida (el master article cubre
// los 48 equipos). En memoria parseamos cada sección por país. La función
// matchea nombre por (apellido + inicial / token-subset), renombra los
// que coinciden preservando id/foto/shirt, inserta los nuevos y borra
// los que ya no están.
//
// Idempotente. Pensado para correr 1×/12h desde /sync (ver app.ts) o
// manualmente desde packages/api/src/scripts/fix-squads-from-wikipedia.ts.

import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { teams, players, tournamentPredictions } from '../db/schema/index.js';

const WIKI_HEADERS = {
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
let cachedAt = 0;
const MASTER_CACHE_MS = 30 * 60 * 1000;

async function getMasterSquadsText(): Promise<string> {
  const now = Date.now();
  if (cachedMasterSquadsText && now - cachedAt < MASTER_CACHE_MS) {
    return cachedMasterSquadsText;
  }
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*' +
    '&page=2026_FIFA_World_Cup_squads&prop=wikitext';
  const res = await fetch(url, { headers: WIKI_HEADERS });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  const data: any = await res.json();
  cachedMasterSquadsText = (data?.parse?.wikitext?.['*'] ?? '') as string;
  cachedAt = now;
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

  const re = /\{\{nat fs (?:g )?player[^}]*?pos\s*=\s*([A-Z]{2,3})[^}]*?name\s*=\s*\[\[([^|\]]+?)(?:\|[^\]]+)?\]\]/gi;
  const out: WikiPlayer[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const pos = WIKI_POS_MAP[m[1].toUpperCase()];
    if (!pos) continue;
    out.push({ name: stripDisambig(m[2]), position: pos });
  }
  return out.length > 0 ? out : null;
}

// ─── Name matching ───────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`´ʹ]/g, "'")
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface NameTokens {
  norm: string;
  tokens: string[];
  last: string;
  first: string;
}

function tokenize(name: string): NameTokens {
  const normed = norm(name);
  const tokens = normed.split(' ').filter(Boolean);
  return {
    norm: normed,
    tokens,
    last: tokens[tokens.length - 1] ?? '',
    first: tokens[0] ?? '',
  };
}

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
    const aSet = new Set(a.tokens.map(dropApos));
    const bSet = new Set(b.tokens.map(dropApos));
    const aSubsetB = [...aSet].every((t) => bSet.has(t));
    const bSubsetA = [...bSet].every((t) => aSet.has(t));
    if (aSubsetB || bSubsetA) return true;
    if (a.first[0] && b.first[0] && a.first[0] === b.first[0]) return true;
  }
  return false;
}

// ─── Reconcile ───────────────────────────────────────────────────────────────

export interface SquadReconcileResult {
  processed: number;
  renamed: number;
  inserted: number;
  deleted: number;
  posFixed: number;
  errors: string[];
}

export interface SquadReconcileOptions {
  /** Limit to specific FIFA codes (e.g. ['NZL','URU']); omit for all 48. */
  only?: string[];
}

export async function reconcileSquadsFromWikipedia(
  opts: SquadReconcileOptions = {},
): Promise<SquadReconcileResult> {
  const result: SquadReconcileResult = {
    processed: 0,
    renamed: 0,
    inserted: 0,
    deleted: 0,
    posFixed: 0,
    errors: [],
  };

  const dbTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.confederation} IS NOT NULL AND ${teams.code} NOT IN ('PO1','PO2','TBD')`);
  const targets = opts.only
    ? dbTeams.filter((t) => opts.only!.includes(t.code))
    : dbTeams;

  for (const team of targets) {
    const english = ENGLISH_NAME[team.name];
    if (!english) continue;
    let wiki: WikiPlayer[] | null = null;
    try {
      wiki = await fetchWikiSquad(english);
    } catch (err) {
      result.errors.push(`${team.code}: fetch ${String(err)}`);
      continue;
    }
    if (!wiki || wiki.length < 15) continue;
    result.processed++;

    const dbRows = await db
      .select({ id: players.id, name: players.name, position: players.position })
      .from(players)
      .where(eq(players.teamId, team.id));
    const dbItems = dbRows.map((r) => ({ row: r, tokens: tokenize(r.name) }));
    const wikiItems = wiki.map((p) => ({ wp: p, tokens: tokenize(p.name) }));

    const claimed = new Set<number>();
    const matched: { db: typeof dbItems[number]; wp: typeof wikiItems[number] }[] = [];
    for (const wikiI of wikiItems) {
      const found = dbItems.find((dbI) => !claimed.has(dbI.row.id) && looksLikeSame(dbI.tokens, wikiI.tokens));
      if (found) {
        claimed.add(found.row.id);
        matched.push({ db: found, wp: wikiI });
      }
    }
    const toInsert = wikiItems.filter((w) => !matched.some((p) => p.wp === w));
    const toDelete = dbItems.filter((d) => !claimed.has(d.row.id));
    const toRename = matched.filter((p) => p.db.row.name !== p.wp.wp.name);
    const toUpdatePos = matched.filter((p) => p.db.row.position !== p.wp.wp.position);

    try {
      for (const p of toRename) {
        await db.update(players).set({ name: p.wp.wp.name }).where(eq(players.id, p.db.row.id));
      }
      result.renamed += toRename.length;

      for (const p of toUpdatePos) {
        await db.update(players).set({ position: p.wp.wp.position }).where(eq(players.id, p.db.row.id));
      }
      result.posFixed += toUpdatePos.length;

      if (toDelete.length > 0) {
        const ids = toDelete.map((p) => p.row.id);
        await db
          .update(tournamentPredictions)
          .set({ topScorerPlayerId: null })
          .where(inArray(tournamentPredictions.topScorerPlayerId, ids));
        await db.delete(players).where(inArray(players.id, ids));
        result.deleted += toDelete.length;
      }
      if (toInsert.length > 0) {
        await db.insert(players).values(
          toInsert.map((p) => ({
            teamId: team.id,
            name: p.wp.name,
            position: p.wp.position,
            shirtNumber: null,
            photoUrl: null,
          })),
        );
        result.inserted += toInsert.length;
      }

      const teamChanges = toRename.length + toInsert.length + toDelete.length + toUpdatePos.length;
      if (teamChanges > 0) {
        console.log(
          `[squad-reconcile] ${team.code}: renamed=${toRename.length} ` +
          `inserted=${toInsert.length} deleted=${toDelete.length} pos=${toUpdatePos.length}`,
        );
      }
    } catch (err) {
      result.errors.push(`${team.code}: apply ${String(err)}`);
    }
  }

  return result;
}
