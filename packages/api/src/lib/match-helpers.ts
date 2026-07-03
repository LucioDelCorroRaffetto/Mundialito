const LOCK_OFFSET_MS = 5 * 60 * 1000;

export function calcPredictionLock(kickoffUtc: string): string {
  return new Date(new Date(kickoffUtc).getTime() - LOCK_OFFSET_MS).toISOString();
}

export function isLocked(predictionLockUtc: string): boolean {
  const t = new Date(predictionLockUtc).getTime();
  // Fail-safe: if the lock date is malformed (NaN), treat the match as
  // locked rather than leaving predictions open forever. Real corruption
  // is rare, but defaulting to "unlocked" would let users submit after
  // kickoff, which is the worst possible failure mode.
  if (!Number.isFinite(t)) return true;
  return t <= Date.now();
}

/**
 * Whether a league's members can see each other's predictions for a match:
 * 'always' visibility leagues reveal immediately; otherwise it needs the
 * match to be live/finished, with a kickoff-time fallback so predictions
 * reveal even before the score sync flips `status` (see match-predictions.ts).
 */
export function isPredictionRevealed(
  predictionsVisibility: 'after_kickoff' | 'always',
  match: { status: string; kickoffUtc: string },
): boolean {
  if (predictionsVisibility === 'always') return true;
  const matchStarted =
    match.status === 'live' ||
    match.status === 'finished' ||
    new Date(match.kickoffUtc).getTime() <= Date.now();
  return matchStarted;
}
