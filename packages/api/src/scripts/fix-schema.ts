/**
 * Fixes column mismatches between the original migrate.ts and the current Drizzle schema.
 * Safe to run multiple times (uses IF NOT EXISTS / RENAME only if column exists).
 *
 * Run with:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx src/scripts/fix-schema.ts
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run(label: string, sql: string) {
  try {
    await client.execute(sql);
    console.log(`  ✓ ${label}`);
  } catch (err: any) {
    if (err.message?.includes('duplicate column') || err.message?.includes('already exists')) {
      console.log(`  ⚠ ${label} — already applied, skipping`);
    } else {
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('Running schema fix migration...\n');

  // ── leagues: rename invite_code → code ──────────────────────────────────────
  await run(
    'leagues: rename invite_code → code',
    `ALTER TABLE leagues RENAME COLUMN invite_code TO code`
  );

  // ── matches: add missing columns ────────────────────────────────────────────
  await run(
    'matches: add city column',
    `ALTER TABLE matches ADD COLUMN city TEXT NOT NULL DEFAULT ''`
  );

  await run(
    'matches: add round column',
    `ALTER TABLE matches ADD COLUMN round TEXT NOT NULL DEFAULT 'group'`
  );

  await run(
    'matches: copy stage → round',
    `UPDATE matches SET round = stage WHERE round = 'group'`
  );

  await run(
    'matches: add created_at column',
    `ALTER TABLE matches ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`
  );

  // ── matches: add prediction_lock_utc ────────────────────────────────────────
  await run(
    'matches: add prediction_lock_utc column',
    `ALTER TABLE matches ADD COLUMN prediction_lock_utc TEXT NOT NULL DEFAULT ''`
  );

  // ── users: ensure google_id and avatar_url columns exist ────────────────────
  await run(
    'users: add google_id column',
    `ALTER TABLE users ADD COLUMN google_id TEXT`
  );

  await run(
    'users: add avatar_url column',
    `ALTER TABLE users ADD COLUMN avatar_url TEXT`
  );

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
