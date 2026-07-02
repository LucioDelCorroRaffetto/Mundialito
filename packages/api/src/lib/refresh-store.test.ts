import { describe, it, expect } from 'vitest';
import { decideRotation, hashToken, type RotationDecision } from './refresh-store';
import type { RefreshTokenRow } from '../db/schema/index.js';

const NOW = '2026-07-02T12:00:00.000Z';

function row(overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow {
  return {
    id: 1,
    userId: 1,
    tokenHash: 'hash',
    familyId: 'family-1',
    expiresAt: '2026-08-01T00:00:00.000Z',
    revokedAt: null,
    replacedByHash: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('hashToken', () => {
  it('is deterministic and never returns the plain token', () => {
    const h1 = hashToken('some.jwt.token');
    const h2 = hashToken('some.jwt.token');
    expect(h1).toBe(h2);
    expect(h1).not.toContain('some.jwt.token');
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('decideRotation', () => {
  it('legacy: JWT válido pero sin fila en DB (usuarios logueados antes del deploy)', () => {
    const decision = decideRotation(undefined, NOW);
    expect(decision).toEqual<RotationDecision>({ action: 'legacy' });
  });

  it('reuse: token ya rotado (revokedAt no nulo) ⇒ señal de robo, revoca la familia', () => {
    const decision = decideRotation(row({ revokedAt: '2026-07-01T01:00:00.000Z', familyId: 'fam-x' }), NOW);
    expect(decision).toEqual<RotationDecision>({ action: 'reuse', familyId: 'fam-x' });
  });

  it('expired: fila vigente (no revocada) pero expiresAt <= now', () => {
    const decision = decideRotation(row({ expiresAt: '2026-07-01T00:00:00.000Z' }), NOW);
    expect(decision).toEqual<RotationDecision>({ action: 'expired' });
  });

  it('rotate: fila vigente y no expirada ⇒ emite sucesor en la misma familia', () => {
    const decision = decideRotation(row({ familyId: 'fam-y' }), NOW);
    expect(decision).toEqual<RotationDecision>({ action: 'rotate', familyId: 'fam-y' });
  });

  it('reuse tiene prioridad sobre expired si ambas condiciones se cumplen', () => {
    const decision = decideRotation(
      row({ revokedAt: '2026-07-01T01:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z', familyId: 'fam-z' }),
      NOW,
    );
    expect(decision).toEqual<RotationDecision>({ action: 'reuse', familyId: 'fam-z' });
  });
});
