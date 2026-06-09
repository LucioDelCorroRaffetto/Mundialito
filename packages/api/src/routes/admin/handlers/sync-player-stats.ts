import type { Request, Response } from 'express';
import { syncFifaStatsForMatch } from '../../../services/sync-fifa-stats.js';

/**
 * POST /admin/matches/:id/sync-player-stats
 *
 * Manually triggers the API-Football per-player stats fetch for a single
 * finished match. The same logic auto-fires from sync-scores/sync-espn when
 * a match flips to `finished`; this endpoint is for retrying when the API
 * was rate-limited, when an admin corrects the score, or simply to force a
 * fresh sync.
 */
export async function syncPlayerStatsHandler(req: Request, res: Response) {
  const matchId = Number(req.params.id);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid match id' } });
  }
  // Admin endpoint forces a refresh even if stats already exist (e.g. the
  // first sync ran before the API had the full lineup, or the admin fixed
  // the score and wants stats recomputed).
  const result = await syncFifaStatsForMatch(matchId, { force: true });
  return res.json({ data: result });
}
