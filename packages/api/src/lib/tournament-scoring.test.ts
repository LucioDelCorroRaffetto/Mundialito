import { describe, it, expect } from 'vitest';
import {
  TOURNAMENT_POINTS,
  DEPTH,
  depthReachedFrom,
  expectedDepthFromEloRank,
  pickRevelations,
  pickDisappointments,
  scoreTournamentPrediction,
  type Round,
  type TeamRun,
  type TournamentOutcome,
  type TournamentPick,
} from './tournament-scoring';

const emptyPick: TournamentPick = {
  championTeamId: null,
  runnerUpTeamId: null,
  thirdPlaceTeamId: null,
  topScorerPlayerId: null,
  revelationTeamId: null,
  surpriseEliminatedTeamId: null,
  bestDefenseTeamId: null,
};

const outcome: TournamentOutcome = {
  championTeamId: 1,
  runnerUpTeamId: 2,
  thirdPlaceTeamId: 3,
  topScorerPlayerIds: [10, 11], // empate al tope
  revelationTeamIds: [7, 9], // varias sorpresas
  surpriseEliminatedTeamIds: [8, 6], // varias decepciones
  bestDefenseTeamIds: [4, 5], // empate de promedio
};

describe('scoreTournamentPrediction', () => {
  it('predicción vacía → 0', () => {
    expect(scoreTournamentPrediction(emptyPick, outcome)).toBe(0);
  });

  it('cada acierto suma su categoría', () => {
    expect(scoreTournamentPrediction({ ...emptyPick, championTeamId: 1 }, outcome)).toBe(
      TOURNAMENT_POINTS.champion,
    );
    expect(scoreTournamentPrediction({ ...emptyPick, runnerUpTeamId: 2 }, outcome)).toBe(
      TOURNAMENT_POINTS.runnerUp,
    );
    expect(scoreTournamentPrediction({ ...emptyPick, thirdPlaceTeamId: 3 }, outcome)).toBe(
      TOURNAMENT_POINTS.thirdPlace,
    );
    expect(scoreTournamentPrediction({ ...emptyPick, revelationTeamId: 7 }, outcome)).toBe(
      TOURNAMENT_POINTS.revelation,
    );
    expect(scoreTournamentPrediction({ ...emptyPick, surpriseEliminatedTeamId: 8 }, outcome)).toBe(
      TOURNAMENT_POINTS.surpriseEliminated,
    );
  });

  it('goleador: acertar cualquiera de los empatados cuenta', () => {
    expect(scoreTournamentPrediction({ ...emptyPick, topScorerPlayerId: 10 }, outcome)).toBe(15);
    expect(scoreTournamentPrediction({ ...emptyPick, topScorerPlayerId: 11 }, outcome)).toBe(15);
    expect(scoreTournamentPrediction({ ...emptyPick, topScorerPlayerId: 99 }, outcome)).toBe(0);
  });

  it('valla menos vencida: acertar cualquiera de los empatados cuenta', () => {
    expect(scoreTournamentPrediction({ ...emptyPick, bestDefenseTeamId: 4 }, outcome)).toBe(8);
    expect(scoreTournamentPrediction({ ...emptyPick, bestDefenseTeamId: 5 }, outcome)).toBe(8);
    expect(scoreTournamentPrediction({ ...emptyPick, bestDefenseTeamId: 1 }, outcome)).toBe(0);
  });

  it('sorpresa y decepción: acertar cualquiera de la lista cuenta', () => {
    expect(scoreTournamentPrediction({ ...emptyPick, revelationTeamId: 7 }, outcome)).toBe(10);
    expect(scoreTournamentPrediction({ ...emptyPick, revelationTeamId: 9 }, outcome)).toBe(10);
    expect(scoreTournamentPrediction({ ...emptyPick, revelationTeamId: 99 }, outcome)).toBe(0);
    expect(scoreTournamentPrediction({ ...emptyPick, surpriseEliminatedTeamId: 8 }, outcome)).toBe(10);
    expect(scoreTournamentPrediction({ ...emptyPick, surpriseEliminatedTeamId: 6 }, outcome)).toBe(10);
    expect(scoreTournamentPrediction({ ...emptyPick, surpriseEliminatedTeamId: 99 }, outcome)).toBe(0);
  });

  it('acierto perfecto suma todas las categorías', () => {
    const perfect: TournamentPick = {
      championTeamId: 1,
      runnerUpTeamId: 2,
      thirdPlaceTeamId: 3,
      topScorerPlayerId: 10,
      revelationTeamId: 7,
      surpriseEliminatedTeamId: 8,
      bestDefenseTeamId: 4,
    };
    const total = Object.values(TOURNAMENT_POINTS).reduce((a, b) => a + b, 0);
    expect(scoreTournamentPrediction(perfect, outcome)).toBe(total);
  });
});

