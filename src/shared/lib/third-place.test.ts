import { describe, it, expect } from 'vitest';
import {
  resolveThirdPlaceSlots,
  computeThirdPlaceRanking,
  isGroupStageComplete,
  WINNER_TO_R32_MATCH,
} from './third-place';
import { THIRD_PLACE_COMBINATIONS, THIRD_PLACE_WINNERS } from '@/shared/data/third-place-combinations';
import type { Match, Team } from '@/shared/types/api';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

let nextId = 1;
let matchNum = 1;
function mkTeam(name: string, group: string): Team {
  return { id: nextId++, name, code: name.slice(0, 3).toUpperCase(), flag: '🏳️', group, confederation: null };
}
function mkMatch(home: Team, away: Team, hs: number, as: number, group: string): Match {
  return {
    id: matchNum, matchNumber: matchNum++, homeTeamId: home.id, awayTeamId: away.id,
    kickoffUtc: '', predictionLockUtc: '', venue: '', city: '', group, round: 'group',
    status: 'finished', liveStatus: null, currentMinute: null, homeScore: hs, awayScore: as,
  };
}

/**
 * Grupo completo y determinístico. t1 gana todo (9), t2 gana a t3/t4 (6).
 * Si `strongThird`, t3 le gana a t4 → 3° con 3 pts; si no, empatan → 3° con 1 pt.
 * Devuelve el equipo que queda 3° (siempre t3).
 */
function fullGroup(g: string, strongThird: boolean) {
  const t1 = mkTeam(`${g}1`, g), t2 = mkTeam(`${g}2`, g), t3 = mkTeam(`${g}3`, g), t4 = mkTeam(`${g}4`, g);
  const matches = [
    mkMatch(t1, t2, 1, 0, g), mkMatch(t1, t3, 1, 0, g), mkMatch(t1, t4, 1, 0, g),
    mkMatch(t2, t3, 1, 0, g), mkMatch(t2, t4, 1, 0, g),
    strongThird ? mkMatch(t3, t4, 1, 0, g) : mkMatch(t3, t4, 0, 0, g),
  ];
  return { teams: [t1, t2, t3, t4], matches, third: t3 };
}

/** Mundial completo. `strongGroups` = grupos cuyo 3° saca 3 pts (clasifican). */
function fullWorld(strongGroups: string[]) {
  const strong = new Set(strongGroups);
  const teams: Team[] = [];
  const matches: Match[] = [];
  const thirdByGroup = new Map<string, Team>();
  for (const g of GROUP_LETTERS) {
    const grp = fullGroup(g, strong.has(g));
    teams.push(...grp.teams);
    matches.push(...grp.matches);
    thirdByGroup.set(g, grp.third);
  }
  return { teams, matches, thirdByGroup };
}

describe('isGroupStageComplete', () => {
  it('false si quedan partidos sin jugar', () => {
    const { teams, matches } = fullWorld(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const incomplete = matches.map((m, i) =>
      i === 0 ? { ...m, status: 'scheduled' as const, homeScore: null, awayScore: null } : m,
    );
    expect(isGroupStageComplete(teams, incomplete)).toBe(false);
  });

  it('true con los 72 partidos terminados', () => {
    const { teams, matches } = fullWorld(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(isGroupStageComplete(teams, matches)).toBe(true);
  });
});

describe('resolveThirdPlaceSlots — coincide con el Anexo C oficial', () => {
  it('grupos A–H como mejores terceros → fila ABCDEFGH del Anexo C', () => {
    const strong = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const { teams, matches, thirdByGroup } = fullWorld(strong);

    // Sanidad: los 8 mejores terceros son justo A–H.
    const ranking = computeThirdPlaceRanking(teams, matches);
    expect(ranking.slice(0, 8).map((e) => e.group).sort()).toEqual(strong);

    const key = 'ABCDEFGH';
    const assignment = THIRD_PLACE_COMBINATIONS[key];
    expect(assignment).toBeDefined();

    const slots = resolveThirdPlaceSlots(teams, matches);
    expect(slots.size).toBe(8);

    // Cada ganador W debe enfrentar al 3° del grupo que dice el Anexo C.
    THIRD_PLACE_WINNERS.forEach((winner, idx) => {
      const expectedThirdGroup = assignment[idx];
      const matchNumber = WINNER_TO_R32_MATCH[winner];
      const expectedTeam = thirdByGroup.get(expectedThirdGroup)!;
      expect(slots.get(matchNumber)?.id).toBe(expectedTeam.id);
    });
  });

  it('devuelve vacío si la fase de grupos no terminó', () => {
    const { teams, matches } = fullWorld(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const incomplete = matches.map((m) => ({ ...m, status: 'scheduled' as const, homeScore: null, awayScore: null }));
    expect(resolveThirdPlaceSlots(teams, incomplete).size).toBe(0);
  });

  it('todas las claves del Anexo C son permutaciones válidas de sus grupos', () => {
    for (const [key, value] of Object.entries(THIRD_PLACE_COMBINATIONS)) {
      expect(value.length).toBe(8);
      expect([...value].sort().join('')).toBe([...key].sort().join(''));
    }
  });
});
