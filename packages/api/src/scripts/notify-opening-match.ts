/**
 * notify-opening-match.ts
 *
 * Sends a push notification to ALL active subscribers announcing that the
 * World Cup opening match is tomorrow.
 *
 * Designed to run once, 24 h before the opening kickoff (e.g. on 2026-06-10).
 *
 * Run: cd packages/api && npm run notify:opening
 *
 * Requirements (env vars):
 *   TURSO_DATABASE_URL   – Turso DB URL
 *   TURSO_AUTH_TOKEN     – Turso auth token (can be omitted for local file DB)
 *   VAPID_PUBLIC_KEY     – Web Push VAPID public key
 *   VAPID_PRIVATE_KEY    – Web Push VAPID private key
 *   VAPID_SUBJECT        – mailto: or https: URI (defaults to mailto:admin@mundialito.app)
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';
import webpush from 'web-push';
import { latamTimes } from '../lib/latam-time.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@mundialito.app';

/** Delay (ms) between individual push sends — keeps the process gentle. */
const SEND_DELAY_MS = 80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchRow {
  kickoff_utc: string;
  home_team: string;
  away_team: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  // 1. Validate VAPID keys early — no point querying the DB if push won't work.
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('[notify-opening] ERROR: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set.');
    console.error('  Export them in your .env or environment before running this script.');
    process.exit(1);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // 2. Connect to DB.
  const client = createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN,
  });

  try {
    // 3. Fetch the opening match (earliest kickoffUtc).
    // Note: "at" is a reserved keyword in SQLite — use "away_t" as alias.
    const matchResult = await client.execute(`
      SELECT
        m.kickoff_utc,
        ht.name AS home_team,
        away_t.name AS away_team
      FROM matches m
      JOIN teams ht ON ht.id = m.home_team_id
      JOIN teams away_t ON away_t.id = m.away_team_id
      ORDER BY m.kickoff_utc ASC
      LIMIT 1
    `);

    if (matchResult.rows.length === 0) {
      console.error('[notify-opening] No matches found in DB. Aborting.');
      process.exit(1);
    }

    const firstMatch = matchResult.rows[0] as unknown as MatchRow;
    const kickoffTime = latamTimes(firstMatch.kickoff_utc);

    console.log(`[notify-opening] Opening match: ${firstMatch.home_team} vs ${firstMatch.away_team}`);
    console.log(`[notify-opening] Kickoff UTC:   ${firstMatch.kickoff_utc}`);
    console.log(`[notify-opening] Displayed as:  ${kickoffTime}`);

    // 4. Fetch all active push subscriptions.
    const subsResult = await client.execute(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions',
    );

    const subscriptions = subsResult.rows as unknown as SubRow[];

    if (subscriptions.length === 0) {
      console.log('[notify-opening] No push subscriptions found. Nothing to send.');
      return;
    }

    console.log(`[notify-opening] Found ${subscriptions.length} subscription(s). Sending...`);

    // 5. Build the notification payload.
    const payload = JSON.stringify({
      title: '⚽ ¡El Mundial empieza mañana!',
      body: `Cerrá tus pronósticos antes del ${kickoffTime} (${firstMatch.home_team} vs ${firstMatch.away_team})`,
      url: '/home',
    });

    // 6. Send with a gentle rate limit.
    let sent = 0;
    let failed = 0;
    let expired = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
        process.stdout.write('.');
      } catch (err: any) {
        failed++;
        // 410 Gone / 404 = subscription is dead; clean it up.
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expired++;
          await client.execute({
            sql: 'DELETE FROM push_subscriptions WHERE id = ?',
            args: [sub.id],
          });
        } else {
          console.error(`\n[notify-opening] Send error (sub ${sub.id}): ${err?.message}`);
        }
      }

      // Soft rate limit between sends.
      await sleep(SEND_DELAY_MS);
    }

    console.log(`\n[notify-opening] Done.`);
    console.log(`  Total subscriptions : ${subscriptions.length}`);
    console.log(`  Sent successfully   : ${sent}`);
    console.log(`  Failed              : ${failed}`);
    console.log(`  Expired & removed   : ${expired}`);
  } finally {
    client.close();
  }
}

run().catch((err) => {
  console.error('[notify-opening] Unhandled error:', err);
  process.exit(1);
});
