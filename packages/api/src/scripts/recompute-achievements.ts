/**
 * Recomputes every user's achievements using the current rule set. Use after
 * deploying changes to the achievement service so users get logros they
 * earned but never received (the most common case: `prediction_scored` events
 * were never fired, so streak/exact-based logros were silently skipped).
 *
 * Run with:
 *   pnpm --filter @mundialito/api exec tsx src/scripts/recompute-achievements.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { users, userAchievements } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { recomputeUserAchievements } from '../services/achievement-service.js';
import { isHiddenUser } from '../lib/hidden-users.js';

async function main() {
  const allUsers = await db.select({ id: users.id, username: users.username }).from(users);
  console.log(`[achievements] recomputing for ${allUsers.length} users`);

  let granted = 0;
  let skipped = 0;
  for (const u of allUsers) {
    if (isHiddenUser(u.id)) {
      // Owners / hidden users don't accumulate logros. Wipe any that snuck
      // in (e.g. from earlier runs) so they truly never appear on rankings.
      const deleted = await db
        .delete(userAchievements)
        .where(eq(userAchievements.userId, u.id))
        .returning({ id: userAchievements.id });
      if (deleted.length > 0) {
        console.log(`  ${u.username} (#${u.id}): hidden — purged ${deleted.length} logro(s)`);
      }
      skipped++;
      continue;
    }
    try {
      const awarded = await recomputeUserAchievements(u.id);
      if (awarded.length > 0) {
        granted += awarded.length;
        console.log(`  ${u.username} (#${u.id}): +${awarded.length} → ${awarded.join(', ')}`);
      }
    } catch (err) {
      console.error(`  ${u.username} (#${u.id}): failed —`, err);
    }
  }

  console.log(`[achievements] done — ${granted} new awards across ${allUsers.length - skipped} users (${skipped} hidden)`);
}

main().catch((err) => {
  console.error('[achievements] failed', err);
  process.exit(1);
});
