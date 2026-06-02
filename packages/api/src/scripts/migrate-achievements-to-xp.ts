/**
 * Migrates the achievement-points model into the XP/level/title model.
 *
 * Decision: achievements no longer contribute to the prediction score. They
 * give XP instead, which feeds a separate level/tier shown next to the
 * username. Users also gain a chosen "title" — the name of any achievement
 * they have earned, displayed under their username.
 *
 * This script is idempotent and safe to re-run.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/migrate-achievements-to-xp.ts
 *
 * Operations:
 *   1. ALTER TABLE users ADD COLUMN xp + selected_title_slug (idempotent).
 *   2. Backfill users.xp = sum of pointsBonus for every achievement each
 *      user has earned (1:1 carry-over so nobody loses progress).
 *   3. Leave standings.ts / global-leaderboard.ts to drop the bonus on the
 *      next request — that happens in their handlers, not here.
 *
 * NOTE: this does NOT remove the achievements.points_bonus column. We keep
 * it as the XP reward value for each logro so the catalog stays the source
 * of truth and the migration stays reversible.
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });

async function alterIfMissing(sqlText: string, description: string): Promise<void> {
  try {
    await client.execute(sqlText);
    console.log(`  ✓ ${description}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate column')) {
      console.log(`  · ${description} — column already exists`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log(`[xp-migrate] target: ${url}\n`);

  // ─── 1. Schema additions ──────────────────────────────────────────────
  await alterIfMissing(
    `ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`,
    'users.xp',
  );
  await alterIfMissing(
    `ALTER TABLE users ADD COLUMN selected_title_slug TEXT`,
    'users.selected_title_slug',
  );

  // ─── 2. Backfill XP from earned achievements ──────────────────────────
  // The sum of pointsBonus per user is exactly the score-bonus each user
  // had accumulated under the old model. Carrying it over 1:1 keeps the
  // perceived progression intact.
  const rows = await client.execute(`
    SELECT ua.user_id AS userId, COALESCE(SUM(a.points_bonus), 0) AS totalXp
      FROM user_achievements ua
      JOIN achievements a ON a.slug = ua.achievement_slug
     GROUP BY ua.user_id
  `);

  let updated = 0;
  for (const row of rows.rows as unknown as Array<{ userId: number; totalXp: number }>) {
    const userId = Number(row.userId);
    const totalXp = Number(row.totalXp);
    await client.execute({
      sql: `UPDATE users SET xp = ? WHERE id = ?`,
      args: [totalXp, userId],
    });
    updated++;
  }
  console.log(`\n  ✓ backfilled xp for ${updated} user(s)`);

  // ─── 3. Sanity check ──────────────────────────────────────────────────
  const sample = await client.execute(`
    SELECT u.id, u.username, u.xp, u.selected_title_slug
      FROM users u
     WHERE u.xp > 0
     ORDER BY u.xp DESC
     LIMIT 10
  `);
  console.log('\n  Top 10 by XP:');
  for (const r of sample.rows) {
    console.log(
      `    #${String(r.id).padEnd(3)} ${String(r.username).padEnd(20)} ${String(r.xp).padStart(4)} xp  title=${r.selected_title_slug ?? '-'}`,
    );
  }

  console.log('\n[xp-migrate] done.');
  await client.close();
}

main().catch((err) => {
  console.error('[xp-migrate] failed:', err);
  process.exit(1);
});
