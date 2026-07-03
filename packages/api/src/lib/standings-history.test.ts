import { describe, it, expect } from 'vitest';
import { arDateOf, buildStandingsHistory } from './standings-history';

describe('arDateOf', () => {
  it('resta el offset AR (UTC-3) antes de tomar la fecha', () => {
    // 02:00 UTC del día 12 → 23:00 AR del día 11
    expect(arDateOf('2026-06-12T02:00:00.000Z')).toBe('2026-06-11');
    // 04:00 UTC del día 12 → 01:00 AR del día 12
    expect(arDateOf('2026-06-12T04:00:00.000Z')).toBe('2026-06-12');
  });
});

describe('buildStandingsHistory', () => {
  const members = [
    { userId: 1, username: 'ana', avatarUrl: null },
    { userId: 2, username: 'beto', avatarUrl: null },
    { userId: 3, username: 'caro', avatarUrl: null }, // sin pronósticos
  ];

  it('acumula puntos por día AR, incluye miembros sin pronósticos con ceros', () => {
    const rows = [
      { userId: 1, points: 3, kickoffUtc: '2026-06-11T18:00:00.000Z' },
      { userId: 2, points: 1, kickoffUtc: '2026-06-11T18:00:00.000Z' },
      { userId: 1, points: 5, kickoffUtc: '2026-06-12T18:00:00.000Z' },
      { userId: 1, points: 0, kickoffUtc: '2026-06-13T18:00:00.000Z' },
      { userId: 2, points: 3, kickoffUtc: '2026-06-14T18:00:00.000Z' },
    ];

    const { days, series } = buildStandingsHistory(members, rows);

    expect(days).toEqual(['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14']);

    const ana = series.find((s) => s.userId === 1)!;
    expect(ana.cumulativePoints).toEqual([3, 8, 8, 8]);

    const beto = series.find((s) => s.userId === 2)!;
    expect(beto.cumulativePoints).toEqual([1, 1, 1, 4]);

    const caro = series.find((s) => s.userId === 3)!;
    expect(caro.cumulativePoints).toEqual([0, 0, 0, 0]);
  });

  it('sin filas → sin días, series vacías con arrays de longitud 0', () => {
    const { days, series } = buildStandingsHistory(members, []);
    expect(days).toEqual([]);
    expect(series.every((s) => s.cumulativePoints.length === 0)).toBe(true);
  });

  it('varios pronósticos el mismo día suman al mismo bucket', () => {
    const rows = [
      { userId: 1, points: 3, kickoffUtc: '2026-06-11T15:00:00.000Z' },
      { userId: 1, points: 1, kickoffUtc: '2026-06-11T18:00:00.000Z' },
    ];
    const { days, series } = buildStandingsHistory(members, rows);
    expect(days).toEqual(['2026-06-11']);
    expect(series.find((s) => s.userId === 1)!.cumulativePoints).toEqual([4]);
  });
});
