/**
 * ESPN fallback sync — uses ESPN's unofficial public API.
 * No API key required. Used automatically when football-data.org fails.
 *
 * Endpoint: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD
 *
 * Status mapping:
 *   state "pre"  → scheduled
 *   state "in"   → live  (includes STATUS_IN_PROGRESS, STATUS_HALFTIME, STATUS_END_PERIOD)
 *   state "post" → finished
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions, teams } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../ws/broadcast.js';
import { checkAchievements } from './achievement-service.js';
import { syncFifaStatsForMatch } from './sync-fifa-stats.js';
import type { SyncScoresResult } from './sync-scores.js';

// ─── ESPN response types ──────────────────────────────────────────────────────

interface EspnStatusType {
  name: string;       // 'STATUS_SCHEDULED' | 'STATUS_IN_PROGRESS' | 'STATUS_HALFTIME' | 'STATUS_FINAL' | …
  state: 'pre' | 'in' | 'post';
  completed: boolean;
}

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score: string;      // "0", "1", "2", …  (string even when 0)
  team: {
    displayName: string;
    abbreviation: string;
  };
}

interface EspnEvent {
  id: string;
  date: string;       // ISO 8601 UTC, e.g. "2026-06-11T19:00Z"
  status: { type: EspnStatusType };
  competitions: Array<{ competitors: EspnCompetitor[] }>;
}

interface EspnResponse {
  events?: EspnEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type OurStatus = 'scheduled' | 'live' | 'finished';
type OurLiveStatus =
  | 'in_play'
  | 'half_time'
  | 'extra_time_break'
  | 'penalty_shootout'
  | 'full_time'
  | null;

function mapState(state: 'pre' | 'in' | 'post', completed: boolean): OurStatus {
  if (completed || state === 'post') return 'finished';
  if (state === 'in') return 'live';
  return 'scheduled';
}

/**
 * Deriva el sub-estado a partir del `status.type.name` de ESPN. Los nombres
 * que vimos en partidos en vivo de WC y otros torneos:
 *   STATUS_FIRST_HALF / STATUS_SECOND_HALF / STATUS_IN_PROGRESS → in_play
 *   STATUS_HALFTIME / STATUS_END_PERIOD                         → half_time
 *   STATUS_END_OF_EXTRATIME / STATUS_HALFTIME_EXTRA             → extra_time_break
 *   STATUS_SHOOTOUT                                             → penalty_shootout
 *   STATUS_FINAL / STATUS_FULL_TIME                             → full_time
 * `STATUS_END_PERIOD` también lo emite ESPN entre 1° y 2° tiempo regular,
 * así que lo agrupamos con halftime. Si aparece un nombre nuevo, devolvemos
 * 'in_play' para no romper la UI ("EN VIVO" sigue funcionando).
 */
function mapEspnLiveStatus(typeName: string, state: 'pre' | 'in' | 'post', completed: boolean): OurLiveStatus {
  if (completed || state === 'post') return 'full_time';
  if (state !== 'in') return null;
  const n = typeName.toUpperCase();
  if (n === 'STATUS_HALFTIME' || n === 'STATUS_END_PERIOD') return 'half_time';
  if (n === 'STATUS_END_OF_EXTRATIME' || n === 'STATUS_HALFTIME_EXTRA') return 'extra_time_break';
  if (n === 'STATUS_SHOOTOUT' || n.includes('PENALT')) return 'penalty_shootout';
  return 'in_play';
}

interface OurMatch {
  id: number;
  kickoffUtc: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  liveStatus: string | null;
  homeTeamCode: string;
  awayTeamCode: string;
}

/**
 * ESPN's 3-letter abbreviation → our `teams.code`. Almost all are identical
 * (SUI, BIH, MEX, KOR, …); the handful of exceptions live here. ESPN uses
 * RSA for South Africa where we use ZAF (the same divergence the FIFA
 * backfill handles). Add entries if a match ever logs an unmatched code.
 */
const ESPN_CODE_TO_OURS: Record<string, string> = {
  RSA: 'ZAF', // South Africa
};

function normalizeEspnCode(code: string | undefined | null): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  return ESPN_CODE_TO_OURS[upper] ?? upper;
}

