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
 *  39     Goal direct from free-kick
 *  41     Goal from penalty
 */
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, players, playerMatchStats, teams, matchEvents } from '../db/schema/index.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { notifyAdmin } from '../lib/notify-admin.js';

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
  'algeria':        'DZA',
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
  // Oceania
  'australia':      'AUS',
  'new zealand':    'NZL',
};

interface FifaLocaleString {
  Locale: string;
  Description: string;
}

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
}

// Event-type sets. FIFA Type 34 = OwnGoal (acreditado al jugador que marca
// en contra, no al equipo que anota). Lo tratamos separado para mostrarlo
// con ícono distinto y NO sumar al bucket.goals del jugador.
const GOAL_TYPES     = new Set([0, 39, 41]);
const OWN_GOAL_TYPES = new Set([34]);
const ASSIST_TYPES   = new Set([1]);
const YELLOW_TYPES   = new Set([2]);
const RED_TYPES      = new Set([3]);

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

function normName(s: string): string {
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
function parseDescription(desc: string | undefined): { surname: string; country: string | null } | null {
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
  if (m.status !== 'finished') {
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

  // 3. Load home + away rosters with their (possibly-cached) FIFA IDs.
  const teamIds = [m.homeTeamId, m.awayTeamId].filter((id): id is number => id != null);
  const roster: RosterPlayer[] = await db
    .select({
      id: players.id,
      name: players.name,
      teamId: players.teamId,
      position: players.position,
      fifaIdPlayer: players.fifaIdPlayer,
    })
    .from(players)
    .where(inArray(players.teamId, teamIds));
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

  // Two lookups for resolving an event's team:
  //   1. fifa IdTeam (always present on player events) — keyed by our match's
  //      home/away pair via the FIFA team IDs we discover on the fly.
  //   2. country name from the description ("FODEN (England)") for the very
  //      first event of the match before we've cached any FIFA team IDs.
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, code: teams.code })
    .from(teams)
    .where(inArray(teams.id, teamIds));
  // Indexamos por (a) nombre normalizado de la BD ("méxico" → "mexico"),
  // (b) code ISO ("MEX") y (c) alias en inglés de FIFA mapeados via
  // FIFA_NAME_TO_CODE → code → team_id. Sin (b) y (c) los partidos con
  // nombres distintos entre español/inglés terminaban con matched=0.
  const teamIdByCode = new Map(teamRows.map((t) => [t.code.toUpperCase(), t.id] as const));
  const teamIdByNorm = new Map<string, number>();
  for (const t of teamRows) {
    teamIdByNorm.set(normName(t.name), t.id);
    teamIdByNorm.set(t.code.toLowerCase(), t.id);
  }
  for (const [aliasNorm, code] of Object.entries(FIFA_NAME_TO_CODE)) {
    const id = teamIdByCode.get(code);
    if (id != null) teamIdByNorm.set(aliasNorm, id);
  }
  // Lazy-populated as we observe (IdPlayer, IdTeam) pairs.
  const teamIdByFifaIdTeam = new Map<string, number>();

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
    const eventDiscardsGK = GOAL_TYPES.has(ev.Type) || RED_TYPES.has(ev.Type);

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
    // Variante "colapsada" del nombre del jugador (guiones eliminados sin
    // espacio): "In-beom" → "inbeom". Resuelve nombres asiáticos donde
    // FIFA omite los guiones que sí están en nuestra BD.
    const collapseHyphen = (s: string): string => {
      const woHyphen = s
        .toLowerCase()
        .normalize('NFD')
        // eslint-disable-next-line no-misleading-character-class
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
    let candidates = teamRoster.filter((rp) => {
      const norm = normName(rp.name);
      const tokens = norm.split(' ');
      const last = tokens[tokens.length - 1];
      const first = tokens[0];
      const collapsed = collapseHyphen(rp.name);
      const collapsedTokens = collapsed.split(' ');
      const collapsedLast = collapsedTokens[collapsedTokens.length - 1];
      return (
        last === surnameNorm
        || norm.includes(surnameNorm)
        || last === surnameLast
        || collapsedLast === surnameLast
        || first === surnameLast
      );
    });
    if (candidates.length === 0) return null;
    // Desambiguar con la heurística de posición: si el evento es un gol
    // o roja y hay un solo no-GK entre los candidatos, ese gana.
    if (candidates.length > 1 && eventDiscardsGK) {
      const nonGK = candidates.filter((c) => c.position !== 'GK');
      if (nonGK.length === 1) candidates = nonGK;
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

  // Eventos individuales con minuto — para el timeline en la UI. Solo
  // guardamos gol/asist/amarilla/roja + sustituciones (sub_in/sub_out).
  interface TimelineEvent {
    playerId: number;
    teamId: number;
    type: 'goal' | 'own_goal' | 'assist' | 'yellow' | 'red' | 'sub_in' | 'sub_out';
    minute: number | null;
    period: number | null;
  }
  const timeline: TimelineEvent[] = [];

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
    if (GOAL_TYPES.has(ev.Type)) { bucket.goals += 1; eventType = 'goal'; }
    // Own goals NO suman al bucket.goals del jugador (el gol va al marcador
    // del equipo contrario, que ya maneja sync-scores). Solo se registran
    // en el timeline para mostrarlo con ícono propio (⚽ (OG)).
    else if (OWN_GOAL_TYPES.has(ev.Type)) { eventType = 'own_goal'; }
    else if (ASSIST_TYPES.has(ev.Type)) { bucket.assists += 1; eventType = 'assist'; }
    else if (YELLOW_TYPES.has(ev.Type)) { bucket.yellow += 1; eventType = 'yellow'; }
    else if (RED_TYPES.has(ev.Type)) { bucket.red = true; eventType = 'red'; }

    const fifaPeriod = ev.Period ?? null;
    const normalizedPeriod =
      fifaPeriod === 3 ? 1
      : fifaPeriod === 5 ? 2
      : fifaPeriod === 7 ? 3
      : fifaPeriod === 9 ? 4
      : fifaPeriod === 11 ? 5
      : null;
    const minute = parseMinute(ev.MatchMinute);

    if (eventType) {
      timeline.push({
        playerId: player.id,
        teamId: player.teamId,
        type: eventType,
        minute,
        period: normalizedPeriod,
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
        minute,
        period: normalizedPeriod,
      });

      let subOut: RosterPlayer | null = null;
      if (ev.IdSubPlayer && rosterByFifaId.has(ev.IdSubPlayer)) {
        subOut = rosterByFifaId.get(ev.IdSubPlayer)!;
      } else {
        // "ROBERTS (in) comes off the bench to replace N WILLIAMS (out) (Wales)"
        const desc = ev.EventDescription?.[0]?.Description ?? '';
        const m = desc.match(/replace\s+([A-ZÁÉÍÓÚÑÜÇA-zÀ-ÿ' .-]+?)\s*\(out\)/i);
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
          minute,
          period: normalizedPeriod,
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

  // 6. Reescribir timeline de eventos para este partido. Borramos todos
  // los rows previos y volvemos a insertar — barato porque son ~30 rows
  // por partido y evita lidiar con upserts compuestos sin clave única
  // natural (un jugador puede tener 2 goles en distintos minutos).
  await db.delete(matchEvents).where(eq(matchEvents.matchId, matchId));
  if (timeline.length > 0) {
    await db.insert(matchEvents).values(
      timeline.map((e) => ({
        matchId,
        playerId: e.playerId,
        teamId: e.teamId,
        type: e.type,
        minute: e.minute,
        period: e.period,
      })),
    );
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

  // 7. Trigger fantasy recompute when we wrote something.
  if (upserted > 0) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      console.error('[sync-fifa-stats] fantasy recompute failed:', err);
    }
  }

  if (unmatched.length > 5) {
    console.error(
      `[sync-fifa-stats] match ${matchId}: ${unmatched.length} unmatched events. ` +
      `First few: ${unmatched.slice(0, 5).join('; ')}`,
    );
    // Surface to the admin via push — the alternative is finding out by
    // reading Render logs hours after the match.
    notifyAdmin(
      '⚠️ Stats sync con problemas',
      `Match ${matchId}: ${unmatched.length} eventos sin resolver. Revisá logs.`,
    ).catch((err) => console.error('[sync-fifa-stats] notify failed:', err));
  } else if (events.length > 50 && upserted === 0) {
    // Sanity: a real WC match has ~150-200 events. Zero upserts means the
    // resolver couldn't match anyone — usually a roster drift.
    notifyAdmin(
      '🚨 Stats sync no escribió nada',
      `Match ${matchId}: ${events.length} eventos FIFA pero 0 stats persistidas. Revisá.`,
    ).catch((err) => console.error('[sync-fifa-stats] notify failed:', err));
  }

  return { matched: stats.size, unmatched, upserted };
}
