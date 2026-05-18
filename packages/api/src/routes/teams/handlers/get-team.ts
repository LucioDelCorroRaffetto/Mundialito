import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { teams } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

export async function getTeamHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('Team');
  const team = await db.select().from(teams).where(eq(teams.id, id)).get();
  if (!team) throw new NotFoundError('Team');
  return res.json(team);
}
