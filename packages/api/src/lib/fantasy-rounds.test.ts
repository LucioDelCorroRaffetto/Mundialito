import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FANTASY_ROUNDS, ROUND_BY_SLUG, getCurrentFantasyRound, isRoundOpen,
} from './fantasy-rounds';

afterEach(() => vi.useRealTimers());

describe('definición de rondas', () => {
  // Gotcha: 'sf' fue removido de la ronda final para no contar semis 2 veces.
  it('la ronda final puntúa SOLO third + final (sin sf)', () => {
    const final = ROUND_BY_SLUG.get('final')!;
    expect(final.dbRound).toEqual(['third', 'final']);
    expect(final.dbRound).not.toContain('sf');
  });

  it('cada dbRound del torneo se cuenta exactamente una vez (salvo group, x3)', () => {
    const counts = new Map<string, number>();
    for (const r of FANTASY_ROUNDS) {
      const dbRounds = Array.isArray(r.dbRound) ? r.dbRound : [r.dbRound];
      for (const db of dbRounds) counts.set(db, (counts.get(db) ?? 0) + 1);
    }
    // 'group' aparece 3 veces a propósito (desambiguado por fecha); el resto, 1.
    for (const [k, v] of counts) {
      if (k !== 'group') expect(v, `dbRound '${k}' duplicado`).toBe(1);
    }
    expect(counts.get('group')).toBe(3);
  });
});

describe('ventanas de deadline', () => {
  it('getCurrentFantasyRound devuelve la primera ronda con deadline futuro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T00:00:00Z')); // antes del deadline de group_1
    expect(getCurrentFantasyRound()?.slug).toBe('group_1');
  });

  it('torneo terminado → null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    expect(getCurrentFantasyRound()).toBeNull();
  });

  it('isRoundOpen false en el instante del deadline y después', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T18:55:00Z')); // == deadline group_1
    expect(isRoundOpen('group_1')).toBe(false);
  });

  it('slug inexistente → false', () => {
    expect(isRoundOpen('no-existe')).toBe(false);
  });
});
