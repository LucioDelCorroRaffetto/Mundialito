import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyRoundScores } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

/**
 * GET /fantasy/team/:userId/points-by-round
 * Devuelve los puntos del usuario en cada round que tenga score cacheado.
 *
 * Lee directamente de fantasy_round_scores (la cache que mantiene el
 * scoring service). Si el round todavía no tiene fila — porque aún no
 * empezó o porque el usuario nunca armó lineup ahí — no aparece.
 * El cliente completa con 0 los rounds faltantes.
 */
export async function getUserPointsByRoundHandler(req: Request, res: Response) {
  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Invalid userId', 400);
  }

  const rows = await db
    .select({ round: fantasyRoundScores.round, points: fantasyRoundScores.points })
    .from(fantasyRoundScores)
    .where(eq(fantasyRoundScores.userId, targetUserId));

  return res.json({ data: rows });
}
