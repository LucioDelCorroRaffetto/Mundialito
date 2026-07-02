import { describe, it, expect } from 'vitest';
import {
  isPlaceholderMatch,
  isPlaceholderTeamCode,
  normalizeEspnCode,
  resolveCompetitors,
  resolveShootoutScore,
  shouldRescorePredictions,
} from './score-sync';

// Minimal ESPN competitor shape used by these tests. resolveCompetitors is
// generic, so extra fields (score, winner) survive on the returned objects.
const comp = (homeAway: 'home' | 'away', abbreviation: string, extra: Record<string, unknown> = {}) => ({
  homeAway,
  team: { abbreviation },
  ...extra,
});

describe('normalizeEspnCode', () => {
  it('uppercases and maps ESPN-specific codes to ours (RSA → ZAF)', () => {
    expect(normalizeEspnCode('rsa')).toBe('ZAF');
    expect(normalizeEspnCode('RSA')).toBe('ZAF');
  });
  it('passes through identical codes', () => {
    expect(normalizeEspnCode('arg')).toBe('ARG');
    expect(normalizeEspnCode('SUI')).toBe('SUI');
  });
  it('returns empty string for missing input', () => {
    expect(normalizeEspnCode(undefined)).toBe('');
    expect(normalizeEspnCode(null)).toBe('');
    expect(normalizeEspnCode('')).toBe('');
  });
});

// Gotcha #13 — "resultado al revés": scores must be attributed by team
// identity (code), NOT by ESPN's homeAway position.
describe('resolveCompetitors (score by identity)', () => {
  const ourMatch = { homeTeamCode: 'ARG', awayTeamCode: 'BRA' };

  it('keeps orientation when ESPN agrees with our home/away', () => {
    const espnHome = comp('home', 'ARG', { score: '2' });
    const espnAway = comp('away', 'BRA', { score: '1' });
    const { home, away } = resolveCompetitors(ourMatch, [espnHome, espnAway]);
    expect(home).toBe(espnHome);
    expect(away).toBe(espnAway);
  });

  it('SWAPS when ESPN lists the teams in the opposite order', () => {
    // ESPN says BRA is home, ARG is away — but in OUR DB ARG is home.
    const espnHome = comp('home', 'BRA', { score: '1' });
    const espnAway = comp('away', 'ARG', { score: '2' });
    const { home, away } = resolveCompetitors(ourMatch, [espnHome, espnAway]);
    // Our home side (ARG) must receive ARG's score (2), not BRA's (1).
    expect(home).toBe(espnAway);
    expect(home?.team.abbreviation).toBe('ARG');
    expect((home as { score?: string }).score).toBe('2');
    expect(away).toBe(espnHome);
    expect(away?.team.abbreviation).toBe('BRA');
  });

  it('resolves through the RSA → ZAF code mapping', () => {
    const m = { homeTeamCode: 'ZAF', awayTeamCode: 'MEX' };
    const espnHome = comp('home', 'MEX', { score: '0' });
    const espnAway = comp('away', 'RSA', { score: '3' });
    const { home, away } = resolveCompetitors(m, [espnHome, espnAway]);
    expect(home?.team.abbreviation).toBe('RSA'); // our ZAF home
    expect(away?.team.abbreviation).toBe('MEX');
  });

  it('falls back to ESPN orientation when codes are unresolvable', () => {
    const espnHome = comp('home', '', { score: '1' });
    const espnAway = comp('away', '', { score: '0' });
    const { home, away } = resolveCompetitors(ourMatch, [espnHome, espnAway]);
    expect(home).toBe(espnHome);
    expect(away).toBe(espnAway);
  });
});

