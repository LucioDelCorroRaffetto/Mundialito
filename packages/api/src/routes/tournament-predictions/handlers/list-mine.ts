import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { tournamentPredictions } from '../../../db/schema/index.js';

/**
 * Returns every tournament prediction this user has across all leagues.
 * The client uses this to detect "first-ever pick" — if the list is empty,
 * saving without a leagueId will propagate to every league.
 */
export async function listMineTournamentPredictionsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(tournamentPredictions)
    .where(eq(tournamentPredictions.userId, userId));
  return res.json({ data: rows, meta: { total: rows.length } });
}
