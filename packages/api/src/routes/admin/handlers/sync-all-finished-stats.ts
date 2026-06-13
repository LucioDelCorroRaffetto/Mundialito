import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches } from '../../../db/schema/index.js';
import { syncFifaStatsForMatch } from '../../../services/sync-fifa-stats.js';

/**
 * POST /admin/sync-all-finished-stats
 *
 * Re-runs FIFA stats sync for every finished match. Useful after an outage,
 * after expanding the FIFA alias map, or to backfill a fresh DB.
 * Runs sequentially to avoid hammering the FIFA API.
 */
export async function syncAllFinishedStatsHandler(req: Request, res: Response) {
  const force = req.query.force !== 'false'; // default true for admin

  const finishedMatches = await db
    .select({ id: matches.id, matchNumber: matches.matchNumber })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  const results: { matchId: number; matchNumber: number; ok: boolean; error?: string }[] = [];

  for (const m of finishedMatches) {
    try {
      await syncFifaStatsForMatch(m.id, { force });
      results.push({ matchId: m.id, matchNumber: m.matchNumber, ok: true });
    } catch (err) {
      results.push({ matchId: m.id, matchNumber: m.matchNumber, ok: false, error: String(err) });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return res.json({ data: { total: finishedMatches.length, succeeded, failed, results } });
}
