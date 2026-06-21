import { describe, it, expect } from 'vitest';
import { calculatePoints } from './scoring';

const p = (homeScore: number, awayScore: number) => ({ homeScore, awayScore });

describe('calculatePoints', () => {
  it('resultado exacto → 5', () => {
    expect(calculatePoints(p(2, 1), p(2, 1))).toBe(5);
    expect(calculatePoints(p(0, 0), p(0, 0))).toBe(5);
  });

  it('empate acertado pero no exacto → 3', () => {
    expect(calculatePoints(p(1, 1), p(2, 2))).toBe(3);
    expect(calculatePoints(p(2, 2), p(0, 0))).toBe(3);
  });

  it('ganador correcto + diferencia exacta (no marcador) → 3', () => {
    expect(calculatePoints(p(2, 1), p(3, 2))).toBe(3); // ambos +1 local
    expect(calculatePoints(p(0, 2), p(1, 3))).toBe(3); // ambos +2 visita
  });

  it('solo ganador correcto (dif distinta) → 1', () => {
    expect(calculatePoints(p(1, 0), p(3, 0))).toBe(1);
    expect(calculatePoints(p(0, 1), p(0, 4))).toBe(1);
  });

  it('ganador equivocado → 0', () => {
    expect(calculatePoints(p(2, 0), p(0, 2))).toBe(0);
    expect(calculatePoints(p(1, 0), p(1, 1))).toBe(0); // predijo gana local, fue empate
  });

  // Gotcha: sin el guard, null===null daría 5 a un partido aún pendiente.
  it('null / undefined → 0 (nunca 5)', () => {
    expect(calculatePoints(null, null)).toBe(0);
    expect(calculatePoints(p(1, 1), null)).toBe(0);
    expect(calculatePoints(undefined, p(0, 0))).toBe(0);
    expect(calculatePoints({ homeScore: null as unknown as number, awayScore: 1 }, p(0, 1))).toBe(0);
  });

  it('NaN / Infinity / negativos → 0', () => {
    expect(calculatePoints(p(NaN, 1), p(1, 1))).toBe(0);
    expect(calculatePoints(p(Infinity, 0), p(1, 0))).toBe(0);
    expect(calculatePoints(p(-1, 0), p(1, 0))).toBe(0);
  });
});
