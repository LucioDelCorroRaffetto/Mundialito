/**
 * add-achievement-tier.ts
 *
 * Migration: adds tier column to the achievements table and seeds tier values
 * for known slugs.
 *
 * Run with:
 *   cd packages/api && npx tsx src/scripts/add-achievement-tier.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function run() {
  console.log('Running migration: add tier to achievements...');

  // 1. Add the column (idempotent — skip if already exists)
  try {
    await client.execute(`ALTER TABLE achievements ADD COLUMN tier TEXT NOT NULL DEFAULT 'bronze'`);
    console.log('✅  Added achievements.tier');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate column')) {
      console.log('ℹ️  achievements.tier already exists, skipping ALTER');
    } else {
      throw err;
    }
  }

  // 2. Seed tier values for known slugs
  const tierMap: Array<{ slug: string; tier: string }> = [
    { slug: 'first_prediction', tier: 'bronze' },
    { slug: 'first_league', tier: 'bronze' },
    { slug: 'share_master', tier: 'silver' },
    { slug: 'social_butterfly', tier: 'silver' },
    { slug: 'league_founder', tier: 'silver' },
    { slug: 'exact_score', tier: 'gold' },
  ];

  for (const { slug, tier } of tierMap) {
    const result = await client.execute({
      sql: `UPDATE achievements SET tier = ? WHERE slug = ?`,
      args: [tier, slug],
    });
    console.log(`✅  Set tier='${tier}' for slug='${slug}' (rows affected: ${result.rowsAffected})`);
  }

  console.log('Migration complete ✅');
  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
