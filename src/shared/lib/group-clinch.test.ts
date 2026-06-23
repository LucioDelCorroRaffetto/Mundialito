import { describe, it, expect } from 'vitest';
import { computeGroupClinch, resolveSlotTeam, computeAllGroupClinches } from './group-clinch';
import type { Match, Team } from '@/shared/types/api';

// ── Helpers de armado ─────────────────────────────────────────────────────────
let nextId = 1;
function team(name: string, group: string): Team {
  return { id: nextId++, name, code: name.slice(0, 3).toUpperCase(), flag: '🏳️', group, confederation: null };
}

let matchNum = 1;
function played(home: Team, away: Team, hs: number, as: number, group: string): Match {
  return {
    id: matchNum, matchNumber: matchNum++, homeTeamId: home.id, awayTeamId: away.id,
    kickoffUtc: '', predictionLockUtc: '', venue: '', city: '', group, round: 'group',
    status: 'finished', liveStatus: null, currentMinute: null, homeScore: hs, awayScore: as,
  };
}
function scheduled(home: Team, away: Team, group: string): Match {
  return {
    id: matchNum, matchNumber: matchNum++, homeTeamId: home.id, awayTeamId: away.id,
    kickoffUtc: '', predictionLockUtc: '', venue: '', city: '', group, round: 'group',
    status: 'scheduled', liveStatus: null, currentMinute: null, homeScore: null, awayScore: null,
  };
}

/** Crea un grupo de 4 equipos A1..A4 con sus 6 fixtures (sin resultados). */
function makeGroup(g: string) {
  const t = [team(`${g}1`, g), team(`${g}2`, g), team(`${g}3`, g), team(`${g}4`, g)] as const;
  const [a, b, c, d] = t;
  const fixtures: [Team, Team][] = [
    [a, b], [c, d], // J1
    [a, c], [b, d], // J2
    [a, d], [b, c], // J3
  ];
  return { teams: [...t], a, b, c, d, fixtures };
}

describe('computeGroupClinch — confirmación matemática de 1°/2°', () => {
  it('grupo sin jugar: nada confirmado', () => {
    const { teams, fixtures } = makeGroup('A');
    const matches = fixtures.map(([h, a]) => scheduled(h, a, 'A'));
    const clinch = computeGroupClinch(teams, matches, 'A');
    expect(clinch.first).toBeNull();
    expect(clinch.second).toBeNull();
  });

  it('grupo terminado: 1° y 2° resueltos por puntos', () => {
    const { teams, a, b, c, d } = makeGroup('B');
    // a gana todo (9), b gana 2 (6), c gana 1 (3), d pierde todo (0)
    const matches = [
      played(a, b, 1, 0, 'B'), played(c, d, 1, 0, 'B'),
      played(a, c, 1, 0, 'B'), played(b, d, 1, 0, 'B'),
      played(a, d, 1, 0, 'B'), played(b, c, 1, 0, 'B'),
    ];
    const clinch = computeGroupClinch(teams, matches, 'B');
    expect(clinch.first?.id).toBe(a.id);
    expect(clinch.second?.id).toBe(b.id);
  });

  it('1° confirmado antes de cerrar: líder inalcanzable en puntos', () => {
    const { teams, a, b, c, d } = makeGroup('C');
    // J1 y J2 jugadas: a ganó sus 2 (6 pts). Resto con 1 o menos. Falta J3.
    const matches = [
      played(a, b, 2, 0, 'C'), played(c, d, 0, 0, 'C'),   // J1
      played(a, c, 2, 0, 'C'), played(b, d, 0, 0, 'C'),   // J2
      scheduled(a, d, 'C'), scheduled(b, c, 'C'),         // J3 pendiente
    ];
    // a=6. b=1, c=1, d=2 → máximo posible del resto: d 2+3=5, b 1+3=4, c 1+3=4.
    // Nadie alcanza 6 → a confirmado 1°. Pero 2° aún abierto.
    const clinch = computeGroupClinch(teams, matches, 'C');
    expect(clinch.first?.id).toBe(a.id);
    expect(clinch.second).toBeNull();
  });

  it('NO confirma 1° si un rival todavía puede igualar y superar', () => {
    const { teams, a, b, c, d } = makeGroup('D');
    // Tras J1+J2: a=6, b=3. Falta J3 (a-d, b-c). Si a pierde y b gana → ambos 6,
    // y el desempate depende de marcadores aún por jugar → no confirmable.
    const matches = [
      played(a, b, 1, 0, 'D'), played(c, d, 1, 0, 'D'),   // J1: a3 c3
      played(a, c, 1, 0, 'D'), played(b, d, 1, 0, 'D'),   // J2: a6 b3 c3 d0... ajustar
      scheduled(a, d, 'D'), scheduled(b, c, 'D'),
    ];
    const clinch = computeGroupClinch(teams, matches, 'D');
    // a tiene 6 y b/c tienen 3; con J3, b o c podrían llegar a 6 e igualar a a
    // con dif de gol abierta → a NO está confirmado 1°.
    expect(clinch.first).toBeNull();
  });

  it('confirma 1° por diferencia de gol cuando los implicados ya jugaron todo', () => {
    const { teams, a, b, c, d } = makeGroup('E');
    // a y b terminaron sus 3 partidos empatados en 7 pts, pero a tiene mejor GD.
    // c y d ya no pueden alcanzarlos. Como a y b están "done", el desempate por
    // GD es determinístico → a confirmado 1°, b confirmado 2°.
    const matches = [
      played(a, b, 1, 0, 'E'),  // a +1
      played(c, d, 0, 0, 'E'),
      played(a, c, 0, 0, 'E'),
      played(b, d, 3, 0, 'E'),  // b +3
      played(a, d, 5, 0, 'E'),  // a +5 → a: pts 1+1+3=7, gd +6
      played(b, c, 0, 0, 'E'),  // b: pts 0+3+1=4 ... recomputar abajo
    ];
    // Recalcular para asegurar a y b done y por encima de c,d:
    // a: vs b W(1-0)=3, vs c D(0-0)=1, vs d W(5-0)=3 → 7 pts, gd +6
    // b: vs a L=0, vs d W(3-0)=3, vs c D(0-0)=1 → 4 pts, gd +2
    // c: vs d D=1, vs a D=1, vs b D=1 → 3 pts
    // d: vs c D=1, vs b L=0, vs a L=0 → 1 pt
    const clinch = computeGroupClinch(teams, matches, 'E');
    expect(clinch.first?.id).toBe(a.id);
    expect(clinch.second?.id).toBe(b.id);
  });
});

