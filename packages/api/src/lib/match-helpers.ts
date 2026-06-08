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
