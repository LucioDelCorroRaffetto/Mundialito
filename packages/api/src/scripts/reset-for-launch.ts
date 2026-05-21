/**
 * reset-for-launch.ts
 *
 * Wipes ALL user-generated data so the app is clean for public launch.
 *
 * DELETES: users, leagues, league_members, predictions, prediction_scorers,
 *          tournament_predictions, user_achievements, fantasy_teams,
 *          fantasy_squad_players, push_subscriptions
 *
 * KEEPS:   teams, matches, players, achievements (tournament reference data)
 *
 * Also resets the autoincrement counters so the first new user gets id = 1.
 *
 * ⚠️  After running this, re-register your own account FIRST so you get id = 1,
 *     then make sure ADMIN_USER_IDS=1 is set on the API host (Render).
 *
 * Run: cd packages/api && npx tsx src/scripts/reset-for-launch.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Delete order respects foreign keys (children first).
const WIPE_TABLES = [
  'fantasy_squad_players',
  'fantasy_teams',
  'prediction_scorers',
  'predictions',
  'tournament_predictions',
  'user_achievements',
  'push_subscriptions',
  'league_members',
  'leagues',
  'users',
];

const KEEP_TABLES = ['teams', 'matches', 'players', 'achievements'];

async function count(table: string): Promise<number> {
  try {
    const r = await client.execute(`SELECT COUNT(*) AS c FROM ${table}`);
    return Number(r.rows[0][0]);
  } catch {
    return -1; // table doesn't exist
  }
}

async function run() {
  console.log('\n=== RESET FOR LAUNCH ===\n');

  console.log('Before — user data:');
  for (const t of WIPE_TABLES) console.log(`  ${t.padEnd(24)} ${await count(t)}`);

  console.log('\nBefore — reference data (kept):');
  for (const t of KEEP_TABLES) console.log(`  ${t.padEnd(24)} ${await count(t)}`);

  console.log('\nWiping user data...');
  for (const t of WIPE_TABLES) {
    const exists = (await count(t)) >= 0;
    if (!exists) {
      console.log(`  skip   ${t} (no existe)`);
      continue;
    }
    const { rowsAffected } = await client.execute(`DELETE FROM ${t}`);
    console.log(`  wiped  ${t.padEnd(24)} ${rowsAffected} filas`);
  }

  // Reset autoincrement counters so ids start fresh at 1
  console.log('\nReseteando contadores autoincrement...');
  for (const t of WIPE_TABLES) {
    await client.execute({
      sql: `DELETE FROM sqlite_sequence WHERE name = ?`,
      args: [t],
    });
  }
  console.log('  contadores reseteados');

  console.log('\nAfter — user data:');
  for (const t of WIPE_TABLES) console.log(`  ${t.padEnd(24)} ${await count(t)}`);

  console.log('\nAfter — reference data (debe estar intacta):');
  for (const t of KEEP_TABLES) console.log(`  ${t.padEnd(24)} ${await count(t)}`);

  console.log('\nDone ✅');
  console.log('\n⚠️  Próximos pasos:');
  console.log('   1. Registrá tu cuenta PRIMERO → vas a ser el user id = 1');
  console.log('   2. En Render, asegurate que ADMIN_USER_IDS=1');
  console.log('   3. Recién después compartí el link.\n');

  await client.close();
}

run().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
