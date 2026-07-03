import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  predictions,
  leagueMembers,
  leagues,
  matches,
  teams,
  predictionReactions,
  pushSubscriptions,
} from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { isPredictionRevealed } from '../../../lib/match-helpers.js';
import { ALLOWED_REACTIONS } from '../../../lib/reactions.js';
import { sendPushNotification } from '../../../lib/push-sender.js';

export const toggleReactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTIONS),
});

// Throttle push notifications per (owner, match) so a burst of reactions on
// the same prediction only pages the owner's phone once every 10 minutes.
const lastPushAt = new Map<string, number>();
const PUSH_THROTTLE_MS = 10 * 60 * 1000;

export async function toggleReactionHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const predictionId = Number(req.params.id);
  const { emoji } = req.body as z.infer<typeof toggleReactionSchema>;

  if (!Number.isInteger(predictionId)) {
    throw new AppError('VALIDATION', 'predictionId is required', 400);
  }

  const prediction = await db
    .select()
    .from(predictions)
    .where(eq(predictions.id, predictionId))
    .get();
  if (!prediction) throw new NotFoundError('Prediction');

  if (prediction.userId === userId) {
    throw new AppError('FORBIDDEN', 'Cannot react to your own prediction', 403);
  }

  const membership = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, prediction.leagueId), eq(leagueMembers.userId, userId)))
    .get();
  if (!membership) {
    throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
  }

  const league = await db.select().from(leagues).where(eq(leagues.id, prediction.leagueId)).get();
  if (!league) throw new NotFoundError('League');

  const match = await db.select().from(matches).where(eq(matches.id, prediction.matchId)).get();
  if (!match) throw new NotFoundError('Match');

  if (!isPredictionRevealed(league.predictionsVisibility, match)) {
    throw new AppError('NOT_REVEALED', 'Prediction not revealed yet', 403);
  }

  const existing = await db
    .select()
    .from(predictionReactions)
    .where(
      and(
        eq(predictionReactions.predictionId, predictionId),
        eq(predictionReactions.userId, userId),
        eq(predictionReactions.emoji, emoji),
      ),
    )
    .get();

  if (existing) {
    await db.delete(predictionReactions).where(eq(predictionReactions.id, existing.id));
    return res.json({ data: { reacted: false } });
  }

  await db.insert(predictionReactions).values({ predictionId, userId, emoji });

  void notifyOwner(prediction.userId, match.id, emoji, req.user!.username);

  return res.json({ data: { reacted: true } });
}

async function notifyOwner(ownerId: number, matchId: number, emoji: string, byUsername: string) {
  const throttleKey = `${ownerId}:${matchId}`;
  const last = lastPushAt.get(throttleKey);
  if (last && Date.now() - last < PUSH_THROTTLE_MS) return;
  lastPushAt.set(throttleKey, Date.now());

  try {
    const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!match) return;

    const [homeTeam, awayTeam] = await Promise.all([
      match.homeTeamId
        ? db.select().from(teams).where(eq(teams.id, match.homeTeamId)).get()
        : undefined,
      match.awayTeamId
        ? db.select().from(teams).where(eq(teams.id, match.awayTeamId)).get()
        : undefined,
    ]);

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, ownerId));

    const payload = {
      title: `${emoji} ${byUsername} reaccionó a tu pronóstico`,
      body: `${homeTeam?.name ?? '?'} vs ${awayTeam?.name ?? '?'}`,
      url: `/matches/${matchId}`,
    };

    await Promise.all(subs.map((sub) => sendPushNotification(sub, payload)));
  } catch (err) {
    console.error('[reactions] Failed to notify owner:', err);
  }
}
