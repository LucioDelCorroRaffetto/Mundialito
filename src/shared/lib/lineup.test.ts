import { describe, it, expect } from 'vitest';
import {
  toggleStarter,
  setCaptain,
  setVice,
  lineupBlocker,
  type LineupSlot,
  type PositionLookup,
} from './lineup';

// Plantel de prueba: 15 jugadores. ids 1-2 GK, 3-7 DEF, 8-12 MID, 13-15 FWD.
const POSITIONS: Record<number, string> = {
  1: 'GK', 2: 'GK',
  3: 'DEF', 4: 'DEF', 5: 'DEF', 6: 'DEF', 7: 'DEF',
  8: 'MID', 9: 'MID', 10: 'MID', 11: 'MID', 12: 'MID',
  13: 'FWD', 14: 'FWD', 15: 'FWD',
};
const positionOf: PositionLookup = (id) => POSITIONS[id];

/** Construye un draft con los ids dados como titulares (resto al banco). */
function draftWithStarters(starterIds: number[]): LineupSlot[] {
  return Object.keys(POSITIONS)
    .map(Number)
    .map((playerId) => ({
      playerId,
      isStarter: starterIds.includes(playerId),
      isCaptain: false,
      isViceCaptain: false,
    }));
}

// Un 11 válido: 1 GK, 4 DEF, 4 MID, 2 FWD.
const VALID_11 = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14];

describe('toggleStarter', () => {
  it('sube un suplente a titular cuando hay menos de 11', () => {
    const draft = draftWithStarters([1, 3, 4]);
    const { draft: next, error } = toggleStarter(draft, 8, positionOf);
    expect(error).toBeUndefined();
    expect(next.find((p) => p.playerId === 8)?.isStarter).toBe(true);
  });

  it('baja un titular al banco y le saca la cinta', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setCaptain(draft, 13);
    const { draft: next } = toggleStarter(draft, 13, positionOf);
    const p = next.find((x) => x.playerId === 13)!;
    expect(p.isStarter).toBe(false);
    expect(p.isCaptain).toBe(false);
  });

  it('rechaza subir un jugador de campo cuando ya hay 11 titulares', () => {
    const draft = draftWithStarters(VALID_11);
    const { draft: next, error } = toggleStarter(draft, 15, positionOf); // FWD suplente
    expect(error).toBeTruthy();
    expect(next).toBe(draft); // no muta ni cambia nada
    expect(next.find((p) => p.playerId === 15)?.isStarter).toBe(false);
  });

  it('swap automático del arquero: subir el GK suplente baja al GK titular', () => {
    const draft = draftWithStarters(VALID_11); // GK titular = 1
    const { draft: next, error } = toggleStarter(draft, 2, positionOf); // GK suplente
    expect(error).toBeUndefined();
    expect(next.find((p) => p.playerId === 2)?.isStarter).toBe(true);
    expect(next.find((p) => p.playerId === 1)?.isStarter).toBe(false);
    // Sigue habiendo exactamente 11 titulares y 1 arquero.
    const starters = next.filter((p) => p.isStarter);
    expect(starters).toHaveLength(11);
    expect(starters.filter((p) => positionOf(p.playerId) === 'GK')).toHaveLength(1);
  });

  it('el swap de arquero le saca la cinta al GK que baja', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setCaptain(draft, 1); // capitán = arquero titular
    const { draft: next } = toggleStarter(draft, 2, positionOf);
    expect(next.find((p) => p.playerId === 1)?.isCaptain).toBe(false);
  });

  it('no hace nada si el playerId no está en el draft', () => {
    const draft = draftWithStarters(VALID_11);
    const { draft: next } = toggleStarter(draft, 999, positionOf);
    expect(next).toBe(draft);
  });

  it('no muta el array original', () => {
    const draft = draftWithStarters([1, 3]);
    const snapshot = JSON.stringify(draft);
    toggleStarter(draft, 8, positionOf);
    expect(JSON.stringify(draft)).toBe(snapshot);
  });
});

describe('setCaptain / setVice', () => {
  it('capitán es único', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setCaptain(draft, 13);
    draft = setCaptain(draft, 14);
    expect(draft.filter((p) => p.isCaptain).map((p) => p.playerId)).toEqual([14]);
  });

  it('elegir capitán a quien era vice le saca el vice', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setVice(draft, 13);
    draft = setCaptain(draft, 13);
    const p = draft.find((x) => x.playerId === 13)!;
    expect(p.isCaptain).toBe(true);
    expect(p.isViceCaptain).toBe(false);
  });

  it('vice y capitán no pueden ser el mismo jugador', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setCaptain(draft, 13);
    draft = setVice(draft, 13);
    const p = draft.find((x) => x.playerId === 13)!;
    expect(p.isViceCaptain).toBe(true);
    expect(p.isCaptain).toBe(false);
  });
});

describe('lineupBlocker', () => {
  it('null cuando el 11 es válido con capitán y vice', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setCaptain(draft, 13);
    draft = setVice(draft, 14);
    expect(lineupBlocker(draft, positionOf)).toBeNull();
  });

  it('avisa cuántos titulares faltan', () => {
    const draft = draftWithStarters([1, 3, 4]);
    expect(lineupBlocker(draft, positionOf)).toBe('Faltan 8 titulares');
  });

  it('singular cuando falta solo 1', () => {
    const draft = draftWithStarters(VALID_11.slice(0, 10));
    expect(lineupBlocker(draft, positionOf)).toBe('Faltan 1 titular');
  });

  it('detecta falta de arquero', () => {
    // 11 titulares de campo, sin GK.
    const draft = draftWithStarters([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]);
    expect(lineupBlocker(draft, positionOf)).toBe('Falta el arquero titular');
  });

  it('detecta dos arqueros titulares', () => {
    const draft = draftWithStarters([1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 14]);
    expect(lineupBlocker(draft, positionOf)).toBe('Solo 1 arquero titular');
  });

  it('pide capitán cuando falta', () => {
    const draft = draftWithStarters(VALID_11);
    expect(lineupBlocker(draft, positionOf)).toBe('Elegí un capitán (C)');
  });

  it('pide vice cuando hay capitán pero no vice', () => {
    let draft = draftWithStarters(VALID_11);
    draft = setCaptain(draft, 13);
    expect(lineupBlocker(draft, positionOf)).toBe('Elegí un vicecapitán (V)');
  });
});
