import { describe, it, expect } from 'vitest';
import { computeStandings } from './group-standings';
import type { Match, Team } from '@/shared/types/api';

function team(id: number, name: string, group = 'A'): Team {
  return { id, name, code: name.slice(0, 3).toUpperCase(), flag: '', group, confederation: null };
}

let matchSeq = 0;
function match(homeTeamId: number, awayTeamId: number, homeScore: number, awayScore: number, group = 'A'): Match {
  matchSeq++;
  return {
    id: matchSeq,
    matchNumber: matchSeq,
    homeTeamId,
    awayTeamId,
    kickoffUtc: '2026-06-11T00:00:00Z',
    predictionLockUtc: '2026-06-11T00:00:00Z',
    venue: '',
    city: '',
    group,
    round: 'group',
    status: 'finished',
    liveStatus: null,
    currentMinute: null,
    homeScore,
    awayScore,
  };
}

describe('computeStandings — desempate head-to-head', () => {
  // A y B terminan con pts/DG/GF globales idénticos; solo el resultado directo
  // (A le ganó a B) los separa. Es el criterio oficial FIFA 2026 #1.
  const teams = [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie'), team(4, 'Delta')];
  const matches = [
    match(1, 2, 1, 0), // A 1-0 B  (head-to-head a favor de A)
    match(3, 1, 1, 0), // C 1-0 A
    match(1, 4, 2, 1), // A 2-1 D
    match(2, 3, 2, 1), // B 2-1 C
    match(2, 4, 1, 0), // B 1-0 D
    match(4, 3, 2, 0), // D 2-0 C
  ];

  const standings = computeStandings(teams, matches, 'A');

  it('A y B tienen estadísticas globales idénticas', () => {
    const a = standings.find((r) => r.team.id === 1)!;
    const b = standings.find((r) => r.team.id === 2)!;
    expect([a.pts, a.gd, a.gf]).toEqual([6, 1, 3]);
    expect([b.pts, b.gd, b.gf]).toEqual([6, 1, 3]);
  });

  it('coloca a A por encima de B por el enfrentamiento directo', () => {
    const order = standings.map((r) => r.team.id);
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
  });

  it('el 3° del grupo es Delta (DG superior a Charlie en el otro empate)', () => {
    expect(standings[2].team.id).toBe(4);
  });
});

describe('computeStandings — regla nueva: head-to-head antes que DG global', () => {
  // Tres equipos empatados en puntos (cada uno le ganó a Delta). El triángulo
  // entre ellos separa primero por enfrentamiento directo y NO por DG global.
  //
  // Globalmente: Alpha (gd+2, gf3) le gana a Charlie (gd+1, gf3) por DG.
  // Con la regla VIEJA (DG global primero) el orden sería: Bravo, Alpha, Charlie.
  // Con la regla NUEVA (head-to-head primero) el orden es: Bravo, Charlie, Alpha,
  // porque en el mini-table Alpha queda último (gf 1) y al reaplicar el directo
  // Bravo le ganó a Charlie.
  const teams = [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie'), team(4, 'Delta')];
  const matches = [
    match(1, 2, 1, 0), // Alpha 1-0 Bravo
    match(3, 1, 1, 0), // Charlie 1-0 Alpha
    match(2, 3, 2, 1), // Bravo 2-1 Charlie
    match(1, 4, 2, 0), // Alpha 2-0 Delta  → infla la DG global de Alpha
    match(2, 4, 1, 0), // Bravo 1-0 Delta
    match(3, 4, 1, 0), // Charlie 1-0 Delta
  ];

  const standings = computeStandings(teams, matches, 'A');

  it('los tres punteros están empatados en puntos', () => {
    expect(standings.slice(0, 3).every((r) => r.pts === 6)).toBe(true);
  });

  it('aplica head-to-head antes que DG global (Charlie por encima de Alpha)', () => {
    const order = standings.map((r) => r.team.id);
    expect(order).toEqual([2, 3, 1, 4]); // Bravo, Charlie, Alpha, Delta
  });

  it('Charlie supera a Alpha pese a tener peor DG global', () => {
    const charlie = standings.find((r) => r.team.id === 3)!;
    const alpha = standings.find((r) => r.team.id === 1)!;
    expect(charlie.gd).toBeLessThan(alpha.gd); // regla vieja pondría a Alpha arriba
    const order = standings.map((r) => r.team.id);
    expect(order.indexOf(3)).toBeLessThan(order.indexOf(1));
  });
});
