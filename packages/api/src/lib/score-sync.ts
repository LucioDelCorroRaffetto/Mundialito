// Pure scoring-sync helpers extracted from sync-espn.ts so the logic behind
// three production incidents (Gotchas #13, #14, #15) can be unit-tested without
// pulling in the DB client or the network. sync-espn.ts imports these; the
// behaviour is identical to the previous inline code.

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
): { homeScore: number | null; awayScore: number | null; shootoutWinnerUnknown: boolean } {
  let home = homeScore;
  let away = awayScore;
  let shootoutWinnerUnknown = false;

  if (newStatus === 'finished' && home != null && away != null) {
    const wasShootout = /penalt|shootout|tiros|tanda/i.test(opts.detail);
    if (wasShootout && home === away) {
      if (opts.homeWinnerFlag && !opts.awayWinnerFlag) home += 1;
      else if (opts.awayWinnerFlag && !opts.homeWinnerFlag) away += 1;
      // Shootout but no (or contradictory) winner flag yet → don't finalize a
      // tied KO. Only hold while TRANSITIONING into finished.
      else if (!opts.alreadyFinished) shootoutWinnerUnknown = true;
    }
  }

  return { homeScore: home, awayScore: away, shootoutWinnerUnknown };
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
