const LOCK_OFFSET_MS = 5 * 60 * 1000;

export function calcPredictionLock(kickoffUtc: string): string {
  return new Date(new Date(kickoffUtc).getTime() - LOCK_OFFSET_MS).toISOString();
}

export function isLocked(predictionLockUtc: string): boolean {
  return new Date(predictionLockUtc).getTime() <= Date.now();
}