describe('depthReachedFrom', () => {
  const r = (...rs: Round[]) => rs;
  it('sólo grupos → 0', () => {
    expect(depthReachedFrom(r('group'), false)).toBe(DEPTH.group);
  });
  it('toma la ronda más profunda', () => {
    expect(depthReachedFrom(r('group', 'r32', 'r16'), false)).toBe(DEPTH.r16);
    expect(depthReachedFrom(r('group', 'r32', 'r16', 'qf', 'sf'), false)).toBe(DEPTH.sf);
  });
  it('jugar el bronce implica haber llegado a semis', () => {
    expect(depthReachedFrom(r('group', 'r32', 'r16', 'qf', 'sf', 'third'), false)).toBe(DEPTH.sf);
  });
  it('campeón supera a la final', () => {
    expect(depthReachedFrom(r('group', 'r32', 'r16', 'qf', 'sf', 'final'), true)).toBe(DEPTH.champion);
    expect(depthReachedFrom(r('group', 'r32', 'r16', 'qf', 'sf', 'final'), false)).toBe(DEPTH.final);
  });
});

describe('expectedDepthFromEloRank', () => {
  it('mapea el rank de Elo a la profundidad esperada', () => {
    expect(expectedDepthFromEloRank(1)).toBe(DEPTH.final);
    expect(expectedDepthFromEloRank(4)).toBe(DEPTH.sf);
    expect(expectedDepthFromEloRank(8)).toBe(DEPTH.qf);
    expect(expectedDepthFromEloRank(16)).toBe(DEPTH.r16);
    expect(expectedDepthFromEloRank(32)).toBe(DEPTH.r32);
    expect(expectedDepthFromEloRank(48)).toBe(DEPTH.group);
  });
});

