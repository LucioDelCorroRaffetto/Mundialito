import { describe, it, expect } from 'vitest';
import { calculatePoints, scoringResult } from './scoring';

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

describe('scoringResult (penales cuentan como empate de reglamento)', () => {
  it('cruce por penales (bump +1 al ganador) → empate', () => {
    // 1-1 en 120', ganó el visitante por penales (guardado 1-2 con el bump).
    expect(scoringResult({ homeScore: 1, awayScore: 2, decidedByPenalties: 1 })).toEqual({ homeScore: 1, awayScore: 1 });
    expect(scoringResult({ homeScore: 3, awayScore: 2, decidedByPenalties: true })).toEqual({ homeScore: 2, awayScore: 2 });
  });

  it('predecir el empate acierta; predecir al ganador de la tanda no', () => {
    const r = scoringResult({ homeScore: 1, awayScore: 2, decidedByPenalties: 1 });
    expect(calculatePoints(p(1, 1), r)).toBe(5); // empate exacto
    expect(calculatePoints(p(0, 0), r)).toBe(3); // empate acertado (no exacto)
    expect(calculatePoints(p(1, 2), r)).toBe(0); // predijo al ganador de penales → falla
  });

  it('ganador en el alargue (sin flag) cuenta como victoria', () => {
    expect(scoringResult({ homeScore: 2, awayScore: 1, decidedByPenalties: 0 })).toEqual({ homeScore: 2, awayScore: 1 });
  });

  it('sin bump (empate ya guardado) queda igual', () => {
    expect(scoringResult({ homeScore: 1, awayScore: 1, decidedByPenalties: 1 })).toEqual({ homeScore: 1, awayScore: 1 });
  });

  it('partido normal es no-op', () => {
    expect(scoringResult({ homeScore: 3, awayScore: 0 })).toEqual({ homeScore: 3, awayScore: 0 });
  });
});
