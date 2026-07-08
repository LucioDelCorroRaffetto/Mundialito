import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches, predictions } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';
import { calculatePoints, scoringResult } from '../../../lib/scoring.js';
import { recomputeAllFantasyPoints } from '../../../services/fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../../../ws/broadcast.js';
import { checkAchievements, finalizeFantasyLegends } from '../../../services/achievement-service.js';

export const updateMatchSchema = z.object({
  homeScore: z.number().int().min(0).max(30).optional(),
  awayScore: z.number().int().min(0).max(30).optional(),
  status: z.enum(['scheduled', 'live', 'finished', 'suspended']).optional(),
  // Cruce definido por penales: el marcador cargado debe traer +1 al ganador
  // (convención del sync) y este flag deja que el cuadro/lista anoten "(pen.)".
  // Útil cuando el feed cerró un KO empatado sin reportar la tanda.
  decidedByPenalties: z.boolean().optional(),
  // Ganador de la tanda como LADO del partido, para avanzar en el cuadro sin
  // tocar el marcador (el score queda en el empate real ⇒ scoring intacto). Usar
  // en vez del bump cuando querés preservar el resultado de juego. `null` limpia.
  penaltyWinner: z.enum(['home', 'away']).nullable().optional(),
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

  const { homeScore, awayScore, status, decidedByPenalties, penaltyWinner } = parsed.data;

  // Verify match exists
  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');

  // Build update payload. When an admin sets a score by hand, lock it so the
  // score feeds (sync-scores/sync-espn) stop overwriting it — they were the
  // reason it was wrong in the first place.
  const updatePayload: Record<string, unknown> = {};
  if (homeScore !== undefined) updatePayload.homeScore = homeScore;
  if (awayScore !== undefined) updatePayload.awayScore = awayScore;
  if (status !== undefined) updatePayload.status = status;
  if (decidedByPenalties !== undefined) updatePayload.decidedByPenalties = decidedByPenalties ? 1 : 0;
  if (penaltyWinner !== undefined) updatePayload.penaltyWinner = penaltyWinner;
  if (homeScore !== undefined || awayScore !== undefined) updatePayload.scoreLocked = 1;

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
  const finalDecidedByPenalties = decidedByPenalties !== undefined
    ? decidedByPenalties
    : match.decidedByPenalties === 1;

  if (finalStatus === 'finished' && finalHomeScore !== null && finalHomeScore !== undefined && finalAwayScore !== null && finalAwayScore !== undefined) {
    const matchPredictions = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId));

    // Penales → empate de reglamento para la puntuación (el bump solo define el
    // avance en el cuadro). No-op si no fue por penales.
    const scored = scoringResult({
      homeScore: finalHomeScore,
      awayScore: finalAwayScore,
      decidedByPenalties: finalDecidedByPenalties,
    });
    const scoredUsers = new Map<number, number>();
    for (const pred of matchPredictions) {
      const pts = calculatePoints(
        { homeScore: pred.homeScore, awayScore: pred.awayScore },
        scored
      );
      await db
        .update(predictions)
        .set({ points: pts, updatedAt: sql`(datetime('now'))` })
        .where(eq(predictions.id, pred.id));
      const prev = scoredUsers.get(pred.userId) ?? -1;
      if (pts > prev) scoredUsers.set(pred.userId, pts);
    }
    for (const [uid, pts] of scoredUsers) {
      checkAchievements(uid, { type: 'prediction_scored', matchId, points: pts })
        .catch(() => {});
    }

    // Recompute fantasy points now that this match is finished.
    await recomputeAllFantasyPoints();

    // Auto-award fantasy_legend when the Final closes.
    if (updatedMatch.round === 'final') {
      finalizeFantasyLegends().catch((err) => {
        console.error('[update-match] fantasy_legend finalize failed:', err);
      });
    }
  }

  // Broadcast match update to all connected WS clients
  broadcastMatchUpdate(updatedMatch);

  return res.json({ data: updatedMatch, meta: { predictionsUpdated: finalStatus === 'finished' } });
}