// Penalty bump + shootout-winner-unknown HOLD.
describe('resolveShootoutScore', () => {
  const base = { detail: 'Full Time - Penalties', homeWinnerFlag: false, awayWinnerFlag: false, alreadyFinished: false };

  it('bumps the home side +1 when home won the shootout', () => {
    const r = resolveShootoutScore('finished', 1, 1, { ...base, homeWinnerFlag: true });
    expect(r.homeScore).toBe(2);
    expect(r.awayScore).toBe(1);
    expect(r.shootoutWinnerUnknown).toBe(false);
    expect(r.decidedByPenalties).toBe(true);
  });

  it('bumps the away side +1 when away won the shootout', () => {
    const r = resolveShootoutScore('finished', 0, 0, { ...base, awayWinnerFlag: true });
    expect(r.homeScore).toBe(0);
    expect(r.awayScore).toBe(1);
    expect(r.shootoutWinnerUnknown).toBe(false);
    expect(r.decidedByPenalties).toBe(true);
  });

  it('HOLDS (winner unknown) when a tied KO finishes with no winner flag', () => {
    const r = resolveShootoutScore('finished', 1, 1, base);
    expect(r.homeScore).toBe(1);
    expect(r.awayScore).toBe(1);
    expect(r.shootoutWinnerUnknown).toBe(true);
  });

  it('does NOT hold when the match was already finished (e.g. FIFA closed it)', () => {
    const r = resolveShootoutScore('finished', 1, 1, { ...base, alreadyFinished: true });
    expect(r.shootoutWinnerUnknown).toBe(false);
  });

  it('does nothing for a non-shootout finished match', () => {
    const r = resolveShootoutScore('finished', 2, 1, { ...base, detail: 'Full Time' });
    expect(r).toEqual({ homeScore: 2, awayScore: 1, shootoutWinnerUnknown: false, decidedByPenalties: false });
  });

  it('does nothing when the KO scores are not tied (decided in regulation/ET)', () => {
    const r = resolveShootoutScore('finished', 2, 1, base);
    expect(r).toEqual({ homeScore: 2, awayScore: 1, shootoutWinnerUnknown: false, decidedByPenalties: false });
  });

  it('does nothing while the match is still live', () => {
    const r = resolveShootoutScore('live', 1, 1, { ...base, homeWinnerFlag: true });
    expect(r).toEqual({ homeScore: 1, awayScore: 1, shootoutWinnerUnknown: false, decidedByPenalties: false });
  });

  it('does NOT mark decidedByPenalties when the winner flag is missing (held)', () => {
    const r = resolveShootoutScore('finished', 1, 1, base);
    expect(r.decidedByPenalties).toBe(false);
  });
});

// Gotcha #15 — score_locked guard: an admin-locked score must never be
// re-scored by the feed, and a held shootout must not score a tied KO.
describe('shouldRescorePredictions', () => {
  const base = {
    newStatus: 'finished',
    shootoutWinnerUnknown: false,
    scoreLocked: false,
    homeScore: 2 as number | null,
    awayScore: 1 as number | null,
  };

  it('scores predictions on a normal finished match', () => {
    expect(shouldRescorePredictions(base)).toBe(true);
  });

  it('does NOT re-score when the score is admin-locked (Gotcha #15)', () => {
    expect(shouldRescorePredictions({ ...base, scoreLocked: true })).toBe(false);
  });

  it('does NOT score while holding a shootout whose winner is unknown', () => {
    expect(shouldRescorePredictions({ ...base, shootoutWinnerUnknown: true })).toBe(false);
  });

  it('does NOT score a match that has not finished', () => {
    expect(shouldRescorePredictions({ ...base, newStatus: 'live' })).toBe(false);
  });

  it('does NOT score when either score is null', () => {
    expect(shouldRescorePredictions({ ...base, homeScore: null })).toBe(false);
    expect(shouldRescorePredictions({ ...base, awayScore: null })).toBe(false);
  });

  // Regression: a match closed by the FIFA final whistle at 2-0 (predictions
  // scored, a 2-0 prediction frozen at 5 pts) whose feed later corrects the
  // score to 3-0 while STILL reporting 'live'. Callers must pass the EFFECTIVE
  // status (downgradeBlocked → 'finished'), NOT the raw feed status — otherwise
  // the 3-0 correction lands without re-scoring and the 2-0 prediction keeps
  // its stale 5 pts. With effStatus='finished' this returns true so the
  // corrected 3-0 re-scores the 2-0 prediction down to 1 pt.
  it('re-scores a downgrade-blocked correction (feed live, match already finished)', () => {
    expect(shouldRescorePredictions({ ...base, newStatus: 'finished', homeScore: 3, awayScore: 0 })).toBe(true);
  });
});

// Gotcha #16 — KO placeholder rows (M82 BEL-SEN: loose kickoff match
// silently overwrote an admin-corrected 3-2 back to a stale 1-0) must never
// be matched by the loose kickoff-only fallback.
describe('isPlaceholderTeamCode / isPlaceholderMatch', () => {
  it('flags TBD case-insensitively', () => {
    expect(isPlaceholderTeamCode('TBD')).toBe(true);
    expect(isPlaceholderTeamCode('tbd')).toBe(true);
    expect(isPlaceholderTeamCode('ARG')).toBe(false);
  });

  it('flags a match placeholder when either side is TBD', () => {
    expect(isPlaceholderMatch({ homeTeamCode: 'TBD', awayTeamCode: 'TBD' })).toBe(true);
    expect(isPlaceholderMatch({ homeTeamCode: 'TBD', awayTeamCode: 'ARG' })).toBe(true);
    expect(isPlaceholderMatch({ homeTeamCode: 'ARG', awayTeamCode: 'TBD' })).toBe(true);
  });

  it('does not flag a match with two real teams', () => {
    expect(isPlaceholderMatch({ homeTeamCode: 'ARG', awayTeamCode: 'BRA' })).toBe(false);
  });
});
