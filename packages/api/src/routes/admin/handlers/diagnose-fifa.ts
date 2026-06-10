import type { Request, Response } from 'express';
import { diagnoseFifaFlow } from '../../../services/diagnose-fifa-flow.js';

/**
 * GET /admin/diagnostics/fifa-self-test
 *
 * Runs the FIFA parser pipeline against a known WC2022 fixture and reports
 * whether the parsing logic still produces the expected goal/assist/card
 * counts. Use this before each tournament day to confirm the pipeline
 * is healthy without waiting for a real WC2026 match to finish.
 *
 * Returns `{ ok: true, ... }` when all assertions pass. The HTTP status is
 * 200 either way — the consumer (admin UI, monitoring) reads `body.ok`.
 */
export async function diagnoseFifaHandler(_req: Request, res: Response) {
  const result = await diagnoseFifaFlow();
  return res.json(result);
}
