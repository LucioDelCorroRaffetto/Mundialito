import { describe, it, expect } from 'vitest';
import { matchWinnerId, matchLoserId, resolveKnockoutSlotId } from './bracket-projection';
import { THIRD_PLACE_MATCH } from '@/shared/data/bracket';
import type { Match } from '@/shared/types/api';

function mkMatch(matchNumber: number, homeTeamId: number, awayTeamId: number, partial: Partial<Match> = {}): Match {
  return {
    id: matchNumber, matchNumber, homeTeamId, awayTeamId,
    kickoffUtc: '', predictionLockUtc: '', venue: '', city: '', group: null, round: 'knockout',
    status: 'finished', liveStatus: null, currentMinute: null, homeScore: null, awayScore: null,
    ...partial,
  };
}

describe('matchWinnerId / matchLoserId', () => {
  it('devuelve ganador/perdedor cuando el partido terminó con marcador definido', () => {
    const m = mkMatch(89, 10, 20, { homeScore: 2, awayScore: 1 });
    expect(matchWinnerId(m)).toBe(10);
    expect(matchLoserId(m)).toBe(20);
  });

  it('respeta la orientación cuando gana el visitante', () => {
    const m = mkMatch(89, 10, 20, { homeScore: 0, awayScore: 3 });
    expect(matchWinnerId(m)).toBe(20);
    expect(matchLoserId(m)).toBe(10);
  });

  it('devuelve null si no terminó', () => {
    const m = mkMatch(89, 10, 20, { status: 'live', homeScore: 1, awayScore: 0 });
    expect(matchWinnerId(m)).toBeNull();
  });

  it('devuelve null si está empatado (definición por penales, no expuesta en la lista)', () => {
    const m = mkMatch(89, 10, 20, { homeScore: 1, awayScore: 1 });
    expect(matchWinnerId(m)).toBeNull();
    expect(matchLoserId(m)).toBeNull();
  });

  it('devuelve null si falta el marcador', () => {
    expect(matchWinnerId(mkMatch(89, 10, 20))).toBeNull();
    expect(matchWinnerId(undefined)).toBeNull();
  });
});

describe('resolveKnockoutSlotId — propagación de ganadores por el cuadro', () => {
  it('lleva el ganador del hijo al slot del cruce (Octavos M89 ← R32 74/77)', () => {
    // M89 children = [74, 77] (ver bracket.ts)
    const byNum = new Map<number, Match>([
      [74, mkMatch(74, 100, 101, { homeScore: 2, awayScore: 0 })], // gana 100
      [77, mkMatch(77, 200, 201, { homeScore: 0, awayScore: 1 })], // gana 201
    ]);
    expect(resolveKnockoutSlotId(89, 'home', byNum)).toBe(100);
    expect(resolveKnockoutSlotId(89, 'away', byNum)).toBe(201);
  });

  it('deja null el slot mientras el hijo no esté resuelto', () => {
    const byNum = new Map<number, Match>([
      [74, mkMatch(74, 100, 101, { status: 'scheduled' })],
    ]);
    expect(resolveKnockoutSlotId(89, 'home', byNum)).toBeNull();
    expect(resolveKnockoutSlotId(89, 'away', byNum)).toBeNull(); // M77 ni existe
  });

  it('3er puesto: toma los PERDEDORES de las semifinales (101 / 102)', () => {
    const byNum = new Map<number, Match>([
      [101, mkMatch(101, 300, 301, { homeScore: 1, awayScore: 0 })], // pierde 301
      [102, mkMatch(102, 400, 401, { homeScore: 2, awayScore: 3 })], // pierde 400
    ]);
    expect(resolveKnockoutSlotId(THIRD_PLACE_MATCH.matchNumber, 'home', byNum)).toBe(301);
    expect(resolveKnockoutSlotId(THIRD_PLACE_MATCH.matchNumber, 'away', byNum)).toBe(400);
  });

  it('no proyecta nada para la R32 (sus slots salen de la fase de grupos)', () => {
    expect(resolveKnockoutSlotId(74, 'home', new Map())).toBeNull();
  });
});
