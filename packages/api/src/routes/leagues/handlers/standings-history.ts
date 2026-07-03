import { Request, Response } from 'express';
import { db } from '../../../db/index.js';
import { predictions, leagueMembers, users, matches } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { buildStandingsHistory } from '../../../lib/standings-history.js';

export async function standingsHistoryHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('League');

  const membership = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))).get();
  if (!membership) throw new AppError('FORBIDDEN', 'Not a member of this league', 403);

  const members = await db
    .select({
      userId: leagueMembers.userId,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id));

  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    return res.json({ data: { days: [], series: [] } });
  }

  const rows = await db
    .select({
      userId: predictions.userId,
      points: predictions.points,
      kickoffUtc: matches.kickoffUtc,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(
      eq(predictions.leagueId, id),
      inArray(predictions.userId, memberIds),
      isNotNull(predictions.points),
    ));

  const { days, series } = buildStandingsHistory(
    members,
    rows.map((r) => ({ userId: r.userId, points: r.points!, kickoffUtc: r.kickoffUtc })),
  );

  return res.json({ data: { days, series } });
}
