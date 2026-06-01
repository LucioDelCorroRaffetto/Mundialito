import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues, leagueMembers } from '../../../db/schema/index.js';
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

  await db.delete(leagueMembers).where(
    and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))
  );
  return res.status(204).send();
}
