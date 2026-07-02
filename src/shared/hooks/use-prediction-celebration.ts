import { useEffect, useRef, useState } from 'react';
import type { ScoreType } from '@/shared/lib/scoring';

export type Celebration = 'exact' | 'correct' | null;

const CORRECT_TYPES: ScoreType[] = ['winner_diff', 'draw', 'winner'];

function celebrationKey(matchId: number) {
  return `celebrated:${matchId}`;
}

/**
 * Detecta la transición de `outcome` (undefined/'pending' → definido) para
 * disparar la celebración UNA sola vez por partido (guard en sessionStorage).
 * `outcome` es el ScoreType que ya calcula match-detail cuando el partido
 * tiene marcador real; pasar `undefined` mientras no haya resultado.
 */
export function usePredictionCelebration(
  matchId: number | undefined,
  outcome: ScoreType | undefined,
): { celebration: Celebration; clear: () => void } {
  const prevRef = useRef<ScoreType | undefined>(undefined);
  const [celebration, setCelebration] = useState<Celebration>(null);

  useEffect(() => {
    if (matchId === undefined) return;
    const prev = prevRef.current;
    prevRef.current = outcome;

    if (prev !== undefined || outcome === undefined) return;
    if (sessionStorage.getItem(celebrationKey(matchId)) != null) return;

    if (outcome === 'exact') {
      sessionStorage.setItem(celebrationKey(matchId), '1');
      setCelebration('exact');
    } else if (CORRECT_TYPES.includes(outcome)) {
      sessionStorage.setItem(celebrationKey(matchId), '1');
      setCelebration('correct');
    }
  }, [matchId, outcome]);

  return { celebration, clear: () => setCelebration(null) };
}
