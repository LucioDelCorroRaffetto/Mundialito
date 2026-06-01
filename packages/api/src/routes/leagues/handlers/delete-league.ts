import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { leagues } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { eq } from 'drizzle-orm';

export async function deleteLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const league = await db.select().from(leagues).where(eq(leagues.id, id)).get();
  if (!league) throw new NotFoundError('League');
  if (league.adminId !== userId) throw new AppError('FORBIDDEN', 'Only admin can delete', 403);
  // Personal leagues are infra, not user-owned content. Deleting one would
  // cascade-drop every prediction the user ever made.
  if (league.isPersonal) {
    throw new AppError(
      'NOT_DELETABLE',
      'No podés borrar tu liga personal — es donde quedan guardados tus pronósticos.',
      403,
    );
  }

  await db.delete(leagues).where(eq(leagues.id, id));
  return res.status(204).send();
}
