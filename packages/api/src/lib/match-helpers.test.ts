import { describe, it, expect, vi, afterEach } from 'vitest';
import { calcPredictionLock, isLocked } from './match-helpers';

afterEach(() => vi.useRealTimers());

describe('calcPredictionLock', () => {
  it('lockea exactamente 5 minutos antes del kickoff (NO 1h)', () => {
    expect(calcPredictionLock('2026-06-11T19:00:00.000Z'))
      .toBe('2026-06-11T18:55:00.000Z');
  });
});

describe('isLocked', () => {
  it('false antes del lock, true después', () => {
    vi.useFakeTimers();
    const lock = '2026-06-11T18:55:00.000Z';
    vi.setSystemTime(new Date('2026-06-11T18:54:59.000Z'));
    expect(isLocked(lock)).toBe(false);
    vi.setSystemTime(new Date('2026-06-11T18:55:01.000Z'));
    expect(isLocked(lock)).toBe(true);
  });

  it('en el instante exacto del lock → true (<=)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T18:55:00.000Z'));
    expect(isLocked('2026-06-11T18:55:00.000Z')).toBe(true);
  });

  // Gotcha fail-safe: fecha corrupta NUNCA debe dejar predicciones abiertas.
  it('fecha inválida → true (locked, no abierto)', () => {
    expect(isLocked('no-es-fecha')).toBe(true);
    expect(isLocked('')).toBe(true);
  });
});
