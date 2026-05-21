import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, leagueMembers, users, matches } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq, inArray } from 'drizzle-orm';
import { calculatePoints } from '../../../lib/scoring.js';

export async function standingsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const membership = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))).get();
  if (!membership) throw new AppError('FORBIDDEN', 'Not a member of this league', 403);

  // Get all members of this league
  const members = await db
    .select({ userId: leagueMembers.userId, username: users.username, avatarUrl: users.avatarUrl })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id));

  const memberIds = members.map((m) => m.userId);

  if (memberIds.length === 0) {
    return res.json({ data: [], meta: { total: 0 } });
  }

  // Global predictions: get all predictions from league members (not filtered by leagueId on predictions)
  const preds = await db
    .select({
      userId: predictions.userId,
      points: predictions.points,
      predHome: predictions.homeScore,
      predAway: predictions.awayScore,
      matchHome: matches.homeScore,
      matchAway: matches.awayScore,
      matchStatus: matches.status,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(inArray(predictions.userId, memberIds));

  // Sum points per user
  const pointsByUser = new Map<number, { total: number; matches: number }>();
  for (const p of preds) {
    const current = pointsByUser.get(p.userId) ?? { total: 0, matches: 0 };
    let pts = p.points;
    if (pts === null && p.matchStatus === 'finished' && p.matchHome !== null && p.matchAway !== null) {
      pts = calculatePoints(
        { homeScore: p.predHome, awayScore: p.predAway },
        { homeScore: p.matchHome, awayScore: p.matchAway }
      );
    }
    if (pts !== null) {
      current.total += pts;
      current.matches += 1;
    }
    pointsByUser.set(p.userId, current);
  }

  // Build sorted standings
  const standings = members
    .map((m) => ({
      userId: m.userId,
      username: m.username,
      avatarUrl: m.avatarUrl,
      points: pointsByUser.get(m.userId)?.total ?? 0,
      matchesPlayed: pointsByUser.get(m.userId)?.matches ?? 0,
    }))
    .sort((a, b) => b.points - a.points);

  // Assign positions (ties share the same rank)
  let position = 0;
  let lastPoints = -1;
  const ranked = standings.map((row, idx) => {
    if (row.points !== lastPoints) {
      position = idx + 1;
      lastPoints = row.points;
    }
    return { ...row, position };
  });

  return res.json({ data: ranked, meta: { total: ranked.length } });
}
