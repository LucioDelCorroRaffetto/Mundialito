/**
 * Syncs per-player stats (goals, assists, cards, played) for a finished
 * match from the FIFA.com public API into our `player_match_stats` table,
 * then triggers a fantasy recompute.
 *
 * Why FIFA.com: API-Football's free tier blocks WC 2026 entirely (verified
 * — `"Free plans do not have access to this season, try from 2022 to 2024."`).
 * football-data.org free tier returns 403 on the detailed `/matches/{id}`
 * endpoint. ESPN's `keyEvents` carries event-by-event detail but the
 * `athletesInvolved` array is empty for soccer matches. FIFA.com's
 * `/timelines/{competition}/{season}/{stage}/{match}` endpoint is **public,
 * unauthenticated, and complete** for WC 2026: every Type 0/39/41 (goals),
 * Type 1 (assists), Type 2 (yellow), Type 3 (red), and Type 5 (substitution)
 * carries `IdPlayer` + `IdTeam` and a human description we can use as
 * fallback.
 *
 * Player mapping is lazy. The first time we see "FODEN (England) scores"
 * we fuzzy-match against the England roster and persist the resulting
 * `fifaIdPlayer` so subsequent matches hit the index instead of running
 * the matcher again.
 *
 * Event-type cheatsheet (from inspecting WC 2022 timelines):
 *   0     Goal (open play)
 *   1     Assist (follows a goal)
 *   2     Yellow card
 *   3     Red card  (assumed from natural numbering — verify on first
 *                   tournament occurrence)
 *   5     Substitution (IdPlayer in, IdSubPlayer out)
 *   6     Penalty Awarded (IdPlayer = pateador, IdTeam = equipo beneficiado)
 *  39     Goal direct from free-kick
 *  41     Goal from penalty (also used for penalty CONVERTED in shootout — see Period)
 *  60     Penalty saved by goalkeeper (shootout only)
 *  65     Penalty missed / off target (shootout only)
 *
 * IMPORTANTE — Type 41 en tanda vs en juego:
 *   FIFA usa el mismo Type 41 para penales convertidos en el juego normal
 *   Y para penales convertidos en la tanda (Period 11). La distinción es el
 *   Period: si Period === 11 (tanda) el evento NO debe sumar al bucket.goals
 *   del jugador (la tanda no cuenta como gol en el fantasy real) y se emite
 *   como 'penalty_goal' en el timeline. Si Period < 11 (juego / ET) sí suma.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, players, playerMatchStats, teams, matchEvents } from '../db/schema/index.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { notifyAdmin } from '../lib/notify-admin.js';
import {
  type FifaLocaleString,
  hasFinalWhistle,
  editDistanceAtMostOne,
  normName,
  parseDescription,
} from '../lib/fifa-parse.js';

const FIFA_BASE = 'https://api.fifa.com/api/v3';
const FIFA_COMPETITION_ID = '17';   // FIFA World Cup
const FIFA_SEASON_ID = '285023';     // WC 2026 (verified empirically)

/**
 * FIFA usa nombres en inglés ("Korea Republic", "Czechia") mientras que
 * nuestra BD tiene nombres en español ("Corea del Sur", "Chequia"). Sin
 * este mapping el resolver no podía ubicar el team y el sync devolvía
 * matched=0 para todos los partidos donde el nombre no era trivialmente
 * el mismo. Codes ISO van primero — son estables y FIFA los publica.
 */
const FIFA_NAME_TO_CODE: Record<string, string> = {
  // Asia
  'korea republic': 'KOR',
  'south korea':    'KOR',
  'dpr korea':      'PRK',
  'north korea':    'PRK',
  'japan':          'JPN',
  'saudi arabia':   'KSA',
  'iran':           'IRN',
  'ir iran':        'IRN',
  'iraq':           'IRQ',
  'qatar':          'QAT',
  'uzbekistan':     'UZB',
  'jordan':         'JOR',
  // Europa
  'germany':        'GER',
  'england':        'ENG',
  'france':         'FRA',
  'spain':          'ESP',
  'netherlands':    'NED',
  'belgium':        'BEL',
  'portugal':       'POR',
  'italy':          'ITA',
  'switzerland':    'SUI',
  'sweden':         'SWE',
  'norway':         'NOR',
  'denmark':        'DEN',
  'iceland':        'ISL',
  'croatia':        'CRO',
  'czechia':        'CZE',
  'czech republic': 'CZE',
  'serbia':         'SRB',
  'poland':         'POL',
  'austria':        'AUT',
  'hungary':        'HUN',
  'romania':        'ROU',
  'greece':         'GRE',
  'scotland':       'SCO',
  'wales':          'WAL',
  'turkey':         'TUR',
  'turkiye':        'TUR',
  'türkiye':        'TUR',
  'finland':        'FIN',
  'slovakia':       'SVK',
  'slovenia':       'SVN',
  'ireland':        'IRL',
  'albania':        'ALB',
  'bosnia and herzegovina': 'BIH',
  'bosnia-herzegovina':     'BIH',
  'georgia':        'GEO',
  // Africa
  'south africa':   'ZAF',
  'rsa':            'ZAF',
  'morocco':        'MAR',
  'senegal':        'SEN',
  'egypt':          'EGY',
  'algeria':        'ALG',
  'tunisia':        'TUN',
  'cameroon':       'CMR',
  'nigeria':        'NGA',
  'ghana':          'GHA',
  'cape verde islands': 'CPV',
  'cape verde':     'CPV',
  "cote d'ivoire":  'CIV',
  'ivory coast':    'CIV',
  // Americas
  'united states':  'USA',
  'usa':            'USA',
  'mexico':         'MEX',
  'brazil':         'BRA',
  'argentina':      'ARG',
  'uruguay':        'URU',
  'colombia':       'COL',
  'chile':          'CHL',
  'peru':           'PER',
  'paraguay':       'PAR',
  'ecuador':        'ECU',
  'canada':         'CAN',
  'costa rica':     'CRC',
  'panama':         'PAN',
  'jamaica':        'JAM',
  'haiti':          'HAI',
  'curacao':        'CUW',
  'curaçao':        'CUW',
  // Africa (resto)
  'congo dr':                          'COD',
  'dr congo':                          'COD',
  'democratic republic of the congo':  'COD',
  // Oceania
  'australia':      'AUS',
  'new zealand':    'NZL',
};

