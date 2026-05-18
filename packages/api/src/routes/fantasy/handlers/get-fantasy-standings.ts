import { Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, users } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

export async function getFantasyStandingsHandler(req: Request, res: Response) {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    throw new AppError('VALIDATION_ERROR', 'leagueId query param is required and must be a positive integer', 400);
  }

  const rows = await db
    .select({
      userId: fantasyTeams.userId,
      username: users.username,
      teamName: fantasyTeams.name,
      totalPoints: fantasyTeams.totalPoints,
    })
    .from(fantasyTeams)
    .innerJoin(users, eq(fantasyTeams.userId, users.id))
    .where(eq(fantasyTeams.leagueId, leagueId))
    .orderBy(desc(fantasyTeams.totalPoints));

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
