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
import { calculatePoints, scoringResult } from '../lib/scoring.js';
import {
  isPlaceholderMatch,
  normalizeEspnCode,
  resolveCompetitors,
  resolveShootoutScore,
  shouldRescorePredictions,
} from '../lib/score-sync.js';
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

type OurStatus = 'scheduled' | 'live' | 'finished' | 'suspended';
type OurLiveStatus =
  | 'in_play'
  | 'half_time'
  | 'extra_time'
  | 'extra_time_break'
  | 'penalty_shootout'
  | 'full_time'
  | null;

function mapState(
  state: 'pre' | 'in' | 'post',
  completed: boolean,
  typeName?: string,
): OurStatus {
  if (completed || state === 'post') return 'finished';
  // ESPN expone la interrupción por el nombre del status, no por `state`
  // (durante una demora por tormenta el estado puede seguir siendo "in").
  // STATUS_SUSPENDED / STATUS_POSTPONED / STATUS_CANCELED / STATUS_ABANDONED /
  // STATUS_DELAYED / STATUS_RAIN_DELAY → 'suspended'.
  const n = (typeName ?? '').toUpperCase();
  if (n.includes('SUSPEND') || n.includes('POSTPON') || n.includes('CANCEL') ||
      n.includes('ABANDON') || n.includes('DELAY')) return 'suspended';
  if (state === 'in') return 'live';
  return 'scheduled';
}

