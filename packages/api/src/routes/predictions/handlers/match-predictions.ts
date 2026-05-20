import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, leagueMembers, users, matches } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';

export async function matchPredictionsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const matchId = Number(req.params.matchId);
  const leagueId = Number(req.query.leagueId);

  if (!Number.isInteger(matchId) || !Number.isInteger(leagueId) || leagueId <= 0) {
    throw new AppError('VALIDATION', 'matchId and leagueId are required', 400);
  }

  // Verify requester is a member of the league
  const membership = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .get();

  if (!membership) {
    throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
  }

  // Fetch match to determine status
  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new NotFoundError('Match');

  const isRevealed = match.status === 'live' || match.status === 'finished';

  // Fetch all predictions for this match in the league, joined with user info
  const rows = await db
    .select({
      predictionId: predictions.id,
      userId: predictions.userId,
      username: users.username,
      avatarUrl: users.avatarUrl,
      homeScore: predictions.homeScore,
      awayScore: predictions.awayScore,
      points: predictions.points,
      createdAt: predictions.createdAt,
      updatedAt: predictions.updatedAt,
    })
    .from(predictions)
    .innerJoin(users, eq(predictions.userId, users.id))
    .where(and(eq(predictions.matchId, matchId), eq(predictions.leagueId, leagueId)));

  const data = rows.map((row) => ({
    predictionId: row.predictionId,
    userId: row.userId,
    username: row.username,
    avatarUrl: row.avatarUrl,
    // Hide scores if match hasn't started yet — reveal once live or finished
    homeScore: isRevealed ? row.homeScore : null,
    awayScore: isRevealed ? row.awayScore : null,
    points: isRevealed ? row.points : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return res.json({
    data,
    meta: {
      total: data.length,
      matchStatus: match.status,
      revealed: isRevealed,
    },
  });
}
