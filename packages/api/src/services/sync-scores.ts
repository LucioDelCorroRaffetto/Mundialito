// Fetches live/finished match scores from football-data.org and updates our DB.
// API docs: https://www.football-data.org/documentation/quickstart
// Free tier: 10 requests/min, no auth needed for public competitions
// WC 2026 competition ID: "WC" (may need adjustment once tournament starts)

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions, teams } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../ws/broadcast.js';
import { checkAchievements, finalizeFantasyLegends } from './achievement-service.js';
import { syncFifaStatsForMatch } from './sync-fifa-stats.js';

// football-data.org status values
type FdStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'CANCELLED';

type OurStatus = 'scheduled' | 'live' | 'finished' | 'suspended';
type OurLiveStatus =
  | 'in_play'
  | 'half_time'
  | 'extra_time_break'
  | 'penalty_shootout'
  | 'full_time'
  | null;

interface FdScore {
  home: number | null;
  away: number | null;
}

type FdDuration = 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
type FdWinner = 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;

interface FdMatch {
  id: number;
  utcDate: string; // ISO 8601
  status: FdStatus;
  score: {
    fullTime: FdScore;
    halfTime: FdScore;
    extraTime?: FdScore;
    penalties?: FdScore;
    duration?: FdDuration;
    winner?: FdWinner;
  };
  homeTeam: { id: number; tla: string | null; name: string };
  awayTeam: { id: number; tla: string | null; name: string };
}

interface FdResponse {
  matches: FdMatch[];
}

export interface SyncScoresOptions {
  dateFrom?: string; // ISO date string, e.g. '2026-06-11'
  dateTo?: string;   // ISO date string, e.g. '2026-06-11'
}

export interface SyncScoresResult {
  synced: number;
  errors: string[];
  matchesChecked: number;
}

function mapStatus(fdStatus: FdStatus): OurStatus {
  if (fdStatus === 'IN_PLAY' || fdStatus === 'PAUSED') return 'live';
  if (fdStatus === 'FINISHED') return 'finished';
  // Partido interrumpido (clima/seguridad), aplazado o cancelado → 'suspended'.
  // Lo mapeamos a un estado propio (antes caían a 'scheduled', lo que dejaba
  // a reconcile re-arrancándolo a 'live' cada tick) para que el front muestre
  // "Suspendido" y reconcile lo ignore.
  if (fdStatus === 'SUSPENDED' || fdStatus === 'POSTPONED' || fdStatus === 'CANCELLED') return 'suspended';
  // SCHEDULED / TIMED → scheduled.
  return 'scheduled';
}

/**
 * Sub-estado dentro de un partido en curso. football-data.org expone:
 *   IN_PLAY → "in_play" (jugándose, fase exacta no detallada)
 *   PAUSED  → "half_time" (entretiempo o pausa entre ET1/ET2; el feed
 *             no diferencia entre los dos, asumimos entretiempo de
 *             tiempo regular salvo que `duration` indique extra/penales)
 * Cuando `duration` es EXTRA_TIME y status PAUSED, lo etiquetamos
 * extra_time_break (pausa entre los dos tiempos del alargue). Si el feed
 * marca PENALTY_SHOOTOUT como duración con status IN_PLAY, mostramos
 * "penalty_shootout".
 */