/**
 * Deriva el sub-estado a partir del `status.type.name` de ESPN. Los nombres
 * que vimos en partidos en vivo de WC y otros torneos:
 *   STATUS_FIRST_HALF / STATUS_SECOND_HALF / STATUS_IN_PROGRESS → in_play
 *   STATUS_HALFTIME / STATUS_END_PERIOD                         → half_time
 *   STATUS_END_OF_EXTRATIME / STATUS_HALFTIME_EXTRA             → extra_time_break
 *   STATUS_FIRST_EXTRA / STATUS_SECOND_EXTRA / STATUS_OVERTIME  → extra_time
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
  // Alargue jugándose (no la pausa entre ET1/ET2, ya cubierta arriba).
  if (n.includes('EXTRA') || n === 'STATUS_OVERTIME') return 'extra_time';
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
  scoreLocked: boolean;
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

  // Loose: kickoff only, but only when a single DB match shares the slot —
  // and never a KO placeholder row (Gotcha #16). Placeholders have no team
  // code to disambiguate with, so kickoff-only matching would silently
  // attach an unrelated fixture's score. Those rows are FIFA-live's
  // responsibility exclusively (sync-fifa-stats.ts).
  const sameSlot = ourMatches.filter(
    (m) => !isPlaceholderMatch(m) && Math.abs(new Date(m.kickoffUtc).getTime() - espnTime) <= TEN_MIN,
  );
  return sameSlot.length === 1 ? sameSlot[0] : undefined;
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
      scoreLocked: matches.scoreLocked,
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
    scoreLocked: m.scoreLocked === 1,
  }));

  for (const event of events) {
    try {
      const ourMatch = findMatch(ourMatches, event);
      if (!ourMatch) continue;

      const { state, completed, name: typeName } = event.status.type;
      const newStatus = mapState(state, completed, typeName);
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
      const detail = (event.status.type as { detail?: string; description?: string }).detail
        ?? (event.status.type as { description?: string }).description
        ?? '';
      const shootout = resolveShootoutScore(newStatus, newHomeScore, newAwayScore, {
        detail,
        homeWinnerFlag: (homeComp as unknown as { winner?: boolean })?.winner === true,
        awayWinnerFlag: (awayComp as unknown as { winner?: boolean })?.winner === true,
        alreadyFinished: ourMatch.status === 'finished',
      });
      newHomeScore = shootout.homeScore;
      newAwayScore = shootout.awayScore;
      const shootoutWinnerUnknown = shootout.shootoutWinnerUnknown;

      // Si ya marcamos el partido finished (ej. por el final whistle de FIFA,
      // que se adelanta a ESPN ~10 min), un tick de ESPN que todavía reporta
      // 'live' NO debe des-finalizarlo. Mantenemos finished/full_time; las
      // correcciones de score de abajo siguen aplicando.
      const downgradeBlocked = ourMatch.status === 'finished' && newStatus !== 'finished';
      // Hold pegajoso de 'suspended' (ver sync-scores): una vez suspendido el
      // feed no lo rebota a 'live'; solo lo libera un 'finished' o el admin.
      const suspendedHold = ourMatch.status === 'suspended' && newStatus !== 'finished';
      const effStatus = suspendedHold
        ? 'suspended'
        : shootoutWinnerUnknown
          ? 'live'
          : downgradeBlocked ? 'finished' : newStatus;
      const effLiveStatus = suspendedHold
        ? null
        : shootoutWinnerUnknown
          ? (ourMatch.liveStatus ?? 'in_play')
          : downgradeBlocked ? (ourMatch.liveStatus ?? 'full_time') : newLiveStatus;

      // Admin-locked score → the feed must not move it (see sync-scores).
      const statusChanged = ourMatch.status !== effStatus;
      const scoreChanged  = !ourMatch.scoreLocked &&
        (ourMatch.homeScore !== newHomeScore || ourMatch.awayScore !== newAwayScore);
      const liveStatusChanged = ourMatch.liveStatus !== effLiveStatus;
      if (!statusChanged && !scoreChanged && !liveStatusChanged) continue;

      const updatePayload: Record<string, unknown> = { status: effStatus, liveStatus: effLiveStatus };
      if (!ourMatch.scoreLocked) {
        if (newHomeScore !== null) updatePayload.homeScore = newHomeScore;
        if (newAwayScore !== null) updatePayload.awayScore = newAwayScore;
        // El bump del ganador de la tanda implica definición por penales: lo
        // marcamos para que el cuadro/lista anoten "(pen.)" sin el timeline.
        // También bloqueamos el score (scoreLocked) para que ticks posteriores
        // de ESPN — que siempre devuelven el score de reglamento sin el +1 —
        // no reviertan el bump una vez aplicado.
        if (shootout.decidedByPenalties) {
          updatePayload.decidedByPenalties = 1;
          updatePayload.scoreLocked = 1;
        }
      }

      const [updatedMatch] = await db
        .update(matches)
        .set(updatePayload)
        .where(eq(matches.id, ourMatch.id))
        .returning();

      synced++;

      // Score predictions when match finishes. Skip while holding a shootout
      // whose winner ESPN hasn't published — scoring a tied KO would credit
      // the wrong predictors.
      // Pass `effStatus`, not the raw feed `newStatus`: a match already closed
      // by the FIFA final whistle (downgradeBlocked → effStatus 'finished')
      // whose score the feed later corrects must be re-scored, otherwise the
      // 3-0 correction lands while a 2-0 prediction stays frozen at 5 pts.
      // `statusChanged || scoreChanged` avoids re-scoring idle finished ticks.
      if ((statusChanged || scoreChanged) && shouldRescorePredictions({
        newStatus: effStatus,
        shootoutWinnerUnknown,
        scoreLocked: ourMatch.scoreLocked,
        homeScore: newHomeScore,
        awayScore: newAwayScore,
      })) {
        anyMatchFinished = true;
        const matchPredictions = await db.select().from(predictions).where(eq(predictions.matchId, ourMatch.id));
        // Penales → empate de reglamento para la puntuación (el bump del score
        // solo define quién avanza en el cuadro). No-op si no fue por penales.
        // shouldRescorePredictions guarantees both scores are non-null here.
        const scored = scoringResult({
          homeScore: newHomeScore!,
          awayScore: newAwayScore!,
          decidedByPenalties: shootout.decidedByPenalties,
        });
        for (const pred of matchPredictions) {
          const pts = calculatePoints(
            { homeScore: pred.homeScore, awayScore: pred.awayScore },
            scored,
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
