import { describe, it, expect } from 'vitest';
import { computeSyncDateFrom, type MatchWindowRow } from './sync-window';

const NOW = new Date('2026-06-28T03:00:00.000Z');
const YESTERDAY = '2026-06-27';

const row = (status: string, kickoffUtc: string): MatchWindowRow => ({ status, kickoffUtc });

describe('computeSyncDateFrom', () => {
  it('devuelve ayer cuando no hay nada colgado (estado normal)', () => {
    const rows = [
      row('finished', '2026-06-25T18:00:00Z'),
      row('finished', '2026-06-27T18:00:00Z'),
      row('scheduled', '2026-06-29T18:00:00Z'), // futuro
      row('live', '2026-06-28T02:00:00Z'), // en curso, kickoff hace 1h
    ];
    expect(computeSyncDateFrom(rows, NOW)).toBe(YESTERDAY);
  });

  it('ensancha la ventana hasta el kickoff del colgado más viejo', () => {
    const rows = [
      row('finished', '2026-06-27T18:00:00Z'),
      row('scheduled', '2026-06-25T17:00:00Z'), // colgado: pasado y no finished
      row('scheduled', '2026-06-26T20:00:00Z'), // colgado más nuevo
    ];
    expect(computeSyncDateFrom(rows, NOW)).toBe('2026-06-25');
  });

  it('un live colgado (kickoff hace >3.5h, sin cerrar) también ensancha', () => {
    const rows = [row('live', '2026-06-24T12:00:00Z')];
    expect(computeSyncDateFrom(rows, NOW)).toBe('2026-06-24');
  });

  it('incluye suspended (postergado que luego se juega) como colgado', () => {
    const rows = [row('suspended', '2026-06-23T15:00:00Z')];
    expect(computeSyncDateFrom(rows, NOW)).toBe('2026-06-23');
  });

  it('ignora partidos futuros aunque no estén finished', () => {
    const rows = [
      row('scheduled', '2026-06-30T18:00:00Z'),
      row('scheduled', '2026-07-02T18:00:00Z'),
    ];
    expect(computeSyncDateFrom(rows, NOW)).toBe(YESTERDAY);
  });

  it('acota a maxLookbackDays para no ensanchar indefinidamente (CANCELLED viejo)', () => {
    const rows = [row('suspended', '2026-01-01T00:00:00Z')]; // ~6 meses atrás
    // floor = now - 10 días = 2026-06-18
    expect(computeSyncDateFrom(rows, NOW, 10)).toBe('2026-06-18');
  });

  it('respeta un maxLookbackDays custom', () => {
    const rows = [row('scheduled', '2026-06-20T10:00:00Z')];
    // dentro de 10 días → toma el kickoff real
    expect(computeSyncDateFrom(rows, NOW, 10)).toBe('2026-06-20');
    // con tope de 3 días → floor = 2026-06-25
    expect(computeSyncDateFrom(rows, NOW, 3)).toBe('2026-06-25');
  });

  it('nunca devuelve una ventana más angosta que ayer', () => {
    // único colgado es de hoy temprano pero igual debe cubrir al menos ayer
    const rows = [row('scheduled', '2026-06-28T01:00:00Z')];
    const out = computeSyncDateFrom(rows, NOW);
    expect(out <= YESTERDAY).toBe(true);
  });

  it('tolera kickoffUtc inválido sin romper', () => {
    const rows = [row('scheduled', 'not-a-date'), row('finished', '2026-06-27T18:00:00Z')];
    expect(computeSyncDateFrom(rows, NOW)).toBe(YESTERDAY);
  });

  it('lista vacía → ayer', () => {
    expect(computeSyncDateFrom([], NOW)).toBe(YESTERDAY);
  });
});