describe('pickRevelations / pickDisappointments', () => {
  // El rank de Elo (y por ende la expectativa) se calcula entre TODOS los
  // equipos, así que los tests usan un cuadro realista de 48. Con
  // elo = 2200 − 10·id, el rank coincide con el id (id 1 = más fuerte).
  // Por defecto cada equipo llega justo a su profundidad esperada (on-par).
  const RANKS = 48;
  function onPar(): TeamRun[] {
    return Array.from({ length: RANKS }, (_, i) => {
      const id = i + 1;
      return { teamId: id, elo: 2200 - 10 * id, depthReached: expectedDepthFromEloRank(id) };
    });
  }
  const set = (teams: TeamRun[], id: number, depthReached: number) => {
    const t = teams.find((x) => x.teamId === id)!;
    t.depthReached = depthReached;
  };

  it('decepción: el favorito que quedó muy por debajo (Argentina afuera en grupos)', () => {
    const teams = onPar();
    set(teams, 2, DEPTH.group); // esperado final(5) → grupos(0): brecha −5
    expect(pickDisappointments(teams)).toEqual([2]);
  });

  it('decepción múltiple: entran todos los que subrinden por ≥2 rondas, mayor brecha primero', () => {
    const teams = onPar();
    set(teams, 3, DEPTH.r16); // esperado semis(4) → octavos(2): −2 (Brasil con Noruega)
    set(teams, 11, DEPTH.group); // esperado octavos(2) → grupos(0): −2 (Uruguay en grupos)
    set(teams, 2, DEPTH.group); // esperado final(5) → grupos(0): −5
    // brecha −5 primero; los dos −2 desempatan por mayor Elo (rank 3 < rank 11)
    expect(pickDisappointments(teams)).toEqual([2, 3, 11]);
  });

  it('decepción: subrendir por 1 ronda perdiendo con un rival superior no alcanza (caso Portugal)', () => {
    const teams = onPar();
    const t = teams.find((x) => x.teamId === 5)!;
    t.depthReached = DEPTH.r16; // esperado cuartos(3) → octavos(2): −1
    t.worstLossEloDiff = -50; // perdió contra una superior (España): no es batacazo
    expect(pickDisappointments(teams)).toEqual([]);
  });

  it('decepción por batacazo: subrendir 1 ronda perdiendo con una muy inferior SÍ entra (caso Alemania)', () => {
    const teams = onPar();
    const t = teams.find((x) => x.teamId === 9)!;
    t.depthReached = DEPTH.r32; // esperado octavos(2) → R32(1): −1
    t.worstLossEloDiff = 298; // perdió con Paraguay, ~300 pts de Elo abajo
    expect(pickDisappointments(teams)).toEqual([9]);
  });

  it('batacazo sin subrendir no es decepción (perdió un partido suelto pero llegó a lo esperado)', () => {
    const teams = onPar();
    const t = teams.find((x) => x.teamId === 9)!;
    t.worstLossEloDiff = 300; // batacazo en grupos, pero depthReached = esperado
    expect(pickDisappointments(teams)).toEqual([]);
  });

  it('un top-16 (esperado a octavos) afuera en grupos SÍ es decepción', () => {
    const teams = onPar();
    set(teams, 11, DEPTH.group); // caso Uruguay: esperado octavos(2) → grupos(0)
    expect(pickDisappointments(teams)).toEqual([11]);
  });

  it('sorpresa: el modesto que superó su expectativa por ≥2 rondas', () => {
    const teams = onPar();
    set(teams, 40, DEPTH.qf); // esperado grupos(0) → cuartos(3): +3
    expect(pickRevelations(teams)).toEqual([40]);
  });

  it('sorpresa múltiple: entran todos, mayor brecha primero y desempate por menor Elo', () => {
    const teams = onPar();
    set(teams, 40, DEPTH.r16); // esperado grupos(0) → octavos(2): +2 (caso Paraguay)
    set(teams, 25, DEPTH.qf); // esperado R32(1) → cuartos(3): +2 (caso Noruega)
    set(teams, 45, DEPTH.sf); // esperado grupos(0) → semis(4): +4
    // +4 primero; los dos +2 desempatan por menor Elo (rank 40 más modesto que 25)
    expect(pickRevelations(teams)).toEqual([45, 40, 25]);
  });

  it('sorpresa: a una chica le alcanza con pasar 1 ronda de más (caso Cabo Verde)', () => {
    const teams = onPar();
    set(teams, 40, DEPTH.r32); // debutante esperada a grupos(0) → R32(1): +1
    expect(pickRevelations(teams)).toEqual([40]);
  });

  it('un favorito que sobre-rinde no es sorpresa (no es modesto)', () => {
    const teams = onPar();
    set(teams, 1, DEPTH.champion); // favorito (esperado final) que gana: +1 pero no modesto
    expect(pickRevelations(teams)).toEqual([]);
  });

  it('un modesto que falla no es decepción (no tiene historia que defraudar)', () => {
    const teams = onPar();
    set(teams, 40, DEPTH.group); // ya esperaba grupos: ni siquiera sub-rinde
    expect(pickDisappointments(teams)).toEqual([]);
  });

  it('nadie sobre/sub-rinde → listas vacías', () => {
    const teams = onPar();
    expect(pickRevelations(teams)).toEqual([]);
    expect(pickDisappointments(teams)).toEqual([]);
  });
});
