import { describe, it, expect } from 'vitest';
import { calculateFantasyPoints, type FantasyScoringInput } from './fantasy-scoring';

const base: FantasyScoringInput = {
  position: 'MID', played: true, goals: 0, assists: 0,
  cleanSheet: false, yellowCards: 0, redCard: false,
};

describe('calculateFantasyPoints', () => {
  it('no jugó → 0 sin importar el resto', () => {
    expect(calculateFantasyPoints({ ...base, played: false, goals: 3 })).toBe(0);
  });

  it('jugar otorga la base de +2', () => {
    expect(calculateFantasyPoints(base)).toBe(2);
  });

  it('gol vale según posición', () => {
    expect(calculateFantasyPoints({ ...base, position: 'GK', goals: 1 })).toBe(2 + 6);
    expect(calculateFantasyPoints({ ...base, position: 'DEF', goals: 1 })).toBe(2 + 6);
    expect(calculateFantasyPoints({ ...base, position: 'MID', goals: 1 })).toBe(2 + 5);
    expect(calculateFantasyPoints({ ...base, position: 'FWD', goals: 1 })).toBe(2 + 4);
  });

  it('valla invicta: GK/DEF +4, MID +1, FWD +0', () => {
    expect(calculateFantasyPoints({ ...base, position: 'GK', cleanSheet: true })).toBe(2 + 4);
    expect(calculateFantasyPoints({ ...base, position: 'DEF', cleanSheet: true })).toBe(2 + 4);
    expect(calculateFantasyPoints({ ...base, position: 'MID', cleanSheet: true })).toBe(2 + 1);
    expect(calculateFantasyPoints({ ...base, position: 'FWD', cleanSheet: true })).toBe(2 + 0);
  });

  it('asistencias +3 c/u, amarilla −1 c/u, roja −3', () => {
    expect(calculateFantasyPoints({ ...base, assists: 2 })).toBe(2 + 6);
    expect(calculateFantasyPoints({ ...base, yellowCards: 2 })).toBe(2 - 2);
    expect(calculateFantasyPoints({ ...base, redCard: true })).toBe(2 - 3);
  });

  it('caso combinado: DEF con gol + asist + valla + amarilla', () => {
    // 2 base + 6 gol + 3 asist + 4 valla − 1 amarilla = 14
    expect(calculateFantasyPoints({
      position: 'DEF', played: true, goals: 1, assists: 1,
      cleanSheet: true, yellowCards: 1, redCard: false,
    })).toBe(14);
  });

  it('puntaje neto negativo es posible (jugó, amarilla + roja)', () => {
    // 2 base − 1 amarilla − 3 roja = −2
    expect(calculateFantasyPoints({ ...base, yellowCards: 1, redCard: true })).toBe(-2);
  });
});