interface FifaTimelineEvent {
  Type: number;
  Period: number;
  IdPlayer?: string | null;
  IdSubPlayer?: string | null;
  IdTeam?: string | null;
  EventDescription?: FifaLocaleString[];
  MatchMinute?: string | null;
}

interface FifaTimelineResponse {
  IdMatch?: string;
  Event?: FifaTimelineEvent[];
}

export interface SyncStatsResult {
  matched: number;
  unmatched: string[];
  upserted: number;
  skipped?: string;
  /** True si la timeline trae el evento "final whistle" (Type 26): el
   *  partido terminó según FIFA, normalmente antes que football-data/ESPN. */
  finalWhistle?: boolean;
}

// Event-type sets. FIFA Type 34 = OwnGoal (acreditado al jugador que marca
// en contra, no al equipo que anota). Lo tratamos separado para mostrarlo
// con ícono distinto y NO sumar al bucket.goals del jugador.
//
// GOAL_TYPES incluye Type 41 (penal convertido) pero la lógica de parseo
// discrimina por Period (11 = tanda de penales) antes de sumar al bucket.
// Ver el comentario en la cabecera del archivo.
const GOAL_TYPES          = new Set([0, 39, 41]);
const OWN_GOAL_TYPES      = new Set([34]);
const ASSIST_TYPES        = new Set([1]);
const YELLOW_TYPES        = new Set([2]);
const RED_TYPES           = new Set([3]);
// Penal cobrado por el árbitro (en juego o tanda). No suma fantasy — solo
// timeline, para mostrar el momento previo al remate.
const PENALTY_AWARDED_TYPES = new Set([6]);
// Tipos nuevos — exclusivos de la tanda de penales (Period 11 en FIFA):
const PENALTY_SAVE_TYPES  = new Set([60]);  // Penal atajado (arquero)
const PENALTY_MISS_TYPES  = new Set([65]);  // Penal errado (fuera/poste)
// FIFA_SHOOTOUT_PERIOD: el número de Period que FIFA asigna a la tanda.
const FIFA_SHOOTOUT_PERIOD = 11;

const inFlight = new Set<number>();

export async function syncFifaStatsForMatch(
  matchId: number,
  opts: { force?: boolean } = {},
): Promise<SyncStatsResult> {
  if (inFlight.has(matchId)) {
    return { matched: 0, unmatched: [], upserted: 0, skipped: 'already in flight' };
  }
  if (!opts.force) {
    const already = await db
      .select({ id: playerMatchStats.id })
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, matchId))
      .limit(1)
      .get();
    if (already) {
      return { matched: 0, unmatched: [], upserted: 0, skipped: 'already synced (use force)' };
    }
  }
  inFlight.add(matchId);
  try {
    return await doSync(matchId);
  } finally {
    inFlight.delete(matchId);
  }
}

// Helpers de parseo puro (editDistanceAtMostOne, normName, parseDescription,
// hasFinalWhistle) se movieron a ../lib/fifa-parse.ts para poder testearlos
// sin arrastrar la capa de DB. Se importan arriba.

interface RosterPlayer {
  id: number;
  name: string;
  teamId: number;
  position: string | null;
  fifaIdPlayer: string | null;
}

