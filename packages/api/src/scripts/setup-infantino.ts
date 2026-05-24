/**
 * setup-infantino.ts
 *
 * Sets up the admin's presidential profile:
 *  1. Upserts the "presidente_fifa" platinum achievement in the achievements table.
 *  2. Awards it to the admin user (id = 1 by default, or ADMIN_USER_ID env var).
 *  3. Optionally renames the admin account to "Infantino" if --rename flag is passed.
 *
 * Run:
 *   cd packages/api && npx tsx src/scripts/setup-infantino.ts
 *   cd packages/api && npx tsx src/scripts/setup-infantino.ts --rename
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const ADMIN_ID = Number(process.env.ADMIN_USER_ID ?? '1');
const RENAME   = process.argv.includes('--rename');

const ACHIEVEMENT = {
  slug:        'presidente_fifa',
  name:        'Presidente de la FIFA',
  description: 'El que armó todo esto. Respeto.',
  icon:        '🏛️',
  tier:        'platinum',
  pointsBonus: 0,
};

async function run() {
  console.log('\n🏛️  Setup Infantino — admin profile\n');

  // 1. Verify admin user exists
  const userResult = await client.execute({
    sql: 'SELECT id, username FROM users WHERE id = ?',
    args: [ADMIN_ID],
  });

  if (userResult.rows.length === 0) {
    console.error(`❌  User with id=${ADMIN_ID} not found.`);
    console.error('    Register your account first, then re-run this script.');
    process.exit(1);
  }

  const currentUsername = String(userResult.rows[0][1]);
  console.log(`👤  Admin user found: id=${ADMIN_ID}, username="${currentUsername}"`);

  // 2. Upsert the achievement
  await client.execute({
    sql: `
      INSERT INTO achievements (slug, name, description, icon, tier, points_bonus)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        name        = excluded.name,
        description = excluded.description,
        icon        = excluded.icon,
        tier        = excluded.tier
    `,
    args: [
      ACHIEVEMENT.slug,
      ACHIEVEMENT.name,
      ACHIEVEMENT.description,
      ACHIEVEMENT.icon,
      ACHIEVEMENT.tier,
      ACHIEVEMENT.pointsBonus,
    ],
  });
  console.log(`✅  Achievement "${ACHIEVEMENT.name}" upserted`);

  // 3. Award achievement to admin (idempotent)
  await client.execute({
    sql: `
      INSERT INTO user_achievements (user_id, achievement_slug)
      VALUES (?, ?)
      ON CONFLICT(user_id, achievement_slug) DO NOTHING
    `,
    args: [ADMIN_ID, ACHIEVEMENT.slug],
  });
  console.log(`🎖️   Achievement awarded to user ${ADMIN_ID}`);

  // 4. Optional rename
  if (RENAME) {
    await client.execute({
      sql: 'UPDATE users SET username = ? WHERE id = ?',
      args: ['Infantino', ADMIN_ID],
    });
    console.log('✏️   Username updated to "Infantino"');
  } else {
    console.log(`ℹ️   Username kept as "${currentUsername}" (pass --rename to change to "Infantino")`);
  }

  console.log('\n✅  Done. El presidente está listo.\n');
  await client.close();
}

run().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});
