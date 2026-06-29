import { describe, it, expect } from 'vitest';
import { resolveAdvancingSlot, type SlotContext } from './bracket-projection';
import type { BracketProjection } from './bracket-projection';
import { THIRD_PLACE_MATCH } from '@/shared/data/bracket';
import type { Match, Team } from '@/shared/types/api';

const TBD_ID = 49; // placeholder real en la DB de prod (code 'TBD')

function team(id: number, code: string): Team {
  return { id, code, flag: '🏳️', name: code, group: null, confederation: null };
}

// En producción los partidos de eliminación NO traen equipos reales: ambos lados
// quedan en el placeholder TBD (id 49). Por eso el default refleja esa realidad.
function mkMatch(matchNumber: number, partial: Partial<Match> = {}): Match {
  return {
    id: matchNumber, matchNumber, homeTeamId: TBD_ID, awayTeamId: TBD_ID,
    kickoffUtc: '', predictionLockUtc: '', venue: '', city: '', group: null, round: 'knockout',
    status: 'finished', liveStatus: null, currentMinute: null, homeScore: null, awayScore: null,
    ...partial,
  };
}

const ZAF = team(10, 'ZAF');
const CAN = team(11, 'CAN');
const teamMap = new Map<number, Team>([[TBD_ID, team(TBD_ID, 'TBD')], [ZAF.id, ZAF], [CAN.id, CAN]]);

// Proyección mínima: 2° de grupo A = ZAF, 2° de grupo B = CAN (los slots home/away
// de M73 = "2° Grp A" / "2° Grp B"). Eso es lo que muestra el cuadro hoy.
const projection: BracketProjection = {
  clinches: new Map([
    ['A', { first: null, second: ZAF, slot1: null, slot2: { team: ZAF, confirmed: true } }],
    ['B', { first: null, second: CAN, slot1: null, slot2: { team: CAN, confirmed: true } }],
  ]),
  thirdSlots: new Map(),
};

function ctxWith(matches: Match[]): SlotContext {
  return { matchByNum: new Map(matches.map((m) => [m.matchNumber, m])), teamMap, projection };
}

describe('resolveAdvancingSlot — identidad vía proyección, no team IDs del partido', () => {
  it('R32: resuelve cada lado desde la fase de grupos aunque el partido tenga TBD', () => {
    const ctx = ctxWith([mkMatch(73, { homeScore: 0, awayScore: 1 })]);
    expect(resolveAdvancingSlot(73, 'home', ctx)?.code).toBe('ZAF');
    expect(resolveAdvancingSlot(73, 'away', ctx)?.code).toBe('CAN');
  });

  it('propaga el GANADOR (por marcador) al cruce siguiente — el bug de Canadá', () => {
    // M73 termina ZAF 0 - 1 CAN (ambos con team_id = 49 en la DB). El ganador
    // se decide por el marcador y la identidad sale de la proyección: CAN.
    // M90 children = [73, 75] → su slot home es el ganador de M73.
    const ctx = ctxWith([mkMatch(73, { homeScore: 0, awayScore: 1 })]);
    expect(resolveAdvancingSlot(90, 'home', ctx)?.code).toBe('CAN');
  });

  it('no propaga mientras el cruce hijo no terminó', () => {
    const ctx = ctxWith([mkMatch(73, { status: 'live', homeScore: 0, awayScore: 1 })]);
    expect(resolveAdvancingSlot(90, 'home', ctx)).toBeNull();
  });

  it('no propaga un empate finished (penales aún sin resolver en el marcador)', () => {
    const ctx = ctxWith([mkMatch(73, { homeScore: 1, awayScore: 1 })]);
    expect(resolveAdvancingSlot(90, 'home', ctx)).toBeNull();
  });

  it('prioriza el equipo REAL si el feed ya lo asignó al cruce', () => {
    const ctx = ctxWith([mkMatch(90, { homeTeamId: CAN.id, awayTeamId: TBD_ID, status: 'scheduled' })]);
    expect(resolveAdvancingSlot(90, 'home', ctx)?.code).toBe('CAN');
  });

  it('3er puesto: toma el PERDEDOR de la semi (con equipos reales en la semi)', () => {
    // M101 con equipos reales: ZAF 1 - 0 CAN → pierde CAN → va al 3er puesto.
    const ctx = ctxWith([
      mkMatch(101, { homeTeamId: ZAF.id, awayTeamId: CAN.id, homeScore: 1, awayScore: 0 }),
    ]);
    expect(resolveAdvancingSlot(THIRD_PLACE_MATCH.matchNumber, 'home', ctx)?.code).toBe('CAN');
  });
});