async function doSync(matchId: number): Promise<SyncStatsResult> {
  // 1. Load match metadata + FIFA mapping.
  const m = await db
    .select({
      id: matches.id,
      fifaIdMatch: matches.fifaIdMatch,
      fifaIdStage: matches.fifaIdStage,
      status: matches.status,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  if (!m) return { matched: 0, unmatched: [], upserted: 0, skipped: 'match not found' };
  if (!m.fifaIdMatch || !m.fifaIdStage) {
    return { matched: 0, unmatched: [], upserted: 0, skipped: 'fifaIdMatch not mapped — run backfill' };
  }
  // Allow both live and finished. doSync is idempotent (delete+insert on
  // match_events, onConflictDoUpdate on player_match_stats) so repeated
  // ticks during a live match progressively populate the timeline. We
  // refuse scheduled because the FIFA feed has no events yet.
  if (m.status !== 'finished' && m.status !== 'live') {
    return { matched: 0, unmatched: [], upserted: 0, skipped: `match status is ${m.status}` };
  }

  // 2. Fetch the timeline from FIFA.
  const url = `${FIFA_BASE}/timelines/${FIFA_COMPETITION_ID}/${FIFA_SEASON_ID}/${m.fifaIdStage}/${m.fifaIdMatch}?language=en`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    throw new Error(`FIFA timeline returned ${res.status}`);
  }
  const data = (await res.json()) as FifaTimelineResponse;
  const events = data.Event ?? [];
  if (events.length === 0) {
    return { matched: 0, unmatched: [], upserted: 0, skipped: 'no events' };
  }

  // 3. Build a GLOBAL team name/code → id index, then resolve which two
  // teams actually played this match.
  //
  // Two lookups for resolving an event's team:
  //   1. fifa IdTeam (always present on player events) — keyed by the FIFA
  //      team IDs we discover on the fly.
  //   2. country name from the description ("FODEN (England)") for the very
  //      first event of the match before we've cached any FIFA team IDs.
  //
  // Indexamos TODOS los equipos por (a) nombre normalizado de la BD ("méxico"
  // → "mexico"), (b) code ISO ("MEX") y (c) alias en inglés de FIFA mapeados
  // via FIFA_NAME_TO_CODE → code → team_id. Cargamos los 48 equipos (no solo
  // los del match) porque en eliminación el match guarda el placeholder TBD y
  // necesitamos mapear el país real del feed a su team_id — ver más abajo.
  const allTeams = await db
    .select({ id: teams.id, name: teams.name, code: teams.code })
    .from(teams);
  const teamIdByCode = new Map(allTeams.map((t) => [t.code.toUpperCase(), t.id] as const));
  const teamIdByNorm = new Map<string, number>();
  for (const t of allTeams) {
    teamIdByNorm.set(normName(t.name), t.id);
    teamIdByNorm.set(t.code.toLowerCase(), t.id);
  }
  // IMPORTANTE: las keys de FIFA_NAME_TO_CODE están escritas con apóstrofes
  // y acentos ("cote d'ivoire", "türkiye", "curaçao"), pero el lookup posterior
  // aplica normName() al país que llega del feed ("Côte d'Ivoire" →
  // "cote divoire" sin apóstrofe). Sin re-normalizar la key acá los alias
  // con apóstrofe/acento nunca matcheaban — el caso CIV-ECU quedó con goal
  // perdido porque el resolver no pudo mapear "Côte d'Ivoire" a teamId.
  for (const [alias, code] of Object.entries(FIFA_NAME_TO_CODE)) {
    const id = teamIdByCode.get(code);
    if (id != null) teamIdByNorm.set(normName(alias), id);
  }

  // Resolver los DOS equipos participantes. En fase de grupos el match ya
  // trae los IDs reales y los usamos directo. En eliminación los slots son el
  // placeholder 'TBD' (el cuadro arma los equipos por proyección, no escribe
  // matches.home_team_id), así que el roster por esos IDs vendría vacío y
  // NINGÚN evento resolvería jugador → la cronología quedaba en blanco en toda
  // la fase final. En ese caso derivamos los equipos reales del propio feed:
  // contamos los países que aparecen en las descripciones ("MESSI (Argentina)")
  // y nos quedamos con los dos más frecuentes.
  const tbdTeamIds = new Set(
    allTeams.filter((t) => t.code.toUpperCase() === 'TBD').map((t) => t.id),
  );
  const storedTeamIds = [...new Set(
    [m.homeTeamId, m.awayTeamId].filter(
      (id): id is number => id != null && !tbdTeamIds.has(id),
    ),
  )];
  const participantTeamIds = [...storedTeamIds];
  if (participantTeamIds.length < 2) {
    const freq = new Map<number, number>();
    for (const ev of events) {
      const parsed = parseDescription(ev.EventDescription?.[0]?.Description);
      if (!parsed?.country) continue;
      const id = teamIdByNorm.get(normName(parsed.country));
      if (id == null) continue;
      freq.set(id, (freq.get(id) ?? 0) + 1);
    }
    const derived = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    for (const id of derived) {
      if (participantTeamIds.length >= 2) break;
      if (!participantTeamIds.includes(id)) participantTeamIds.push(id);
    }
    if (storedTeamIds.length === 0 && participantTeamIds.length > 0) {
      console.log(
        `[sync-fifa-stats] match ${matchId}: slots TBD en DB → equipos derivados del feed: ` +
        participantTeamIds.map((id) => allTeams.find((t) => t.id === id)?.code ?? id).join(' vs '),
      );
    }
  }

  // Load the participating rosters with their (possibly-cached) FIFA IDs.
  const roster: RosterPlayer[] = participantTeamIds.length
    ? await db
        .select({
          id: players.id,
          name: players.name,
          teamId: players.teamId,
          position: players.position,
          fifaIdPlayer: players.fifaIdPlayer,
        })
        .from(players)
        .where(inArray(players.teamId, participantTeamIds))
    : [];
  const rosterByTeam = new Map<number, RosterPlayer[]>();
  for (const p of roster) {
    const list = rosterByTeam.get(p.teamId) ?? [];
    list.push(p);
    rosterByTeam.set(p.teamId, list);
  }
  const rosterByFifaId = new Map<string, RosterPlayer>();
  for (const p of roster) {
    if (p.fifaIdPlayer) rosterByFifaId.set(p.fifaIdPlayer, p);
  }
  // Lazy-populated as we observe (IdPlayer, IdTeam) pairs.
  const teamIdByFifaIdTeam = new Map<string, number>();

  // 3.5. Pre-scan: rellená teamIdByFifaIdTeam con todos los eventos que
  // traen IdTeam + country en la descripción. Sin esto, eventos sin
  // country procesados ANTES de cualquier evento con country del mismo
  // equipo (ej. "Assisted by R. DE PAUL." es el primer evento de ARG en
  // un partido — viene antes que el goal "MESSI (Argentina) scores!!")
  // no resuelven targetTeamId y se descartan silenciosamente. Order-
  // dependent: el primer no-country de cada equipo se perdía.
  //
  // Además: si vemos un country del feed que NO está en FIFA_NAME_TO_CODE,
  // emitimos un warning. Es la única forma de detectar a tiempo cuando una
  // sub-selección entra al Mundial y nos falta su alias (caso COD "Congo
  // DR"). Sin esto, todos sus goles se pierden en silencio y el equipo
  // termina 0-N en la tabla.
  const unknownCountries = new Set<string>();
  for (const ev of events) {
    if (!ev.IdTeam || teamIdByFifaIdTeam.has(ev.IdTeam)) continue;
    const desc = ev.EventDescription?.[0]?.Description;
    const parsed = parseDescription(desc);
    if (parsed?.country) {
      const id = teamIdByNorm.get(normName(parsed.country));
      if (id != null) {
        teamIdByFifaIdTeam.set(ev.IdTeam, id);
      } else {
        unknownCountries.add(parsed.country);
      }
    }
  }
  if (unknownCountries.size > 0) {
    console.warn(
      `[sync-fifa-stats] match ${matchId}: countries from feed without FIFA_NAME_TO_CODE alias — ` +
      `eventos de estos equipos NO se van a persistir hasta agregar el alias: ${[...unknownCountries].join(', ')}`,
    );
  }

  // 4. Walk events.
  interface Acc {
    goals: number;
    assists: number;
    yellow: number;
    red: boolean;
    played: boolean;
  }
  const stats = new Map<number, Acc>();
  const unmatched: string[] = [];
  const pendingFifaIdInserts = new Map<number, string>();

  function ensureBucket(playerId: number): Acc {
    let b = stats.get(playerId);
    if (!b) {
      b = { goals: 0, assists: 0, yellow: 0, red: false, played: false };
      stats.set(playerId, b);
    }
    return b;
  }

  async function resolvePlayer(ev: FifaTimelineEvent): Promise<RosterPlayer | null> {
    const fifaId = ev.IdPlayer;
    if (fifaId && rosterByFifaId.has(fifaId)) {
      return rosterByFifaId.get(fifaId)!;
    }
    const desc = ev.EventDescription?.[0]?.Description;
    const parsed = parseDescription(desc);
    if (!parsed) return null;

    // Heurística para desambiguar por contexto del evento:
    //  - goles → casi nunca un GK; descarto GKs cuando el candidato
    //    ambiguo es uno (caso "RAÚL Jiménez FWD" vs "RAÚL Rangel GK").
    //  - tarjeta roja a GK puede pasar pero es raro; lo mismo.
    // Asistencias/amarillas dejan todos los candidatos porque cualquiera
    // los puede recibir.
    // Own goals SÍ pueden ser de un GK (arquero que mete en su propio arco),
    // así que no los incluimos en eventDiscardsGK.
    // Heurística de desambiguación por posición:
    //  - goles, rojas, penal errado/convertido → casi nunca un GK. Si hay
    //    un único candidato no-GK, ese gana.
    //  - penal atajado (Type 60) → es el ARQUERO. Invertimos: si hay un
    //    único candidato GK, ese gana (ver bloque de des-ambigüedad abajo).
    //  - asistencias, amarillas, own goals → cualquier posición puede; no filtramos.
    const eventDiscardsGK = GOAL_TYPES.has(ev.Type) || RED_TYPES.has(ev.Type)
      || PENALTY_MISS_TYPES.has(ev.Type);

    // Resolve the team. Three sources in order of confidence:
    //   1. ev.IdTeam → previously-seen mapping in `teamIdByFifaIdTeam`.
    //   2. parsed country ("FODEN (England)") → name match.
    //   3. (no resolution → skip).
    let targetTeamId: number | undefined;
    if (ev.IdTeam && teamIdByFifaIdTeam.has(ev.IdTeam)) {
      targetTeamId = teamIdByFifaIdTeam.get(ev.IdTeam)!;
    } else if (parsed.country) {
      targetTeamId = teamIdByNorm.get(normName(parsed.country));
      // Cache the (IdTeam → ourTeamId) link for subsequent events of this
      // match — including events that lack `country` in the description
      // (like "Assisted by KANE.").
      if (ev.IdTeam && targetTeamId != null) {
        teamIdByFifaIdTeam.set(ev.IdTeam, targetTeamId);
      }
    }
    if (targetTeamId == null) return null;

    const teamRoster = rosterByTeam.get(targetTeamId) ?? [];
    const surnameNorm = normName(parsed.surname);
    // FIFA surname puede tener varias palabras ("HWANG Inbeom", "H G OH").
    // Tomamos el último token como "core surname" para estrategias 3-5.
    const surnameTokens = surnameNorm.split(' ');
    const surnameLast = surnameTokens[surnameTokens.length - 1];
    const surnameFirst = surnameTokens[0];
    // "junior" / "jnr" / "jr" son intercambiables; FIFA suele abreviar.
    // Sin esto, "VINI JR." (FIFA) no matcheaba a "Vinícius Júnior" (DB).
    const canonSuffix = (t: string): string => {
      if (t === 'junior' || t === 'jnr') return 'jr';
      if (t === 'senior' || t === 'snr') return 'sr';
      return t;
    };
    const surnameLastCanon = canonSuffix(surnameLast);
    // Variante "colapsada" del nombre del jugador (guiones eliminados sin
    // espacio): "In-beom" → "inbeom". Resuelve nombres asiáticos donde
    // FIFA omite los guiones que sí están en nuestra BD.
    const collapseHyphen = (s: string): string => {
      const woHyphen = s
        .toLowerCase()
        .normalize('NFD')
         
        .replace(/[̀-ͯ]/g, '')
        .replace(/['’`´ʹ]/g, '')
        .replace(/-/g, '')
        .replace(/[.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return woHyphen;
    };
    // Match estrategias (OR): cualquiera que dispare cuenta.
    //  1. último token del roster == FIFA surname completo (caso "Messi").
    //  2. nombre del roster incluye FIFA surname (caso "Salah" en
    //     "Mohamed Salah").
    //  3. último token del roster == último token de FIFA surname
    //     (recorta nombres del medio: "HWANG Inbeom" → "inbeom" vs
    //     roster last "...beom" tras colapsar guiones).
    //  4. último token de la versión sin guion del roster == último token
    //     de FIFA surname ("Hwang In-beom" → colapsa a "inbeom").
    //  5. primer token del roster == último token de FIFA surname (orden
    //     asiático: el apellido va primero en el roster pero FIFA lo
    //     pone al final: "Oh Hyeon-gyu" + "H G OH").
    //  6. apodo + sufijo "jr/junior": el último token canoniza al mismo
    //     sufijo (Y) Y el primer token de FIFA es prefijo de algún token
    //     del roster. Resuelve "VINI JR." (FIFA) → "Vinícius Júnior" (DB)
    //     sin colisionar con otros "Junior" del mismo plantel — exige
    //     coincidencia de prefijo del nombre corto, no sólo del sufijo.
    //  7. distancia Levenshtein ≤ 1 entre last tokens cuando AMBOS tienen
    //     ≥ 5 chars. Resuelve transliteraciones inconsistentes — caso
    //     "MOHEBBI" (FIFA, persa) vs "Mohebi" (Wikipedia). Restringimos a
    //     palabras largas para evitar "Mota"/"Sota" tipo falso positivo.
    let candidates = teamRoster.filter((rp) => {
      const norm = normName(rp.name);
      const tokens = norm.split(' ');
      const last = tokens[tokens.length - 1];
      const first = tokens[0];
      const collapsed = collapseHyphen(rp.name);
      const collapsedTokens = collapsed.split(' ');
      const collapsedLast = collapsedTokens[collapsedTokens.length - 1];
      const lastCanon = canonSuffix(last);
      const suffixMatch =
        surnameTokens.length >= 2 &&
        surnameLastCanon === 'jr' &&
        lastCanon === 'jr' &&
        surnameFirst.length >= 3 &&
        tokens.some((tok) => tok.startsWith(surnameFirst));
      const fuzzyMatch =
        surnameLast.length >= 5 &&
        last.length >= 5 &&
        Math.abs(surnameLast.length - last.length) <= 1 &&
        editDistanceAtMostOne(surnameLast, last);
      return (
        last === surnameNorm
        || norm.includes(surnameNorm)
        || last === surnameLast
        || collapsedLast === surnameLast
        || first === surnameLast
        || suffixMatch
        || fuzzyMatch
      );
    });
    if (candidates.length === 0) return null;
    // Desambiguar con la heurística de posición: si el evento es un gol
    // o roja y hay un solo no-GK entre los candidatos, ese gana.
    if (candidates.length > 1 && eventDiscardsGK) {
      const nonGK = candidates.filter((c) => c.position !== 'GK');
      if (nonGK.length === 1) candidates = nonGK;
    }
    // Caso inverso: penal atajado → el jugador ES el arquero. Si hay un único
    // GK entre los candidatos, ese gana (descartamos no-GK).
    if (candidates.length > 1 && PENALTY_SAVE_TYPES.has(ev.Type)) {
      const gk = candidates.filter((c) => c.position === 'GK');
      if (gk.length === 1) candidates = gk;
    }
    // Desambiguar por nombre completo cuando FIFA prefija con nombre o
    // inicial. Caso típico: "Diego GOMEZ (Paraguay)" con dos GOMEZ en
    // el plantel (Diego MID, Gustavo DEF). El first FIFA token ("diego")
    // identifica al único. Funciona también con iniciales — "G. GOMEZ"
    // → first="g", se descarta "Diego" (no startsWith) y queda "Gustavo".
    if (candidates.length > 1 && surnameTokens.length >= 2 && surnameFirst.length >= 1) {
      const byFirst = candidates.filter((c) => {
        const cf = normName(c.name).split(' ')[0];
        return cf === surnameFirst || cf.startsWith(surnameFirst) || surnameFirst.startsWith(cf);
      });
      if (byFirst.length === 1) candidates = byFirst;
    }
    if (candidates.length > 1) {
      // Ambiguous (Williams brothers, Hernández brothers, …): refuse.
      // Surface in unmatched so the admin can patch fifaIdPlayer manually.
      unmatched.push(`ambiguous:${parsed.country ?? ev.IdTeam}:${parsed.surname}`);
      return null;
    }
    const winner = candidates[0];
    // Cache the FIFA id for future events / matches.
    if (fifaId && !winner.fifaIdPlayer) {
      pendingFifaIdInserts.set(winner.id, fifaId);
      winner.fifaIdPlayer = fifaId;
      rosterByFifaId.set(fifaId, winner);
    }
    return winner;
  }

  // Eventos individuales con minuto — para el timeline en la UI.
  // Incluye gol/asist/amarilla/roja + sustituciones + eventos de tanda.
  interface TimelineEvent {
    playerId: number;
    teamId: number;
    type: 'goal' | 'own_goal' | 'assist' | 'yellow' | 'red' | 'sub_in' | 'sub_out' | 'penalty_awarded' | 'penalty_miss' | 'penalty_save' | 'penalty_goal';
    minute: number | null;
    period: number | null;
  }
  const timeline: TimelineEvent[] = [];
  // Contador de eventos de la tanda de penales (Period 11). FIFA no publica
  // MatchMinute para la tanda, así que varios penales del mismo jugador (un
  // arquero que ataja 2, p.ej.) colisionarían en la clave natural de dedupe
  // (type:minute:period:playerId) y el 2do se perdería. Le damos a cada evento
  // de tanda un minuto sintético incremental como desempate estable — la UI
  // muestra 'Penales' (no el número), así que no afecta la pantalla.
  let shootoutSeq = 0;

  function parseMinute(raw: string | null | undefined): number | null {
    if (!raw) return null;
    // FIFA emite "45+3'" o "67'" — extraemos el número base y le sumamos
    // los descuentos si vienen.
    const m = raw.match(/(\d+)(?:\+(\d+))?/);
    if (!m) return null;
    return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
  }

  for (const ev of events) {
    const player = await resolvePlayer(ev);
    if (!player) {
      // For events without a player resolution (period markers, generic
      // fouls without a body, ...) just skip silently.
      if (ev.IdPlayer || (ev.EventDescription && ev.EventDescription[0]?.Description)) {
        const desc = ev.EventDescription?.[0]?.Description ?? `Type ${ev.Type}`;
        unmatched.push(desc.slice(0, 80));
      }
      continue;
    }
    const bucket = ensureBucket(player.id);
    bucket.played = true;
    let eventType: TimelineEvent['type'] | null = null;
    if (GOAL_TYPES.has(ev.Type)) {
      // FIFA usa Type 41 tanto para penales en juego (Period < 11) como para
      // penales convertidos en la tanda (Period 11). La tanda NO suma al
      // bucket.goals del jugador porque en el fantasy real la tanda no cuenta
      // como gol (los puntos de gol ya los otorgaron los que marcaron en 90'+30').
      // Para la UI emitimos 'penalty_goal' en vez de 'goal' para que la
      // cronología de la definición quede completa y simétrica.
      if (ev.Type === 41 && ev.Period === FIFA_SHOOTOUT_PERIOD) {
        eventType = 'penalty_goal';
        // No incrementamos bucket.goals — la tanda no suma fantasy.
      } else {
        bucket.goals += 1;
        eventType = 'goal';
      }
    }
    // Own goals NO suman al bucket.goals del jugador (el gol va al marcador
    // del equipo contrario, que ya maneja sync-scores). Solo se registran
    // en el timeline para mostrarlo con ícono propio (⚽ (OG)).
    else if (OWN_GOAL_TYPES.has(ev.Type)) { eventType = 'own_goal'; }
    else if (ASSIST_TYPES.has(ev.Type)) { bucket.assists += 1; eventType = 'assist'; }
    else if (YELLOW_TYPES.has(ev.Type)) { bucket.yellow += 1; eventType = 'yellow'; }
    else if (RED_TYPES.has(ev.Type)) { bucket.red = true; eventType = 'red'; }
    // Penal atajado — se acredita al arquero que ataja (IdPlayer en el evento).
    // No modifica ningún bucket de stats fantasy; solo alimenta el timeline.
    else if (PENALTY_SAVE_TYPES.has(ev.Type)) { eventType = 'penalty_save'; }
    // Penal errado (fuera, al poste) — se acredita al jugador que pateó.
    // No modifica ningún bucket de stats fantasy; solo alimenta el timeline.
    else if (PENALTY_MISS_TYPES.has(ev.Type)) { eventType = 'penalty_miss'; }
    // Penal cobrado por el árbitro — se acredita al pateador (IdPlayer).
    // No modifica ningún bucket fantasy; alimenta el timeline para mostrar
    // la secuencia "penal cobrado → gol/errado/atajado".
    else if (PENALTY_AWARDED_TYPES.has(ev.Type)) { eventType = 'penalty_awarded'; }

    // FIFA usa números impares para fases de juego (3=1T, 5=2T, 7=ET1,
    // 9=ET2, 11=penales) y números pares para los "intermedios"
    // (4=entretiempo, 6=antes de alargue, 8=entre ET1/ET2, 10=antes de
    // penales). Mapeamos los intermedios al inicio de la fase siguiente
    // con un minuto sintético, así los subs/eventos del HT no quedan con
    // `period=null minute=null` y la UI los puede ordenar correctamente
    // en lugar de mostrarlos arriba de todo con un `?`.
    const fifaPeriod = ev.Period ?? null;
    const normalizedPeriod =
      fifaPeriod === 3 ? 1
      : fifaPeriod === 5 ? 2
      : fifaPeriod === 7 ? 3
      : fifaPeriod === 9 ? 4
      : fifaPeriod === 11 ? 5
      : fifaPeriod === 4 ? 2  // entretiempo → inicio del 2T
      : fifaPeriod === 6 ? 3  // antes de ET → inicio ET1
      : fifaPeriod === 8 ? 4  // entre ET1/ET2 → inicio ET2
      : fifaPeriod === 10 ? 5 // antes de penales → fase penales
      : null;
    const parsedMinute = parseMinute(ev.MatchMinute);
    // Si FIFA no publicó MatchMinute (típico de subs/eventos durante un
    // intermedio), inferimos un minuto sintético consistente con la fase
    // mapeada arriba para que el sort cronológico lo coloque bien.
    const syntheticMinute =
      parsedMinute == null && fifaPeriod === 4 ? 45  // HT subs caen al inicio del 2T
      : parsedMinute == null && fifaPeriod === 6 ? 90 // pre-ET cae al inicio del ET1
      : parsedMinute == null && fifaPeriod === 8 ? 105 // pre-ET2 cae al inicio del ET2
      : parsedMinute == null && fifaPeriod === 10 ? 120 // pre-penales cae al inicio de los penales
      : null;
    // Fallback para eventos sin período (fifaPeriod=null): si hay MatchMinute
    // lo usamos para inferir el período. Sin minuto ni período se ubican al
    // final de ET2 (120') — el momento más tardío antes de penales y el más
    // conservador para una sub cuyo contexto exacto FIFA no reportó.
    const inferredPeriodFromMinute =
      parsedMinute != null && fifaPeriod == null
        ? parsedMinute <= 45 ? 1
          : parsedMinute <= 90 ? 2
          : parsedMinute <= 105 ? 3
          : 4
        : null;
    const resolvedPeriod = normalizedPeriod ?? inferredPeriodFromMinute;
    const resolvedMinute =
      fifaPeriod === FIFA_SHOOTOUT_PERIOD ? 120 + shootoutSeq++
      : parsedMinute ?? syntheticMinute ?? (fifaPeriod == null && parsedMinute == null ? 120 : null);
    if (eventType) {
      timeline.push({
        playerId: player.id,
        teamId: player.teamId,
        type: eventType,
        minute: resolvedMinute,
        period: resolvedPeriod,
      });
    }

    // Type 5 substitution — sub-in (IdPlayer) and sub-out (IdSubPlayer).
    // Emitimos dos eventos de timeline (sub_in + sub_out) y marcamos como
    // played al sub-out (que puede no tener otros eventos en el feed).
    if (ev.Type === 5) {
      // sub_in: el jugador principal ya resuelto arriba es el que entra
      timeline.push({
        playerId: player.id,
        teamId: player.teamId,
        type: 'sub_in',
        minute: resolvedMinute,
        period: resolvedPeriod,
      });

      let subOut: RosterPlayer | null = null;
      if (ev.IdSubPlayer && rosterByFifaId.has(ev.IdSubPlayer)) {
        subOut = rosterByFifaId.get(ev.IdSubPlayer)!;
      } else {
        // Formato canónico in-play:
        //   "ROBERTS (in) comes off the bench to replace N WILLIAMS (out) (Wales)"
        // Formato del HT sub (sin sufijo (out) ni country):
        //   "Before the second half begins MOLINA (in) comes off the bench
        //    to replace MONTIEL"
        // Aceptamos ambos: "(out)" opcional y captura hasta el primero de
        // ese marcador, paréntesis siguiente, o fin de línea.
        const desc = ev.EventDescription?.[0]?.Description ?? '';
        const m = desc.match(/replace\s+([A-ZÁÉÍÓÚÑÜÇA-zÀ-ÿ' .-]+?)\s*(?:\(out\)|\(|$)/i);
        if (m && ev.IdTeam && teamIdByFifaIdTeam.has(ev.IdTeam)) {
          const teamRoster = rosterByTeam.get(teamIdByFifaIdTeam.get(ev.IdTeam)!) ?? [];
          const outNorm = normName(m[1]);
          const cands = teamRoster.filter((rp) => {
            const tokens = normName(rp.name).split(' ');
            return tokens[tokens.length - 1] === outNorm || normName(rp.name).includes(outNorm);
          });
          if (cands.length === 1) {
            subOut = cands[0];
            if (ev.IdSubPlayer && !subOut.fifaIdPlayer) {
              pendingFifaIdInserts.set(subOut.id, ev.IdSubPlayer);
              subOut.fifaIdPlayer = ev.IdSubPlayer;
              rosterByFifaId.set(ev.IdSubPlayer, subOut);
            }
          }
        }
      }
      if (subOut) {
        ensureBucket(subOut.id).played = true;
        timeline.push({
          playerId: subOut.id,
          teamId: subOut.teamId,
          type: 'sub_out',
          minute: resolvedMinute,
          period: resolvedPeriod,
        });
      }
    }
  }

  // 5. Persist cached FIFA player IDs (lazy mapping).
  for (const [playerId, fifaId] of pendingFifaIdInserts) {
    try {
      await db
        .update(players)
        .set({ fifaIdPlayer: fifaId })
        .where(eq(players.id, playerId));
    } catch (err) {
      console.warn(`[sync-fifa-stats] failed caching fifaIdPlayer for player ${playerId}:`, err);
    }
  }

  // 6. Reconciliar timeline de eventos. ANTES: borrábamos todo e
  // insertábamos de nuevo cada tick. Eso era barato pero rompía los
  // IDs en cada corrida — el frontend usa el id como key de React, así
  // que cada poll en vivo remontaba toda la lista (perdía animaciones,
  // hover, scroll). AHORA: usamos una clave natural y solo escribimos
  // los deltas, así los eventos que no cambian preservan su id.
  //
  // La clave natural (type, minute, period, playerId) NO está enforced
  // en la DB como UNIQUE. Sería ideal pero requiere migración. Dedupea
  // en memoria — colisiones reales (mismo jugador, mismo minuto, mismo
  // tipo, mismo período) son indistinguibles para el usuario.
  type FpKey = string;
  const fp = (e: { type: string; minute: number | null; period: number | null; playerId: number }): FpKey =>
    `${e.type}:${e.minute ?? 'n'}:${e.period ?? 'n'}:${e.playerId}`;

  const existing = await db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId));
  const existingByKey = new Map(existing.map((e) => [fp(e), e]));
  const newByKey = new Map<FpKey, TimelineEvent>();
  for (const e of timeline) {
    // Las colisiones de fp en el feed mismo (raras) colapsan acá; nos
    // quedamos con la primera ocurrencia.
    if (!newByKey.has(fp(e))) newByKey.set(fp(e), e);
  }

  const toInsert: TimelineEvent[] = [];
  for (const [key, ev] of newByKey) {
    if (!existingByKey.has(key)) toInsert.push(ev);
  }
  const toDelete: number[] = [];
  for (const [key, row] of existingByKey) {
    if (!newByKey.has(key)) toDelete.push(row.id);
  }

  if (toInsert.length > 0) {
    await db.insert(matchEvents).values(
      toInsert.map((e) => ({
        matchId,
        playerId: e.playerId,
        teamId: e.teamId,
        type: e.type,
        minute: e.minute,
        period: e.period,
      })),
    );
  }
  if (toDelete.length > 0) {
    await db.delete(matchEvents).where(inArray(matchEvents.id, toDelete));
  }

  // 6.5. Calcular currentMinute (último MatchMinute de FIFA, con stoppage
  // crudo) y detectar cooling break del feed. FIFA emite eventos tipo
  // "Match paused for a hydration break" / "Match resumed after
  // interruption" sin Type específico (varían). El liveStatus pasa a
  // 'cooling_break' si el último paused/resumed fue paused. Si el partido
  // termina (Type 26 "The final whistle sounds") no tocamos liveStatus
  // — eso lo manejan sync-scores y reconcile.
  if (m.status === 'live') {
    const updates: { currentMinute?: string | null; liveStatus?: string } = {};
    // Recorremos events EN ORDEN para que el último gana.
    let latestMinute: string | null = null;
    let coolingBreakActive = false;
    let coolingBreakSeen = false;
    for (const ev of events) {
      if (ev.MatchMinute) latestMinute = ev.MatchMinute;
      const desc = (ev.EventDescription?.[0]?.Description ?? '').toLowerCase();
      if (desc.includes('hydration break') || desc.includes('cooling break')) {
        coolingBreakActive = true;
        coolingBreakSeen = true;
      } else if (
        coolingBreakActive &&
        (desc.includes('match resumed') || desc.includes('resumed after interruption'))
      ) {
        coolingBreakActive = false;
      }
    }
    if (latestMinute) updates.currentMinute = latestMinute;
    // Cooling break tiene prioridad porque half_time es más persistente
    // y suele venir del feed de scores; cooling es siempre transitorio
    // y solo FIFA lo publica. Cuando termina (seen pero inactive) reseteamos
    // a 'in_play' para que sync-scores no deba encargarse de esto.
    if (coolingBreakSeen) {
      updates.liveStatus = coolingBreakActive ? 'cooling_break' : 'in_play';
    }
    if (Object.keys(updates).length > 0) {
      await db.update(matches).set(updates).where(eq(matches.id, matchId));
    }
  }

  // 7. Upsert player_match_stats.
  let upserted = 0;
  for (const [playerId, b] of stats) {
    await db
      .insert(playerMatchStats)
      .values({
        matchId,
        playerId,
        played: b.played,
        goals: b.goals,
        assists: b.assists,
        yellowCards: Math.min(2, b.yellow),
        redCard: b.red,
      })
      .onConflictDoUpdate({
        target: [playerMatchStats.matchId, playerMatchStats.playerId],
        set: {
          played: b.played,
          goals: b.goals,
          assists: b.assists,
          yellowCards: Math.min(2, b.yellow),
          redCard: b.red,
        },
      });
    upserted++;
  }

  // 8. Trigger fantasy recompute when we wrote something.
  if (upserted > 0) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      console.error('[sync-fifa-stats] fantasy recompute failed:', err);
    }
  }

  // 9. Surface roster-drift errors to the admin via push. Live matches
  // run this every 90s of cron — without a cooldown a single broken
  // matcher fires 30+ identical notifications across a single match.
  // 1h cooldown per matchId is enough to alert once and not spam.
  if (unmatched.length > 5) {
    console.error(
      `[sync-fifa-stats] match ${matchId}: ${unmatched.length} unmatched events. ` +
      `First few: ${unmatched.slice(0, 5).join('; ')}`,
    );
    if (shouldNotify(matchId, 'unmatched')) {
      notifyAdmin(
        '⚠️ Stats sync con problemas',
        `Match ${matchId}: ${unmatched.length} eventos sin resolver. Revisá logs.`,
      ).catch((err) => console.error('[sync-fifa-stats] notify failed:', err));
    }
  } else if (events.length > 50 && upserted === 0) {
    // Sanity: a real WC match has ~150-200 events. Zero upserts means the
    // resolver couldn't match anyone — usually a roster drift.
    if (shouldNotify(matchId, 'zero-upserts')) {
      notifyAdmin(
        '🚨 Stats sync no escribió nada',
        `Match ${matchId}: ${events.length} eventos FIFA pero 0 stats persistidas. Revisá.`,
      ).catch((err) => console.error('[sync-fifa-stats] notify failed:', err));
    }
  }

  return { matched: stats.size, unmatched, upserted, finalWhistle: hasFinalWhistle(events) };
}

const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;
const lastNotifiedAt = new Map<string, number>();
function shouldNotify(matchId: number, kind: string): boolean {
  const key = `${matchId}:${kind}`;
  const now = Date.now();
  const last = lastNotifiedAt.get(key) ?? 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return false;
  lastNotifiedAt.set(key, now);
  return true;
}
