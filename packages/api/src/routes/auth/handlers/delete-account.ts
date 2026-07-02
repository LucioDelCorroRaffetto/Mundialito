// DELETE /auth/me
//
// Permanently deletes the authenticated user and all their data.
//
// Before deleting the user row, we have to deal with leagues the user
// admins, because `leagues.admin_id` is a NOT NULL FK without ON DELETE
// CASCADE. Three cases:
//   1. Personal league (auto-created) → delete the league outright.
//   2. Shared league with other members → transfer admin to the longest-
//      tenured remaining member (oldest joinedAt) so the league keeps
//      working for everyone else.
//   3. Shared league but user is the only member → delete the league.
//
// Everything else used to rely on ON DELETE CASCADE from users.id, but we
// can NOT depend on that here: `PRAGMA foreign_keys = ON` is a no-op once a
// transaction has begun (SQLite rule), and our libSQL client only sets the
// pragma *inside* the interactive transaction — so FK enforcement is OFF
// during this delete and the cascades never fire. That left orphaned rows
// (predictions, league_members, fantasy, etc.) so deleted users kept showing
// up in standings/profiles. We therefore delete every child row explicitly,
// in FK-safe order (grandchildren first), regardless of pragma state.
//
// Confirmation: body must include the user's current username (case-
// insensitive). This is the "type your username" pattern Github uses —
// cheap to add, hard to trigger by accident.
import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, ne, and, asc, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  users,
  leagues,
  leagueMembers,
  predictions,
  predictionScorers,
  fantasyTeams,
  fantasySquadPlayers,
  fantasyLineups,
  fantasyRoundScores,
  tournamentPredictions,
  userAchievements,
  userLoginDays,
  leaguePositionHistory,
  pushSubscriptions,
} from '../../../db/schema/index.js';
import { revokeAllForUser } from '../../../lib/refresh-store.js';

export const deleteAccountSchema = z.object({
  confirmUsername: z.string().min(1, 'Username confirmation required'),
});

export async function deleteAccountHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { confirmUsername } = req.body as { confirmUsername: string };

  const me = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!me) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
  }

  if (confirmUsername.trim().toLowerCase() !== me.username.toLowerCase()) {
    return res.status(400).json({
      error: { code: 'CONFIRMATION_MISMATCH', message: 'Username confirmation does not match' },
    });
  }

  const adminedLeagues = await db.select().from(leagues).where(eq(leagues.adminId, userId));

  // All mutations in one transaction: admin transfer + league deletes + the
  // user delete must succeed or fail together. A crash mid-way previously
  // could leave a league with its admin already transferred but the user
  // still present (or vice versa) — an inconsistent state.
  await db.transaction(async (tx) => {
    for (const league of adminedLeagues) {
      if (league.isPersonal) {
        await tx.delete(leagues).where(eq(leagues.id, league.id));
        continue;
      }
      // Pick the oldest remaining member as new admin. asc(joinedAt) is the
      // fairest tiebreaker — the person who's been around longest.
      const successor = await tx
        .select()
        .from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, league.id), ne(leagueMembers.userId, userId)))
        .orderBy(asc(leagueMembers.joinedAt))
        .limit(1)
        .get();
      if (successor) {
        await tx.update(leagues).set({ adminId: successor.userId }).where(eq(leagues.id, league.id));
      } else {
        await tx.delete(leagues).where(eq(leagues.id, league.id));
      }
    }

    // Grandchildren first (rows that reference the user's predictions /
    // fantasy teams), then the user's own rows, then the user itself.
    const userPredictions = tx
      .select({ id: predictions.id })
      .from(predictions)
      .where(eq(predictions.userId, userId));
    await tx.delete(predictionScorers).where(inArray(predictionScorers.predictionId, userPredictions));
    await tx.delete(predictions).where(eq(predictions.userId, userId));

    const userFantasyTeams = tx
      .select({ id: fantasyTeams.id })
      .from(fantasyTeams)
      .where(eq(fantasyTeams.userId, userId));
    await tx.delete(fantasySquadPlayers).where(inArray(fantasySquadPlayers.fantasyTeamId, userFantasyTeams));
    await tx.delete(fantasyTeams).where(eq(fantasyTeams.userId, userId));

    await tx.delete(fantasyLineups).where(eq(fantasyLineups.userId, userId));
    await tx.delete(fantasyRoundScores).where(eq(fantasyRoundScores.userId, userId));
    await tx.delete(tournamentPredictions).where(eq(tournamentPredictions.userId, userId));
    await tx.delete(userAchievements).where(eq(userAchievements.userId, userId));
    await tx.delete(userLoginDays).where(eq(userLoginDays.userId, userId));
    await tx.delete(leaguePositionHistory).where(eq(leaguePositionHistory.userId, userId));
    await tx.delete(leagueMembers).where(eq(leagueMembers.userId, userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

    // refresh_tokens tiene FK cascade sobre users.id, así que borrar el user
    // ya se lleva estas filas — este revoke explícito es solo por claridad
    // de intención (y por si algún día la cascade se rompe/desactiva).
    await revokeAllForUser(userId);
    await tx.delete(users).where(eq(users.id, userId));
  });

  return res.status(204).send();
}
