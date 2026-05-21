import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches, predictions } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';
import { calculatePoints } from '../../../lib/scoring.js';
import { recomputeAllFantasyPoints } from '../../../services/fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../../../ws/broadcast.js';

export const updateMatchSchema = z.object({
  homeScore: z.number().int().min(0).max(30).optional(),
  awayScore: z.number().int().min(0).max(30).optional(),
  status: z.enum(['scheduled', 'live', 'finished']).optional(),
});

export async function updateMatchHandler(req: Request, res: Response) {
  const matchId = Number(req.params.id);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid match id' } });
  }

  const parsed = updateMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }

  const { homeScore, awayScore, status } = parsed.data;

  // Verify match exists
  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  if (homeScore !== undefined) updatePayload.homeScore = homeScore;
  if (awayScore !== undefined) updatePayload.awayScore = awayScore;
  if (status !== undefined) updatePayload.status = status;

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
  }

  // Update the match
  const [updatedMatch] = await db
    .update(matches)
    .set(updatePayload)
    .where(eq(matches.id, matchId))
    .returning();

  // If finished and both scores are now known, calculate points for all predictions
  const finalHomeScore = homeScore ?? match.homeScore;
  const finalAwayScore = awayScore ?? match.awayScore;
  const finalStatus = status ?? match.status;

  if (finalStatus === 'finished' && finalHomeScore !== null && finalHomeScore !== undefined && finalAwayScore !== null && finalAwayScore !== undefined) {
    const matchPredictions = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId));

    for (const pred of matchPredictions) {
      const pts = calculatePoints(
        { homeScore: pred.homeScore, awayScore: pred.awayScore },
        { homeScore: finalHomeScore, awayScore: finalAwayScore }
      );
      await db
        .update(predictions)
        .set({ points: pts, updatedAt: sql`(datetime('now'))` })
        .where(eq(predictions.id, pred.id));
    }

    // Recompute fantasy points now that this match is finished.
    await recomputeAllFantasyPoints();
  }

  // Broadcast match update to all connected WS clients
  broadcastMatchUpdate(updatedMatch);

  return res.json({ data: updatedMatch, meta: { predictionsUpdated: finalStatus === 'finished' } });
}