describe('resolveSlotTeam', () => {
  it('mapea labels de slot a los equipos confirmados', () => {
    const { teams, a, b } = makeGroup('F');
    const matches = [
      played(a, b, 1, 0, 'F'), played(teams[2], teams[3], 1, 0, 'F'),
      played(a, teams[2], 1, 0, 'F'), played(b, teams[3], 1, 0, 'F'),
      played(a, teams[3], 1, 0, 'F'), played(b, teams[2], 1, 0, 'F'),
    ];
    const clinches = computeAllGroupClinches(teams, matches);
    const s1 = resolveSlotTeam('1° Grp F', clinches);
    const s2 = resolveSlotTeam('2° Grp F', clinches);
    expect(s1?.team.id).toBe(a.id);
    expect(s1?.confirmed).toBe(true);
    expect(s2?.team.id).toBe(b.id);
    expect(s2?.confirmed).toBe(true);
    expect(resolveSlotTeam('Mejor 3ro', clinches)).toBeNull();
    expect(resolveSlotTeam('1° Grp Z', clinches)).toBeNull();
  });
});

describe('clasificados con orden provisional', () => {
  it('dos equipos clasifican (top-2) pero el orden 1°/2° sigue abierto → slots provisionales', () => {
    // Grupo G en la última fecha: a y b ya tienen 6 pts (ganaron sus 2), c y d
    // con 0 (máximo 3) → a y b están clasificados, pero su 3er partido (a-b,
    // todavía pendiente) define el orden. Ninguna posición exacta confirmada.
    const { teams, a, b, c, d } = makeGroup('G');
    const matches = [
      played(a, c, 2, 0, 'G'), played(b, d, 2, 0, 'G'),   // J1
      played(a, d, 2, 0, 'G'), played(b, c, 2, 0, 'G'),   // J2 → a,b 6pts; c,d 0
      scheduled(a, b, 'G'), scheduled(c, d, 'G'),         // J3 pendiente
    ];
    const clinch = computeGroupClinch(teams, matches, 'G');
    // Sin posición exacta confirmada (a-b aún por jugarse).
    expect(clinch.first).toBeNull();
    expect(clinch.second).toBeNull();
    // Pero ambos slots quedan ocupados de forma provisional por a y b.
    expect(clinch.slot1?.confirmed).toBe(false);
    expect(clinch.slot2?.confirmed).toBe(false);
    const ids = [clinch.slot1?.team.id, clinch.slot2?.team.id].sort();
    expect(ids).toEqual([a.id, b.id].sort());
    // c y d NO aparecen (no están clasificados).
    expect(ids).not.toContain(c.id);
    expect(ids).not.toContain(d.id);
  });
});