/**
 * Match an ESPN event to our DB row by kickoff window AND team identity.
 *
 * The kickoff-only matcher used to collapse two concurrent same-slot fixtures
 * (FIFA schedules the final group round simultaneously) into the same row.
 * Matching the team codes in either orientation disambiguates them; ESPN may
 * list home/away in the opposite order to us, so we accept both.
 */
function findMatch(ourMatches: OurMatch[], event: EspnEvent): OurMatch | undefined {
  const espnTime = new Date(event.date).getTime();
  const TEN_MIN = 10 * 60 * 1000;
  const comp = event.competitions[0];
  const codeA = normalizeEspnCode(comp?.competitors.find((c) => c.homeAway === 'home')?.team.abbreviation);
  const codeB = normalizeEspnCode(comp?.competitors.find((c) => c.homeAway === 'away')?.team.abbreviation);

  // Strict: kickoff window AND both codes match (either orientation).
  const strict = ourMatches.find((m) => {
    if (Math.abs(new Date(m.kickoffUtc).getTime() - espnTime) > TEN_MIN) return false;
    if (codeA && codeB) {
      return (
        (m.homeTeamCode === codeA && m.awayTeamCode === codeB) ||
        (m.homeTeamCode === codeB && m.awayTeamCode === codeA)
      );
    }
    return false;
  });
  if (strict) return strict;

  // Loose: kickoff only, but only when a single DB match shares the slot.
  const sameSlot = ourMatches.filter(
    (m) => Math.abs(new Date(m.kickoffUtc).getTime() - espnTime) <= TEN_MIN,
  );
  return sameSlot.length === 1 ? sameSlot[0] : undefined;
}

/**
 * Resolve which ESPN competitor is OUR home team and which is OUR away team,
 * by matching team codes — NOT by ESPN's own homeAway flag. ESPN and our DB
 * sometimes disagree on which side is "home"; assigning scores by position
 * would then attach each team's goals to the wrong side. When the codes can't
 * be resolved (missing abbreviations) we fall back to ESPN's orientation.
 */
function resolveCompetitors(
  ourMatch: OurMatch,
  competitors: EspnCompetitor[],
): { home: EspnCompetitor | undefined; away: EspnCompetitor | undefined } {
  const espnHome = competitors.find((c) => c.homeAway === 'home');
  const espnAway = competitors.find((c) => c.homeAway === 'away');
  const codeHome = normalizeEspnCode(espnHome?.team.abbreviation);
  const codeAway = normalizeEspnCode(espnAway?.team.abbreviation);

  if (codeHome && codeAway && ourMatch.homeTeamCode && ourMatch.awayTeamCode) {
    if (codeHome === ourMatch.homeTeamCode && codeAway === ourMatch.awayTeamCode) {
      return { home: espnHome, away: espnAway };
    }
    if (codeHome === ourMatch.awayTeamCode && codeAway === ourMatch.homeTeamCode) {
      // ESPN lists the teams in the opposite order to us → swap so scores
      // land on the correct side.
      return { home: espnAway, away: espnHome };
    }
  }
  // Unresolvable by identity — keep ESPN's orientation as a best effort.
  return { home: espnHome, away: espnAway };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches today's (or any date's) WC matches from ESPN and updates our DB.
 * Returns the same SyncScoresResult shape as syncScores() for consistent logging.
 */
