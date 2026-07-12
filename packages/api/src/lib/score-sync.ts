// Pure scoring-sync helpers extracted from sync-espn.ts so the logic behind
// four production incidents (Gotchas #13, #14, #15, #16) can be unit-tested
// without pulling in the DB client or the network. sync-espn.ts and
// sync-scores.ts import these; the behaviour is identical to the previous
// inline code.

/**
 * ESPN's 3-letter abbreviation → our `teams.code`. Almost all are identical
 * (SUI, BIH, MEX, KOR, …); the handful of exceptions live here. ESPN uses
 * RSA for South Africa where we use ZAF (the same divergence the FIFA
 * backfill handles). Add entries if a match ever logs an unmatched code.
 */
export const ESPN_CODE_TO_OURS: Record<string, string> = {
  RSA: 'ZAF', // South Africa
};

export function normalizeEspnCode(code: string | undefined | null): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  return ESPN_CODE_TO_OURS[upper] ?? upper;
}

export interface TeamCodes {
  homeTeamCode: string;
  awayTeamCode: string;
}

export interface EspnLikeCompetitor {
  homeAway: 'home' | 'away';
  team: { abbreviation: string };
}

/**
 * Resolve which competitor is OUR home team and which is OUR away team, by
 * matching team codes — NOT by ESPN's own homeAway flag (Gotcha #13). ESPN and
 * our DB sometimes disagree on which side is "home"; assigning scores by
 * position would attach each team's goals to the wrong side ("resultado al
 * revés"). When the codes can't be resolved (missing abbreviations) we fall
 * back to ESPN's orientation.
 *
 * Generic over the competitor shape so callers keep the full object (score,
 * winner flag, …) on the returned home/away.
 */
export function resolveCompetitors<C extends EspnLikeCompetitor>(
  ourMatch: TeamCodes,
  competitors: C[],
): { home: C | undefined; away: C | undefined } {
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

/**
 * ESPN's `competitors[i].score` reports the *regulation* score even when a
 * knockout was decided by penalties, so a 1-1 KO would award every "empate"
 * predictor 5 pts. Given the resolved (home-side / away-side) scores and the
 * shootout winner flags, this:
 *   - bumps the winner's score by 1 when ESPN has published which side won;
 *   - signals `shootoutWinnerUnknown` (HOLD as live, don't finalize) when the
 *     match is going to finished as a tied KO but ESPN hasn't marked a winner
 *     yet — a later tick (or football-data) finalizes it once known.
 *
 * Only acts when transitioning into `finished`; a match already finished
 * (e.g. closed by FIFA's final whistle) is left untouched.
 */
export function resolveShootoutScore(
  newStatus: string,
  homeScore: number | null,
  awayScore: number | null,
  opts: { detail: string; homeWinnerFlag: boolean; awayWinnerFlag: boolean; alreadyFinished: boolean },
): { homeScore: number | null; awayScore: number | null; shootoutWinnerUnknown: boolean; decidedByPenalties: boolean } {
  let home = homeScore;
  let away = awayScore;
  let shootoutWinnerUnknown = false;
  let decidedByPenalties = false;

  if (newStatus === 'finished' && home != null && away != null) {
    const wasShootout = /penalt|shootout|tiros|tanda/i.test(opts.detail);
    if (wasShootout && home === away) {
      if (opts.homeWinnerFlag && !opts.awayWinnerFlag) { home += 1; decidedByPenalties = true; }
      else if (opts.awayWinnerFlag && !opts.homeWinnerFlag) { away += 1; decidedByPenalties = true; }
      // Shootout but no (or contradictory) winner flag yet → don't finalize a
      // tied KO. Only hold while TRANSITIONING into finished.
      else if (!opts.alreadyFinished) shootoutWinnerUnknown = true;
    }
  }

  return { homeScore: home, awayScore: away, shootoutWinnerUnknown, decidedByPenalties };
}

export interface FdScoreLike {
  fullTime: { home: number | null; away: number | null };
  halfTime?: { home: number | null; away: number | null };
  regularTime?: { home: number | null; away: number | null };
  extraTime?: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null };
  duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
}

/**
 * Resolves the actual final score from a football-data.org v4 `score` object.
 *
 * Semántica v4 (verificada contra el feed real del WC2026, Gotcha #17):
 *   - `fullTime` es el AGREGADO total, incluyendo prórroga Y PENALES
 *     (GER–PAR: fullTime 4-5 = regularTime 1-1 + extraTime 0-0 + penalties 3-4).
 *   - `regularTime` / `extraTime` / `penalties` son PARCIALES por segmento,
 *     no acumulados (ARG–SUI 3-1 AET: fullTime 3-1, extraTime 2-0).
 *
 * El código anterior prefería `extraTime` cuando existía, asumiendo que era el
 * acumulado tras 120' — así el M100 ARG–SUI (3-1) quedó guardado 2-0 (solo los
 * goles de la prórroga) y se puntuó contra ese marcador falso.
 *
 * Por lo tanto:
 *   - REGULAR / EXTRA_TIME → `fullTime` (sin penales de por medio, es el total
 *     real de juego).
 *   - PENALTY_SHOOTOUT → el score de juego es regularTime + extraTime (fullTime
 *     incluiría los tiros de la tanda); si faltan los parciales, fullTime menos
 *     penalties como fallback. Luego el bump +1 al ganador de la tanda para que
 *     el delta home/away refleje quién avanza (convención de calculatePoints;
 *     ver resolveShootoutScore).
 */
