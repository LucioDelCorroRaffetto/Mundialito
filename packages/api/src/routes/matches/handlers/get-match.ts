import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

export async function getMatchHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('Match');

  const match = await db.select().from(matches).where(eq(matches.id, id)).get();
  if (!match) throw new NotFoundError('Match');

  return res.json(match);
}
