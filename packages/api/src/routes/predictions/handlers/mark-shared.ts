import { Request, Response } from 'express';
import { checkAchievements } from '../../../services/achievement-service.js';

/**
 * Fires the `prediction_shared` achievement event. Called by the client after
 * the user successfully shares a prediction card image — we don't have a
 * share counter yet, so this currently awards `share_master` on the first
 * share. When we add a shares counter we can promote this to a real check.
 */
export async function markPredictionSharedHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const awarded = await checkAchievements(userId, { type: 'prediction_shared' });
  return res.json({ data: { awarded } });
}
