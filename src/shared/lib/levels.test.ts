import { describe, it, expect } from 'vitest';
import {
  computeLevel as computeLevelFront,
  TIERS as TIERS_FRONT,
} from './levels';
// The API copy is a hand-maintained mirror (Gotcha #10). If anyone edits one
// curve without the other, the level badge shown to ~40 live users diverges
// from the badge the server stamps into responses. This test makes that drift
// fail CI instead of shipping silently.
import {
  computeLevel as computeLevelApi,
  TIERS as TIERS_API,
} from '../../../packages/api/src/lib/levels';

describe('levels mirror (front ↔ api)', () => {
  it('TIERS tables are identical', () => {
    expect(TIERS_FRONT).toEqual(TIERS_API);
  });

  it('computeLevel agrees across the whole XP range and beyond', () => {
    for (let xp = 0; xp <= 600; xp++) {
      expect(computeLevelFront(xp)).toEqual(computeLevelApi(xp));
    }
  });

  it('thresholds land on the documented levels (CLAUDE.md curve)', () => {
    // 0/5/15/30/50/75/105/140/180/225/280/340/410/490
    expect(computeLevelFront(0).level).toBe(1);
    expect(computeLevelFront(4).level).toBe(1);
    expect(computeLevelFront(5).level).toBe(2);
    expect(computeLevelFront(225).level).toBe(10); // Platino I = full base catalog
    expect(computeLevelFront(490).level).toBe(14); // Diamante II = max
    expect(computeLevelFront(99999).level).toBe(14);
  });

  it('tier boundaries match the documented bands', () => {
    expect(computeLevelFront(0).tier.key).toBe('bronce');   // L1
    expect(computeLevelFront(30).tier.key).toBe('plata');   // L4
    expect(computeLevelFront(105).tier.key).toBe('oro');    // L7
    expect(computeLevelFront(225).tier.key).toBe('platino');// L10
    expect(computeLevelFront(410).tier.key).toBe('diamante');// L13
  });

  it('clamps negative and fractional XP', () => {
    expect(computeLevelFront(-50).level).toBe(1);
    expect(computeLevelFront(4.9).level).toBe(1);
    expect(computeLevelFront(5.9).level).toBe(2);
    expect(computeLevelFront(14).nextLevelXp).toBe(15);
  });
});