export function resolveFinalScore(
  score: FdScoreLike,
): { home: number | null; away: number | null; decidedByPenalties: boolean } {
  let home: number | null;
  let away: number | null;

  const wentToShootout = score.duration === 'PENALTY_SHOOTOUT';
  if (wentToShootout) {
    const rt = score.regularTime;
    const et = score.extraTime;
    if (rt && rt.home != null && rt.away != null) {
      home = rt.home + (et?.home ?? 0);
      away = rt.away + (et?.away ?? 0);
    } else if (
      score.penalties &&
      score.penalties.home != null &&
      score.penalties.away != null &&
      score.fullTime.home != null &&
      score.fullTime.away != null
    ) {
      home = score.fullTime.home - score.penalties.home;
      away = score.fullTime.away - score.penalties.away;
    } else {
      // Sin parciales ni tanda desglosada no podemos separar los penales del
      // agregado; fullTime es lo mejor disponible.
      home = score.fullTime.home;
      away = score.fullTime.away;
    }
  } else {
    home = score.fullTime.home;
    away = score.fullTime.away;
  }

  const decidedByPenalties = wentToShootout && score.winner != null;
  if (decidedByPenalties) {
    if (score.winner === 'HOME_TEAM' && home != null) home = home + 1;
    else if (score.winner === 'AWAY_TEAM' && away != null) away = away + 1;
  }
  return { home, away, decidedByPenalties };
}

/**
 * Inverse of the bump applied by `resolveShootoutScore`: given the stored
 * (possibly bumped) score and the `decidedByPenalties` flag, returns the
 * regulation-time score (the draw before the shootout). Used anywhere we
 * display or score against the "real" result — bumped DB scores would
 * otherwise show a fake winning margin (e.g. DB 1-2 for a 1-1 decided on
 * penalties) and mis-score predictions that correctly called the draw.
 */
export function regulationScore(
  homeScore: number | null,
  awayScore: number | null,
  decidedByPenalties: boolean,
): { homeScore: number | null; awayScore: number | null } {
  if (!decidedByPenalties || homeScore == null || awayScore == null || homeScore === awayScore) {
    return { homeScore, awayScore };
  }
  const winnerIsHome = homeScore > awayScore;
  return {
    homeScore: winnerIsHome ? homeScore - 1 : homeScore,
    awayScore: winnerIsHome ? awayScore : awayScore - 1,
  };
}

/**
 * Gotcha #16: KO placeholder rows — both `teams.code` read 'TBD' because the
 * bracket slot hasn't been resolved to real teams yet (sync-fifa-stats.ts
 * derives the actual participants from the FIFA feed itself; matches.home/
 * away_team_id stay pointed at the shared TBD row). Neither ESPN nor
 * football-data.org can identify these rows by team code — both sides read
 * 'TBD' — so the *loose* kickoff-only fallback in `findMatch` is the only
 * thing that could match them, and a single WC kickoff slot regularly hosts
 * more than one real fixture.
 *
 * Real incident (M82 BEL–SEN, R32): the placeholder row got loose-matched
 * against a score that was never this match's — the feed re-wrote it back to
 * 1-0 on the very next tick after an admin correction to the true 3-2 (AET).
 * FIFA's live endpoint (sync-fifa-stats.ts, `apiFixtureId == null` gate) is
 * the sole authoritative score source for these rows; ESPN/football-data must
 * never touch them, loose match or not.
 */
export function isPlaceholderTeamCode(code: string): boolean {
  return code.toUpperCase() === 'TBD';
}

export function isPlaceholderMatch(m: { homeTeamCode: string; awayTeamCode: string }): boolean {
  return isPlaceholderTeamCode(m.homeTeamCode) || isPlaceholderTeamCode(m.awayTeamCode);
}

/**
 * Whether the sync should (re)score the match's predictions this tick. Encodes
 * the score_locked guard (Gotcha #15): an admin-locked score must never be
 * re-scored by the feed, and a held shootout must not score a tied KO.
 */
export function shouldRescorePredictions(opts: {
  newStatus: string;
  shootoutWinnerUnknown: boolean;
  scoreLocked: boolean;
  homeScore: number | null;
  awayScore: number | null;
}): boolean {
  return (
    opts.newStatus === 'finished' &&
    !opts.shootoutWinnerUnknown &&
    !opts.scoreLocked &&
    opts.homeScore !== null &&
    opts.awayScore !== null
  );
}
