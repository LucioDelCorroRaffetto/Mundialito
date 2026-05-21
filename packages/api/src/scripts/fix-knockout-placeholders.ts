/**
 * fix-knockout-placeholders.ts
 *
 * Creates a TBD placeholder team and updates all knockout matches
 * (group IS NULL) to use it instead of the incorrect ALG placeholder.
 *
 * Run: cd packages/api && npx tsx src/scripts/fix-knockout-placeholders.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log('Fixing knockout placeholder teams...');

  // 1. Insert TBD team if it doesn't exist
  await client.execute(`
    INSERT OR IGNORE INTO teams (code, name, flag, [group], confederation)
    VALUES ('TBD', 'Por determinar', '❓', NULL, NULL)
  `);

  const tbdRes = await client.execute(`SELECT id FROM teams WHERE code = 'TBD' LIMIT 1`);
  const tbdId = tbdRes.rows[0][0] as number;
  console.log(`TBD team id = ${tbdId}`);

  // 2. Update all knockout matches to use TBD for both teams
  const { rowsAffected } = await client.execute({
    sql: `UPDATE matches SET home_team_id = ?, away_team_id = ? WHERE [group] IS NULL`,
    args: [tbdId, tbdId],
  });
  console.log(`Updated ${rowsAffected} knockout matches`);

  // 3. Verify
  const check = await client.execute(`
    SELECT COUNT(*) as cnt FROM matches WHERE [group] IS NULL
  `);
  console.log(`Total knockout matches: ${check.rows[0][0]}`);

  console.log('Done ✅');
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
