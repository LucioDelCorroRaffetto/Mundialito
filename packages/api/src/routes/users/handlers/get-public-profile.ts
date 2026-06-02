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
import { dedupeBestPerMatch } from '../../../lib/prediction-aggregates.js';
import { computeLevel } from '../../../lib/levels.js';

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

  // Fetch user — include XP + selected title so the profile can render the
  // level badge and chosen title without a second round-trip.
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      xp: users.xp,
      selectedTitleSlug: users.selectedTitleSlug,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Stats — same logic as my-stats.ts but for any userId
  const predRowsRaw = await db
    .select({
      matchId: predictions.matchId,
      predHomeScore: predictions.homeScore,
      predAwayScore: predictions.awayScore,
      points: predictions.points,
      matchHomeScore: matches.homeScore,
      matchAwayScore: matches.awayScore,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .where(and(eq(predictions.userId, userId), eq(matches.status, 'finished')));

  // Dedupe: a user may have one prediction per league for the same match;
  // keep the best one so user-level stats don't double-count.
  const predRows = dedupeBestPerMatch(predRowsRaw);
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
  //
  // The Presidente FIFA has only one symbolic logro on his profile — the
  // 'presidente_fifa' one. We hide every other logro he might have earned
  // (first_league, etc. from creating the seed leagues) so his public page
  // stays purely presidential. The badge is synthesised here even if the
  // row doesn't exist in user_achievements — admin status is the source of
  // truth, not the awards table.
  let achievementRows = await db
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

  if (isAdmin) {
    achievementRows = [
      {
        slug: 'presidente_fifa',
        name: 'Presidente de la FIFA',
        description: 'El que armó todo esto',
        icon: '🏛️',
        tier: 'platinum',
        earnedAt: achievementRows.find((a) => a.slug === 'presidente_fifa')?.earnedAt
          ?? new Date().toISOString(),
      },
    ];
  } else {
    // Defensive: the presidente_fifa logro is admin-exclusive; never expose it
    // on a non-admin profile, even if it somehow got into the awards table.
    achievementRows = achievementRows.filter((a) => a.slug !== 'presidente_fifa');
  }

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

  // Resolve the user's chosen title (if any) into a display name.
  const titleSlug = user.selectedTitleSlug ?? null;
  const titleAchievement = titleSlug
    ? achievementRows.find((a) => a.slug === titleSlug) ?? null
    : null;
  const title = titleAchievement
    ? { slug: titleAchievement.slug, name: titleAchievement.name }
    : null;

  return res.json({
    data: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAdmin,
      adminProfile: isAdmin ? ADMIN_PROFILE : null,
      level: computeLevel(user.xp ?? 0),
      title,
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
