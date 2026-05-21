// POST /admin/sync-scores
// Triggers a manual sync of today's match scores from football-data.org
// Returns: { synced, errors, matchesChecked }

import { Request, Response } from 'express';
import { syncScores } from '../../../services/sync-scores.js';

export async function syncScoresHandler(req: Request, res: Response) {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const result = await syncScores({ dateFrom: today, dateTo: today });
  return res.json({ data: result });
}
