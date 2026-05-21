import { Request, Response } from 'express';
import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, users, leagueMembers } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

/**
 * GET /fantasy/standings            → global, all teams by totalPoints
 * GET /fantasy/standings?leagueId=X → only members of that league
 *
 * Fantasy teams are global (no leagueId on the team), so a league filter
 * is applied via league membership of the team's user.
 */
export async function getFantasyStandingsHandler(req: Request, res: Response) {
  let memberUserIds: number[] | null = null;

  if (req.query.leagueId !== undefined) {
    const leagueId = Number(req.query.leagueId);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      throw new AppError('VALIDATION_ERROR', 'leagueId must be a positive integer', 400);
    }

    const members = await db
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, leagueId));

    memberUserIds = members.map((m) => m.userId);

    if (memberUserIds.length === 0) {
      return res.json({ data: [] });
    }
  }

  const baseSelect = {
    userId: fantasyTeams.userId,
    username: users.username,
    teamName: fantasyTeams.name,
    totalPoints: fantasyTeams.totalPoints,
  };

  const rows = await (memberUserIds
    ? db
        .select(baseSelect)
        .from(fantasyTeams)
        .innerJoin(users, eq(fantasyTeams.userId, users.id))
        .where(inArray(fantasyTeams.userId, memberUserIds))
        .orderBy(desc(fantasyTeams.totalPoints))
    : db
        .select(baseSelect)
        .from(fantasyTeams)
        .innerJoin(users, eq(fantasyTeams.userId, users.id))
        .orderBy(desc(fantasyTeams.totalPoints)));

  let position = 0;
  let lastPoints = -1;
  const data = rows.map((row, idx) => {
    if (row.totalPoints !== lastPoints) {
      position = idx + 1;
      lastPoints = row.totalPoints;
    }
    return { ...row, position };
  });

  return res.json({ data });
}
