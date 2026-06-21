import { describe, it, expect } from 'vitest';
import {
  parseDescription, hasFinalWhistle, editDistanceAtMostOne, normName,
} from './fifa-parse';

describe('parseDescription', () => {
  it('formato "SURNAME (Country) ..." extrae apellido y país', () => {
    expect(parseDescription('FODEN (England) scores!!'))
      .toEqual({ surname: 'FODEN', country: 'England' });
  });

  it('"Assisted by KANE." → país null (se resuelve por IdTeam)', () => {
    expect(parseDescription('Assisted by KANE.'))
      .toEqual({ surname: 'KANE', country: null });
  });

  // Gotcha: "(in)"/"(out)" NO son países.
  it('paréntesis no-país ("(in)") no se toma como country', () => {
    const r = parseDescription('ROBERTS (in) comes off the bench to play.');
    expect(r?.surname).toBe('ROBERTS');
    expect(r?.country).toBeNull();
  });

  it('descripción sin patrón → null', () => {
    expect(parseDescription('The referee checks the VAR monitor.')).toBeNull();
    expect(parseDescription(undefined)).toBeNull();
  });
});

describe('hasFinalWhistle (cierre rápido Type 26)', () => {
  it('detecta el evento Type 26', () => {
    expect(hasFinalWhistle([{ Type: 26 }])).toBe(true);
  });

  it('detecta por descripción "final whistle" aunque cambie el Type', () => {
    expect(hasFinalWhistle([
      { Type: 99, EventDescription: [{ Locale: 'en', Description: 'The final whistle sounds.' }] },
    ])).toBe(true);
  });

  it('sin pitazo → false', () => {
    expect(hasFinalWhistle([{ Type: 0 }, { Type: 2 }])).toBe(false);
  });
});

describe('editDistanceAtMostOne (transliteraciones)', () => {
  it('tolera 1 typo en nombres largos (Mohebbi/Mohebi)', () => {
    expect(editDistanceAtMostOne('mohebbi', 'mohebi')).toBe(true);
  });

  it('idénticos → true', () => {
    expect(editDistanceAtMostOne('messi', 'messi')).toBe(true);
  });

  it('rechaza 2+ diferencias', () => {
    expect(editDistanceAtMostOne('messi', 'mostt')).toBe(false);
  });
});

describe('normName (normalización para matching)', () => {
  it('baja a minúsculas, saca acentos combinables y apóstrofes, colapsa espacios', () => {
    expect(normName('  Pérez  ')).toBe('perez');
    expect(normName('Müller')).toBe('muller');
    expect(normName("O'Brien")).toBe('obrien');
    expect(normName('De-Bruyne')).toBe('de bruyne');
  });
});
