import { Request, Response } from 'express';
import { finalizeFantasyLegends } from '../../../services/achievement-service.js';

/**
 * Awards the `fantasy_legend` logro to the highest-scoring fantasy player in
 * every league. Meant to be called once at the end of the tournament when
 * the fantasy season is over.
 *
 * Idempotent: maybeAward uses the unique (user, slug) index, so calling this
 * twice won't double-grant. Re-runs return only newly-awarded winners.
 */
export async function finalizeFantasyHandler(_req: Request, res: Response) {
  const winners = await finalizeFantasyLegends();
  return res.json({ data: { winners, count: winners.length } });
}
