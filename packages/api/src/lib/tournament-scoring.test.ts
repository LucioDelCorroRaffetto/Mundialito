import { describe, it, expect } from 'vitest';
import {
  TOURNAMENT_POINTS,
  DEPTH,
  depthReachedFrom,
  expectedDepthFromEloRank,
  pickRevelation,
  pickSurpriseEliminated,
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
  revelationTeamId: 7,
  surpriseEliminatedTeamId: 8,
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

describe('pickRevelation / pickSurpriseEliminated', () => {
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

  it('decepción: el favorito que más quedó por debajo (Argentina afuera en grupos)', () => {
    const teams = onPar();
    set(teams, 2, DEPTH.group); // esperado final(5) → grupos(0): brecha −5
    expect(pickSurpriseEliminated(teams)).toBe(2);
  });

  it('ceniciento: el modesto que más superó su expectativa', () => {
    const teams = onPar();
    set(teams, 40, DEPTH.qf); // esperado grupos(0) → cuartos(3): +3
    expect(pickRevelation(teams)).toBe(40);
  });

  it('un favorito que sobre-rinde no es ceniciento (no es modesto)', () => {
    const teams = onPar();
    set(teams, 1, DEPTH.champion); // favorito (esperado final) que gana: +1 pero no modesto
    expect(pickRevelation(teams)).toBeNull();
  });

  it('un modesto que falla no es decepción (no es favorito)', () => {
    const teams = onPar();
    set(teams, 40, DEPTH.group); // ya esperaba grupos: ni siquiera sub-rinde
    expect(pickSurpriseEliminated(teams)).toBeNull();
  });

  it('nadie sobre/sub-rinde → null', () => {
    const teams = onPar();
    expect(pickRevelation(teams)).toBeNull();
    expect(pickSurpriseEliminated(teams)).toBeNull();
  });

  it('desempate de ceniciento: gana el más modesto (menor Elo) a igual sobre-rendimiento', () => {
    const teams = onPar();
    set(teams, 30, DEPTH.qf); // rank30 → esperado R32(1), +2
    set(teams, 45, DEPTH.r16); // rank45 → esperado grupos(0), +2 — más modesto
    expect(pickRevelation(teams)).toBe(45);
  });
});