export async function syncScoresFromEspn(date: string): Promise<SyncScoresResult> {
  const errors: string[] = [];
  let synced = 0;
  let anyMatchFinished = false;

  // ESPN's scoreboard endpoint interprets `dates=YYYYMMDD` in Eastern Time
  // (the company's home timezone), NOT in UTC. A WC match kicking off at
  // 02:00 UTC on June 12 is listed under `dates=20260611` (22:00 ET on the
  // 11th) — so passing only the UTC date misses every late-night fixture.
  // We hit BOTH the UTC date and the UTC-prior date and merge.
  const espnDate = date.replace(/-/g, '');
  const dayBefore = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  })();

  async function fetchEspn(d: string): Promise<EspnEvent[]> {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${d}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
    const data = (await res.json()) as EspnResponse;
    return data.events ?? [];
  }

  let events: EspnEvent[];
  try {
    const [a, b] = await Promise.all([fetchEspn(espnDate), fetchEspn(dayBefore).catch(() => [])]);
    // Dedup by event id; a fixture can appear in both windows during the
    // overlap when its kickoff is right at the boundary.
    const byId = new Map<string, EspnEvent>();
    for (const e of [...a, ...b]) byId.set(e.id, e);
    events = [...byId.values()];
  } catch (err) {
    return { synced: 0, errors: [`ESPN fetch failed: ${String(err)}`], matchesChecked: 0 };
  }

  if (events.length === 0) {
    return { synced: 0, errors: [], matchesChecked: 0 };
  }

  // Load our DB matches once, joined with team codes so the matcher can
  // disambiguate concurrent kickoffs and assign scores by team identity.
  const ourMatchesRaw = await db
    .select({
      id: matches.id,
      kickoffUtc: matches.kickoffUtc,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
      liveStatus: matches.liveStatus,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches);
  const allTeams = await db.select({ id: teams.id, code: teams.code }).from(teams);
  const codeById = new Map(allTeams.map((t) => [t.id, t.code.toUpperCase()]));
  const ourMatches: OurMatch[] = ourMatchesRaw.map((m) => ({
    id: m.id,
    kickoffUtc: m.kickoffUtc,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    liveStatus: m.liveStatus,
    homeTeamCode: m.homeTeamId != null ? (codeById.get(m.homeTeamId) ?? '') : '',
    awayTeamCode: m.awayTeamId != null ? (codeById.get(m.awayTeamId) ?? '') : '',
  }));

  for (const event of events) {
    try {
      const ourMatch = findMatch(ourMatches, event);
      if (!ourMatch) continue;

      const { state, completed, name: typeName } = event.status.type;
      const newStatus = mapState(state, completed);
      const newLiveStatus = mapEspnLiveStatus(typeName ?? '', state, completed);

      // Extract scores
      const competition = event.competitions[0];
      if (!competition) continue;

      // Resolve competitors by TEAM IDENTITY, not by ESPN's homeAway flag —
      // homeComp is always OUR home team's competitor (scores + winner flag
      // then land on the correct side even when ESPN lists them flipped).
      const { home: homeComp, away: awayComp } = resolveCompetitors(ourMatch, competition.competitors);

      // During pre-match ESPN may still send "0" — only store scores when live or finished.
      // Also guard against ESPN returning "" or "—" or any non-numeric (it has on past
      // scoreboards), which would otherwise produce NaN and corrupt the row.
      const parseScore = (raw: string | undefined): number | null => {
        if (raw == null) return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
      };
      let newHomeScore = (newStatus !== 'scheduled') ? parseScore(homeComp?.score) : null;
      let newAwayScore = (newStatus !== 'scheduled') ? parseScore(awayComp?.score) : null;
      // ESPN's `competitors[i].score` reports the regulation score even when
      // a knockout was decided by penalties. Without bumping the winner the
      // DB stores e.g. 1-1 and every "empate" predictor scores 5, while the
      // user who actually predicted Argentina-wins gets 0. ESPN exposes the
      // shootout winner via `competition.status.type.detail` or an "OT" /
      // "SO" tag; we use `winner: true` on the competitor object when set.
      // When a knockout went to penalties but ESPN hasn't published WHICH side
      // won yet (the `winner` flag lags the FINISHED status, common on its
      // unofficial scoreboard), closing the match now would persist a tied
      // score and award every "empate" predictor 5 pts while the user who
      // actually picked the winner gets 0. In that case we HOLD the match as
      // live for this tick; a later tick — or football-data, which carries the
      // shootout winner reliably — finalizes it once the winner is known.
      let shootoutWinnerUnknown = false;
      if (newStatus === 'finished' && newHomeScore != null && newAwayScore != null) {
        const detail = (event.status.type as { detail?: string; description?: string }).detail
          ?? (event.status.type as { description?: string }).description
          ?? '';
        const wasShootout = /penalt|shootout|tiros|tanda/i.test(detail);
        if (wasShootout && newHomeScore === newAwayScore) {
          const homeWinnerFlag = (homeComp as unknown as { winner?: boolean })?.winner === true;
          const awayWinnerFlag = (awayComp as unknown as { winner?: boolean })?.winner === true;
          if (homeWinnerFlag && !awayWinnerFlag) newHomeScore += 1;
          else if (awayWinnerFlag && !homeWinnerFlag) newAwayScore += 1;
          // Shootout but no (or contradictory) winner flag yet → don't finalize
          // a tied KO. Only hold while TRANSITIONING into finished; if the
          // match was already finished (e.g. FIFA closed it), leave it be.
          else if (ourMatch.status !== 'finished') shootoutWinnerUnknown = true;
        }
      }

      // Si ya marcamos el partido finished (ej. por el final whistle de FIFA,
      // que se adelanta a ESPN ~10 min), un tick de ESPN que todavía reporta
      // 'live' NO debe des-finalizarlo. Mantenemos finished/full_time; las
      // correcciones de score de abajo siguen aplicando.
      const downgradeBlocked = ourMatch.status === 'finished' && newStatus !== 'finished';
      const effStatus = shootoutWinnerUnknown
        ? 'live'
        : downgradeBlocked ? 'finished' : newStatus;
      const effLiveStatus = shootoutWinnerUnknown
        ? (ourMatch.liveStatus ?? 'in_play')
        : downgradeBlocked ? (ourMatch.liveStatus ?? 'full_time') : newLiveStatus;

      const statusChanged = ourMatch.status !== effStatus;
      const scoreChanged  = ourMatch.homeScore !== newHomeScore || ourMatch.awayScore !== newAwayScore;
      const liveStatusChanged = ourMatch.liveStatus !== effLiveStatus;
      if (!statusChanged && !scoreChanged && !liveStatusChanged) continue;

      const updatePayload: Record<string, unknown> = { status: effStatus, liveStatus: effLiveStatus };
      if (newHomeScore !== null) updatePayload.homeScore = newHomeScore;
      if (newAwayScore !== null) updatePayload.awayScore = newAwayScore;

      const [updatedMatch] = await db
        .update(matches)
        .set(updatePayload)
        .where(eq(matches.id, ourMatch.id))
        .returning();

      synced++;

      // Score predictions when match finishes. Skip while holding a shootout
      // whose winner ESPN hasn't published — scoring a tied KO would credit
      // the wrong predictors.
      if (newStatus === 'finished' && !shootoutWinnerUnknown && newHomeScore !== null && newAwayScore !== null) {
        anyMatchFinished = true;
        const matchPredictions = await db.select().from(predictions).where(eq(predictions.matchId, ourMatch.id));
        for (const pred of matchPredictions) {
          const pts = calculatePoints(
            { homeScore: pred.homeScore, awayScore: pred.awayScore },
            { homeScore: newHomeScore, awayScore: newAwayScore },
          );
          await db.update(predictions).set({ points: pts, updatedAt: sql`(datetime('now'))` }).where(eq(predictions.id, pred.id));
          // Fire the same prediction_scored event the football-data.org
          // sync fires — without this fallback path, no achievements
          // (exact_score, hot_streaks, perfect_group, bullseye_zero, …)
          // would be awarded when ESPN is the active scoring source.
          try {
            await checkAchievements(pred.userId, {
              type: 'prediction_scored',
              matchId: ourMatch.id,
              points: pts,
            });
          } catch (err) {
            errors.push(`Achievement check failed for prediction ${pred.id}: ${String(err)}`);
          }
        }
        // Pull per-player stats for the fantasy module — ONLY on the actual
        // transition into finished, so post-finished score flickers (the
        // penalty bump, ESPN late-marking the winner) don't re-hit
        // API-Football and burn the 100/day quota. Fire-and-forget.
        if (ourMatch.status !== 'finished') syncFifaStatsForMatch(ourMatch.id).catch((err) =>
          console.error(`[sync-espn] FIFA stats sync failed for match ${ourMatch.id}:`, err),
        );
      }

      broadcastMatchUpdate(updatedMatch);
    } catch (err) {
      errors.push(`ESPN event ${event.id}: ${String(err)}`);
    }
  }

  if (anyMatchFinished) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      errors.push(`Fantasy recompute failed: ${String(err)}`);
    }
  }

  return { synced, errors, matchesChecked: events.length };
}