function mapLiveStatus(
  fdStatus: FdStatus,
  duration: FdDuration | undefined,
): OurLiveStatus {
  if (fdStatus === 'FINISHED') return 'full_time';
  if (fdStatus === 'PAUSED') {
    return duration === 'EXTRA_TIME' ? 'extra_time_break' : 'half_time';
  }
  if (fdStatus === 'IN_PLAY') {
    return duration === 'PENALTY_SHOOTOUT' ? 'penalty_shootout' : 'in_play';
  }
  return null;
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
 * Resolves the actual final score, including penalty shootouts and extra time.
 * Football-data.org reports `fullTime` as the 90' result; `extraTime` adds
 * +30' goals; `penalties` only carries the shootout. To keep `calculatePoints`
 * unchanged (which compares numeric scores), if the match was decided by
 * penalties we bump the winner by +1 so the home/away delta reflects the
 * actual winner instead of leaving a tied score in the DB.
 *
 * Without this, every knockout decided by shootout would be stored as a draw
 * and:
 *  - users who predicted a draw would get +5 (wrong, the predicted result
 *    wasn't really a draw),
 *  - users who predicted the actual winner would get 0 (worse: they had it
 *    right),
 *  - the bracket / champion picks would silently award everyone who
 *    predicted "draw" with `prophet` if it happened in the final.
 */
function resolveFinalScore(score: FdMatch['score']): { home: number | null; away: number | null } {
  // Prefer extra-time score when present (knockouts that went to ET but
  // didn't reach penalties). Otherwise the canonical fullTime.
  const base = score.extraTime && (score.extraTime.home != null || score.extraTime.away != null)
    ? score.extraTime
    : score.fullTime;
  let home = base.home;
  let away = base.away;
  if (score.duration === 'PENALTY_SHOOTOUT' && score.winner) {
    if (score.winner === 'HOME_TEAM' && home != null) home = home + 1;
    else if (score.winner === 'AWAY_TEAM' && away != null) away = away + 1;
  }
  return { home, away };
}

/**
 * Match our DB row to a football-data row using BOTH kickoff time (±10 min)
 * AND the team three-letter codes. The kickoff-only matcher used to collapse
 * the two simultaneous final-round group matches (FIFA schedules them at the
 * same UTC slot) into the same row, corrupting one of them with the other's
 * score.
 */
function findMatch(
  ourMatches: OurMatch[],
  fdMatch: FdMatch,
): OurMatch | undefined {
  const fdTime = new Date(fdMatch.utcDate).getTime();
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const homeTla = fdMatch.homeTeam.tla?.toUpperCase() ?? null;
  const awayTla = fdMatch.awayTeam.tla?.toUpperCase() ?? null;

  // Pass 1 (strict): kickoff window AND both team codes match. This is the
  // only safe choice when there are concurrent matches in the same slot.
  const strict = ourMatches.find((m) => {
    const diff = Math.abs(new Date(m.kickoffUtc).getTime() - fdTime);
    if (diff > TEN_MINUTES_MS) return false;
    if (homeTla && awayTla) {
      return m.homeTeamCode === homeTla && m.awayTeamCode === awayTla;
    }
    return false;
  });
  if (strict) return strict;

  // Pass 2 (loose): kickoff only, but only if no other DB match shares the
  // same slot. Falls back for cases where the FD payload has no TLA.
  const sameSlot = ourMatches.filter((m) => {
    const diff = Math.abs(new Date(m.kickoffUtc).getTime() - fdTime);
    return diff <= TEN_MINUTES_MS;
  });
  if (sameSlot.length === 1) return sameSlot[0];
  return undefined;
}

export async function syncScores(options: SyncScoresOptions = {}): Promise<SyncScoresResult> {
  const errors: string[] = [];
  let synced = 0;
  let anyMatchFinished = false;

  // --- Build URL ---
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return { synced: 0, errors: ['FOOTBALL_DATA_API_KEY is not set'], matchesChecked: 0 };
  }

  const url = new URL('https://api.football-data.org/v4/competitions/WC/matches');
  if (options.dateFrom) url.searchParams.set('dateFrom', options.dateFrom);
  if (options.dateTo) url.searchParams.set('dateTo', options.dateTo);

  // --- Fetch from football-data.org ---
  let fdMatches: FdMatch[];
  try {
    const response = await fetch(url.toString(), {
      headers: { 'X-Auth-Token': apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        synced: 0,
        errors: [`football-data.org returned ${response.status}: ${text}`],
        matchesChecked: 0,
      };
    }

    const data = (await response.json()) as FdResponse;
    fdMatches = data.matches ?? [];
  } catch (err) {
    return {
      synced: 0,
      errors: [`Failed to fetch from football-data.org: ${String(err)}`],
      matchesChecked: 0,
    };
  }

  if (fdMatches.length === 0) {
    return { synced: 0, errors: [], matchesChecked: 0 };
  }

  // --- Load our matches once, joined with team codes so findMatch can
  // disambiguate concurrent kickoffs by team identity. ---
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

  // --- Process each fd match ---
  for (const fdMatch of fdMatches) {
    try {
      const ourMatch = findMatch(ourMatches, fdMatch);
      if (!ourMatch) continue; // No corresponding match in our DB — skip

      const newStatus = mapStatus(fdMatch.status);
      const newLiveStatus = mapLiveStatus(fdMatch.status, fdMatch.score.duration);
      const resolved = resolveFinalScore(fdMatch.score);
      const newHomeScore = resolved.home;
      const newAwayScore = resolved.away;

      // Si ya marcamos el partido finished (ej. por el final whistle de FIFA,
      // que se adelanta a football-data ~10 min), un tick que todavía reporta
      // 'live' NO debe des-finalizarlo. Mantenemos finished/full_time; las
      // correcciones de score siguen aplicando. (El caso finished→scheduled,
      // que sí limpia scores por POSTPONED, se maneja más abajo aparte.)
      const downgradeBlocked = ourMatch.status === 'finished' && newStatus === 'live';
      // Hold pegajoso del estado 'suspended': una vez suspendido, el feed NO
      // lo saca de 'suspended' tick a tick (durante una demora por tormenta
      // ESPN/football-data pueden seguir reportando IN_PLAY/PAUSED). Solo lo
      // libera un 'finished' terminal (pitazo final, que sí re-scorea) o el
      // override manual del admin. Como reconcile ignora las filas que no son
      // 'live'/'scheduled', esto además bloquea el auto-cierre falso de 3,5 h.
      const suspendedHold = ourMatch.status === 'suspended' && newStatus !== 'finished';
      const effStatus = suspendedHold ? 'suspended' : downgradeBlocked ? 'finished' : newStatus;

      // Check if anything changed. When the score is admin-locked, the feed
      // must NOT move it (football-data once published ESP-KSA 5-0 for a 4-0
      // game), so treat the score as unchanged regardless of what the feed says.
      const statusChanged = ourMatch.status !== effStatus;
      const scoreChanged = !ourMatch.scoreLocked &&
        (ourMatch.homeScore !== newHomeScore || ourMatch.awayScore !== newAwayScore);
      // Guard against spurious feed regressions on a match we already marked
      // finished: if our row is 'finished' and the new payload would un-set
      // full_time (a stray IN_PLAY tick after FT), we keep the existing
      // liveStatus instead of overwriting it.
      const effectiveLiveStatus =
        suspendedHold
          ? null // 'suspended' no tiene sub-estado de juego
          : downgradeBlocked
            ? (ourMatch.liveStatus ?? 'full_time')
            : ourMatch.status === 'finished' && newStatus === 'finished' && newLiveStatus !== 'full_time'
              ? ourMatch.liveStatus
              : newLiveStatus;
      const liveStatusChanged = ourMatch.liveStatus !== effectiveLiveStatus;

      if (!statusChanged && !scoreChanged && !liveStatusChanged) continue;

      const updatePayload: Record<string, unknown> = { status: effStatus, liveStatus: effectiveLiveStatus };
      if (!ourMatch.scoreLocked) {
        if (newHomeScore !== null) updatePayload.homeScore = newHomeScore;
        if (newAwayScore !== null) updatePayload.awayScore = newAwayScore;
      }

      // If a previously-finished match reverts to scheduled (POSTPONED
      // corrections upstream), clear scores and unscore the predictions.
      // ANTES: este branch también disparaba cuando newStatus seguía siendo
      // 'finished' pero el payload no traía scores — y en producción FIFA
      // devolvió varias veces respuestas transicionales sin scores, lo que
      // borró el 2-0 del MEX-ZAF y mandó toda la tabla global a 0. Ahora
      // sólo limpiamos si el nuevo estado es claramente 'scheduled'. Un
      // payload finished sin scores es ruido y se ignora: dejamos los
      // valores que ya tenemos persistidos.
      if (ourMatch.status === 'finished' && newStatus === 'scheduled' && !ourMatch.scoreLocked) {
        updatePayload.homeScore = null;
        updatePayload.awayScore = null;
        updatePayload.liveStatus = null;
        await db
          .update(predictions)
          .set({ points: null, updatedAt: sql`(datetime('now'))` })
          .where(eq(predictions.matchId, ourMatch.id));
      }

      // Caso "finished sin scores": NO sobreescribimos lo que ya tenemos
      // bueno. Salimos antes de tocar la DB para no resetear puntos.
      if (newStatus === 'finished' && newHomeScore === null && newAwayScore === null) {
        continue;
      }

      const [updatedMatch] = await db
        .update(matches)
        .set(updatePayload)
        .where(eq(matches.id, ourMatch.id))
        .returning();

      synced++;

      // Recalculate prediction points when the match is finished — either it
      // just transitioned, OR it was already finished (e.g. closed by the FIFA
      // final whistle at 2-0) and the feed is now correcting the score (the 3rd
      // goal lands while the feed still reports 'live'). We key off `effStatus`,
      // NOT the raw feed `newStatus`: under `downgradeBlocked` the feed says
      // 'live' but our row stays 'finished', and using `newStatus` here left the
      // score corrected to 3-0 while predictions kept their stale 2-0 points (a
      // 2-0 prediction frozen at the exact-score 5 pts). `scoreChanged` guards
      // against re-scoring (and re-firing achievements) on idle finished ticks.
      // Skip when score-locked: predictions were already scored against the
      // admin-corrected result; re-scoring here would use the (wrong) feed score.
      if (
        effStatus === 'finished' &&
        (statusChanged || scoreChanged) &&
        newHomeScore !== null &&
        newAwayScore !== null &&
        !ourMatch.scoreLocked
      ) {
        anyMatchFinished = true;

        const matchPredictions = await db
          .select()
          .from(predictions)
          .where(eq(predictions.matchId, ourMatch.id));

        // Track unique users so we fire `prediction_scored` once per user per
        // match (a user can have N rows — one per league — for the same match).
        const scoredUsers = new Map<number, number>();
        for (const pred of matchPredictions) {
          const pts = calculatePoints(
            { homeScore: pred.homeScore, awayScore: pred.awayScore },
            { homeScore: newHomeScore, awayScore: newAwayScore },
          );
          await db
            .update(predictions)
            .set({ points: pts, updatedAt: sql`(datetime('now'))` })
            .where(eq(predictions.id, pred.id));
          // Highest pts wins if duplicated across leagues (same prediction → same pts).
          const prev = scoredUsers.get(pred.userId) ?? -1;
          if (pts > prev) scoredUsers.set(pred.userId, pts);
        }
        for (const [uid, pts] of scoredUsers) {
          checkAchievements(uid, { type: 'prediction_scored', matchId: ourMatch.id, points: pts })
            .catch(() => {});
        }

        // Pull per-player stats for fantasy scoring — ONLY on the actual
        // transition into finished (`status` was not already finished).
        // Firing on any post-finished score flicker (e.g. the penalty bump)
        // would hit API-Football again and again, burning the 100/day quota.
        // The service also self-dedupes by matchId, but gating here is the
        // first line of defence. Fire-and-forget so an outage doesn't block
        // the score sync.
        if (ourMatch.status !== 'finished') {
          syncFifaStatsForMatch(ourMatch.id).catch((err) =>
            console.error(`[sync-scores] FIFA stats sync failed for match ${ourMatch.id}:`, err),
          );
        }
      }

      // Broadcast the update to connected WebSocket clients
      broadcastMatchUpdate(updatedMatch);
    } catch (err) {
      errors.push(`Match fd#${fdMatch.id} (${fdMatch.utcDate}): ${String(err)}`);
    }
  }

  // Recompute fantasy points once if any match became finished this sync.
  if (anyMatchFinished) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      errors.push(`Fantasy recompute failed: ${String(err)}`);
    }

    // When the Final just finished, auto-award fantasy_legend — no admin
    // action needed. We check the DB directly so this is idempotent.
    try {
      const finalMatch = await db
        .select({ id: matches.id, round: matches.round, status: matches.status })
        .from(matches)
        .where(eq(matches.round, 'final'))
        .limit(1)
        .get();
      if (finalMatch?.status === 'finished') {
        const winners = await finalizeFantasyLegends();
        if (winners.length > 0) {
          console.log(`[sync-scores] fantasy_legend awarded to ${winners.length} user(s):`, winners);
        }
      }
    } catch (err) {
      errors.push(`Fantasy legend finalize failed: ${String(err)}`);
    }
  }

  return { synced, errors, matchesChecked: fdMatches.length };
}
