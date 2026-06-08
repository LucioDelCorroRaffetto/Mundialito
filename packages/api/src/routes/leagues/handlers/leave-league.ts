import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers, predictions, tournamentPredictions } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq } from 'drizzle-orm';

export async function leaveLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.id, id)).get();
  if (!league) throw new NotFoundError('League');
  // Personal leagues are auto-provisioned containers; leaving would be the
  // same as deleting them and dropping all the user's predictions.
  if (league.isPersonal) {
    throw new AppError(
      'FORBIDDEN',
      'No podés salir de tu liga personal — ahí quedan guardados tus pronósticos.',
      403,
    );
  }
  if (league.adminId === userId) {
    throw new AppError(
      'FORBIDDEN',
      'Como admin no podés salir de la liga. Transferí el rol o eliminala.',
      403,
    );
  }

  // Drop the membership AND any predictions/tournament-predictions the user
  // had scoped to this league, atomically. Without this the user would
  // remain visible in the standings query (which joins by predictions →
  // user, not by membership) and rejoining later would silently keep the
  // old picks because the carry-over uses ON CONFLICT DO NOTHING.
  await db.transaction(async (tx) => {
    await tx.delete(leagueMembers).where(
      and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)),
    );
    await tx.delete(predictions).where(
      and(eq(predictions.leagueId, id), eq(predictions.userId, userId)),
    );
    await tx.delete(tournamentPredictions).where(
      and(eq(tournamentPredictions.leagueId, id), eq(tournamentPredictions.userId, userId)),
    );
  });
  return res.status(204).send();
}
