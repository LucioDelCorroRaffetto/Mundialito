import { Request, Response } from 'express';
import { FANTASY_ROUNDS, getCurrentFantasyRound } from '../../../lib/fantasy-rounds.js';

/** Returns all fantasy rounds with deadline info and which one is currently active. */
export async function getFantasyRoundsHandler(_req: Request, res: Response) {
  const current = getCurrentFantasyRound();
  return res.json({
    data: FANTASY_ROUNDS.map((r) => ({
      slug: r.slug,
      label: r.label,
      deadline: r.deadline,
      isOpen: Date.now() < new Date(r.deadline).getTime(),
      isCurrent: r.slug === current?.slug,
    })),
    meta: { currentRound: current?.slug ?? null },
  });
}
