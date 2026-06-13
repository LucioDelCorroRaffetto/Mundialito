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
// Everything else cascades from the users.id delete:
//   predictions, fantasy_teams, fantasy_lineups, tournament_predictions,
//   user_achievements, user_login_days, league_position_history,
//   league_members, push_subscriptions.
//
// Confirmation: body must include the user's current username (case-
// insensitive). This is the "type your username" pattern Github uses —
// cheap to add, hard to trigger by accident.
import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, ne, and, asc } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { users, leagues, leagueMembers } from '../../../db/schema/index.js';

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

  for (const league of adminedLeagues) {
    if (league.isPersonal) {
      await db.delete(leagues).where(eq(leagues.id, league.id));
      continue;
    }
    // Pick the oldest remaining member as new admin. asc(joinedAt) is the
    // fairest tiebreaker — the person who's been around longest.
    const successor = await db
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), ne(leagueMembers.userId, userId)))
      .orderBy(asc(leagueMembers.joinedAt))
      .limit(1)
      .get();
    if (successor) {
      await db.update(leagues).set({ adminId: successor.userId }).where(eq(leagues.id, league.id));
    } else {
      await db.delete(leagues).where(eq(leagues.id, league.id));
    }
  }

  await db.delete(users).where(eq(users.id, userId));

  return res.status(204).send();
}
