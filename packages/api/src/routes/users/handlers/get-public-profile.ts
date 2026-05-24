import { Request, Response } from 'express';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  users,
  predictions,
  matches,
  userAchievements,
  achievements,
  leagueMembers,
  fantasyTeams,
} from '../../../db/schema/index.js';

// ─── Admin helpers ───────────────────────────────────────────────────────────
function getAdminIds(): number[] {
  return process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
}

/** Fun presidential profile injected for the admin account. */
const ADMIN_PROFILE = {
  role: 'Presidente de la FIFA',
  emoji: '🏛️',
  bio: '48 equipos. 16 sedes. 3 países anfitriones. Todo idea mía. ' +
       'Si el torneo sale bien, fue por mi gestión. Si sale mal, culpen a otros. ' +
       'Disponible para fotos y discursos de 45 minutos. 📣',
};

export async function getPublicProfileHandler(req: Request, res: Response) {
  const userId = parseInt(req.params['userId'] as string, 10);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const isAdmin = getAdminIds().includes(userId);

  // Fetch user
  const [user] = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Stats — same logic as my-stats.ts but for any userId
  const predRows = await db
    .select({
      predHomeScore: predictions.homeScore,
      predAwayScore: predictions.awayScore,
      points: predictions.points,
      matchHomeScore: matches.homeScore,
      matchAwayScore: matches.awayScore,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.userId, userId), eq(matches.status, 'finished')));

  const totalPredictions = predRows.length;
  let exactScores = 0;
  let correctResults = 0;
  let totalPoints = 0;

  for (const row of predRows) {
    const pts = row.points ?? 0;
    totalPoints += pts;

    if (
      row.matchHomeScore !== null &&
      row.matchAwayScore !== null &&
      row.predHomeScore === row.matchHomeScore &&
      row.predAwayScore === row.matchAwayScore
    ) {
      exactScores++;
    } else if (pts > 0) {
      correctResults++;
    }
  }

  const accuracy = totalPredictions > 0 ? Math.round((exactScores / totalPredictions) * 100) : 0;

  // Achievements
  const achievementRows = await db
    .select({
      slug: achievements.slug,
      name: achievements.name,
      description: achievements.description,
      icon: achievements.icon,
      tier: achievements.tier,
      earnedAt: userAchievements.earnedAt,
    })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementSlug, achievements.slug))
    .where(eq(userAchievements.userId, userId));

  // League count
  const [leagueCountRow] = await db
    .select({ value: count() })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));

  const leagueCount = leagueCountRow?.value ?? 0;

  // Fantasy points
  let fantasyPoints = 0;
  try {
    const [fantasyRow] = await db
      .select({ totalPoints: fantasyTeams.totalPoints })
      .from(fantasyTeams)
      .where(eq(fantasyTeams.userId, userId))
      .limit(1);

    fantasyPoints = fantasyRow?.totalPoints ?? 0;
  } catch {
    fantasyPoints = 0;
  }

  return res.json({
    data: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAdmin,
      adminProfile: isAdmin ? ADMIN_PROFILE : null,
      stats: {
        totalPoints,
        totalPredictions,
        exactScores,
        correctResults,
        accuracy,
      },
      achievements: achievementRows,
      leagueCount,
      fantasyPoints,
    },
  });
}
