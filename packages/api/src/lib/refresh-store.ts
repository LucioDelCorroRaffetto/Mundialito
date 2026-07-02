import crypto from 'node:crypto';
import { eq, and, isNull, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { refreshTokens, type RefreshTokenRow } from '../db/schema/index.js';
import { signRefresh, verifyRefresh, type JwtPayload } from './jwt.js';
import { UnauthorizedError } from './errors.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días, espeja signRefresh
const PRUNE_RETENTION_MS = 5 * 24 * 60 * 60 * 1000; // conservar 5 días post-expiración
const PRUNE_PROBABILITY = 0.02; // ~1/50

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type RotationDecision =
  | { action: 'legacy' }
  | { action: 'reuse'; familyId: string }
  | { action: 'expired' }
  | { action: 'rotate'; familyId: string };

/**
 * Lógica pura de la decisión de rotación — separada del acceso a DB para
 * poder testearla sin tocar Turso. `row` es lo que devolvería la búsqueda
 * por hash (undefined si no hay fila = caso legacy).
 */
export function decideRotation(row: RefreshTokenRow | undefined, nowIso: string): RotationDecision {
  if (!row) return { action: 'legacy' };
  if (row.revokedAt != null) return { action: 'reuse', familyId: row.familyId };
  if (row.expiresAt <= nowIso) return { action: 'expired' };
  return { action: 'rotate', familyId: row.familyId };
}

export async function issueRefreshToken(payload: JwtPayload, familyId?: string): Promise<string> {
  const token = signRefresh(payload);
  const family = familyId ?? crypto.randomUUID();
  await db.insert(refreshTokens).values({
    userId: payload.sub,
    tokenHash: hashToken(token),
    familyId: family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  });
  return token;
}

export async function rotateRefreshToken(token: string): Promise<{ token: string; payload: JwtPayload }> {
  let payload: JwtPayload;
  try {
    payload = verifyRefresh(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  void maybePruneExpired();

  const hash = hashToken(token);
  const row = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).get();
  const decision = decideRotation(row, new Date().toISOString());

  switch (decision.action) {
    case 'legacy': {
      const newToken = await issueRefreshToken({ sub: payload.sub, username: payload.username });
      return { token: newToken, payload };
    }
    case 'reuse': {
      await db.update(refreshTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(refreshTokens.familyId, decision.familyId), isNull(refreshTokens.revokedAt)));
      throw new UnauthorizedError('Refresh token reuse detected');
    }
    case 'expired':
      throw new UnauthorizedError('Invalid or expired refresh token');
    case 'rotate': {
      const newToken = await issueRefreshToken({ sub: payload.sub, username: payload.username }, decision.familyId);
      await db.update(refreshTokens)
        .set({ revokedAt: new Date().toISOString(), replacedByHash: hashToken(newToken) })
        .where(eq(refreshTokens.tokenHash, hash));
      return { token: newToken, payload };
    }
  }
}

export async function revokeToken(token: string): Promise<void> {
  await db.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(refreshTokens.tokenHash, hashToken(token)));
}

export async function revokeAllForUser(userId: number): Promise<void> {
  await db.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

async function maybePruneExpired(): Promise<void> {
  if (Math.random() >= PRUNE_PROBABILITY) return;
  try {
    await pruneExpired();
  } catch (err) {
    console.error('[refresh-store] pruneExpired failed:', err);
  }
}

export async function pruneExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - PRUNE_RETENTION_MS).toISOString();
  await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, cutoff));
}
