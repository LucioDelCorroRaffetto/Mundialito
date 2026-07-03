import { describe, it, expect } from 'vitest';
import {
  longestStreak,
  bestHit,
  nearestRival,
  mostPredictedTeam,
  type StreakEntry,
  type ExactEntry,
  type StandingRow,
  type PredictionPick,
  type MatchTeams,
} from './wrapped';

describe('longestStreak', () => {
  it('cuenta la racha máxima de exact|correct consecutivos', () => {
    const entries: StreakEntry[] = [
      { kickoffUtc: '2026-06-01', outcome: 'exact' },
      { kickoffUtc: '2026-06-02', outcome: 'correct' },
      { kickoffUtc: '2026-06-03', outcome: 'exact' },
      { kickoffUtc: '2026-06-04', outcome: 'wrong' },
      { kickoffUtc: '2026-06-05', outcome: 'exact' },
    ];
    expect(longestStreak(entries)).toBe(3);
  });

  it('un hueco de pending en el medio corta la racha', () => {
    const entries: StreakEntry[] = [
      { kickoffUtc: '2026-06-01', outcome: 'exact' },
      { kickoffUtc: '2026-06-02', outcome: 'correct' },
      { kickoffUtc: '2026-06-03', outcome: 'pending' },
      { kickoffUtc: '2026-06-04', outcome: 'exact' },
      { kickoffUtc: '2026-06-05', outcome: 'correct' },
      { kickoffUtc: '2026-06-06', outcome: 'correct' },
    ];
    expect(longestStreak(entries)).toBe(3);
  });

  it('ordena por kickoff asc antes de calcular, sin asumir orden de entrada', () => {
    const entries: StreakEntry[] = [
      { kickoffUtc: '2026-06-03', outcome: 'exact' },
      { kickoffUtc: '2026-06-01', outcome: 'exact' },
      { kickoffUtc: '2026-06-02', outcome: 'exact' },
    ];
    expect(longestStreak(entries)).toBe(3);
  });

  it('sin entradas → 0', () => {
    expect(longestStreak([])).toBe(0);
  });
});

describe('bestHit', () => {
  it('sin exactos → null', () => {
    expect(bestHit([])).toBeNull();
  });

  it('con dato de forecast, elige el de menor % de gente que lo acertó', () => {
    const exactEntries: ExactEntry[] = [
      { matchId: 1, homeScore: 2, awayScore: 1 },
      { matchId: 2, homeScore: 0, awayScore: 0 },
    ];
    const aggregates = [
      { matchId: 1, pctPredicted: 30 },
      { matchId: 2, pctPredicted: 5 },
    ];
    expect(bestHit(exactEntries, aggregates)).toEqual({
      matchId: 2,
      homeScore: 0,
      awayScore: 0,
      rarity: 5,
    });
  });

  it('sin dato de forecast, cae al fallback: mayor cantidad de goles totales', () => {
    const exactEntries: ExactEntry[] = [
      { matchId: 1, homeScore: 1, awayScore: 0 },
      { matchId: 2, homeScore: 3, awayScore: 2 },
      { matchId: 3, homeScore: 2, awayScore: 0 },
    ];
    expect(bestHit(exactEntries)).toEqual({ matchId: 2, homeScore: 3, awayScore: 2 });
  });

  it('empate de goles totales en el fallback ⇒ menor matchId', () => {
    const exactEntries: ExactEntry[] = [
      { matchId: 5, homeScore: 2, awayScore: 1 },
      { matchId: 2, homeScore: 1, awayScore: 2 },
    ];
    expect(bestHit(exactEntries)?.matchId).toBe(2);
  });
});

describe('nearestRival', () => {
  it('elige al miembro con menor diferencia de puntos', () => {
    const standings: StandingRow[] = [
      { userId: 1, points: 50, position: 1 },
      { userId: 2, points: 30, position: 2 },
      { userId: 3, points: 28, position: 3 },
    ];
    expect(nearestRival(3, 28, standings)).toEqual({ userId: 2, points: 30, position: 2 });
  });

  it('empate de diferencia ⇒ el de mejor posición', () => {
    const standings: StandingRow[] = [
      { userId: 1, points: 40, position: 1 },
      { userId: 2, points: 20, position: 3 },
      { userId: 3, points: 20, position: 2 },
    ];
    // yo tengo 30 puntos: 1 y 2/3 empatan en distancia (10)
    expect(nearestRival(4, 30, standings)?.userId).toBe(1);
  });

  it('sin otros miembros ⇒ null', () => {
    expect(nearestRival(1, 10, [{ userId: 1, points: 10, position: 1 }])).toBeNull();
  });
});

describe('mostPredictedTeam', () => {
  const matches: MatchTeams[] = [
    { id: 1, homeTeamId: 10, awayTeamId: 20 },
    { id: 2, homeTeamId: 10, awayTeamId: 30 },
    { id: 3, homeTeamId: 20, awayTeamId: 30 },
    { id: 4, homeTeamId: 10, awayTeamId: 40 },
  ];

  it('cuenta el equipo que más veces fue pronosticado ganador', () => {
    const predictions: PredictionPick[] = [
      { matchId: 1, homeScore: 2, awayScore: 0 }, // gana 10
      { matchId: 2, homeScore: 1, awayScore: 0 }, // gana 10
      { matchId: 3, homeScore: 0, awayScore: 1 }, // gana 30
    ];
    expect(mostPredictedTeam(predictions, matches)).toBe(10);
  });

  it('los empates pronosticados no cuentan para ningún equipo', () => {
    const predictions: PredictionPick[] = [
      { matchId: 1, homeScore: 1, awayScore: 1 }, // empate, no cuenta
      { matchId: 3, homeScore: 1, awayScore: 1 }, // empate, no cuenta
    ];
    expect(mostPredictedTeam(predictions, matches)).toBeNull();
  });

  it('empate en el conteo ⇒ menor teamId', () => {
    const predictions: PredictionPick[] = [
      { matchId: 1, homeScore: 2, awayScore: 0 }, // gana 10
      { matchId: 3, homeScore: 1, awayScore: 0 }, // gana 20
    ];
    expect(mostPredictedTeam(predictions, matches)).toBe(10);
  });

  it('sin pronósticos ⇒ null', () => {
    expect(mostPredictedTeam([], matches)).toBeNull();
  });
});
