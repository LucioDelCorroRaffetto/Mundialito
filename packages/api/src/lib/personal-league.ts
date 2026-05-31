import { db } from '../db/index.js';
import { leagues, leagueMembers } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

/**
 * Ensures the given user has a personal "Mis pronósticos" league, creating
 * one if they don't. Idempotent: safe to call from signup, sign-in, or any
 * other code path that touches a user. Returns the league id.
 *
 * Personal leagues exist so a user can save predictions without joining
 * any shared league. They are flagged is_personal=true and filtered out of:
 *   - the public search / explore tab
 *   - the global leaderboard's "league count" stat
 *   - league pickers when offering "which league to override"
 *
 * The user always sees their personal league in their own /leagues page
 * as a normal-looking row labelled "Mis pronósticos".
 */
export async function ensurePersonalLeague(userId: number): Promise<number> {
  const existing = await db
    .select({ id: leagues.id })
    .from(leagues)
    .innerJoin(leagueMembers, eq(leagueMembers.leagueId, leagues.id))
    .where(and(eq(leagueMembers.userId, userId), eq(leagues.isPersonal, true)))
    .limit(1)
    .get();
  if (existing) return existing.id;

  // Generate a unique invite code — P + 6 random digits.
  let code: string;
  for (let attempt = 0; attempt < 12; attempt++) {
    code = `P${Math.floor(Math.random() * 900_000 + 100_000)}`;
    const clash = await db
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.code, code))
      .limit(1)
      .get();
    if (!clash) break;
    if (attempt === 11) throw new Error('Could not generate unique personal-league code');
  }

  const [created] = await db
    .insert(leagues)
    .values({
      name: 'Mis pronósticos',
      code: code!,
      isPublic: false,
      adminId: userId,
      isPersonal: true,
    })
    .returning();

  await db.insert(leagueMembers).values({ leagueId: created.id, userId });
  return created.id;
}
