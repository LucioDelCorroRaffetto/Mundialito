// Sends push notifications to all subscribers ~30 min before each match's predictionLockUtc.
// Runs every 5 minutes; queries matches where predictionLockUtc is between NOW and NOW+35min.

import { db } from '../db/client.js';
import { sendPushNotification } from '../lib/push-sender.js';

interface UpcomingMatch {
  id: number;
  home_team: string;
  away_team: string;
  prediction_lock_utc: string;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendDeadlineReminders(): Promise<void> {
  // Slim 5-min "fire zone" centered around 30 min before lock. The cron runs
  // every 5 min, so each match falls inside exactly one tick — previously
  // the 35-min window meant the SAME match passed through the query 7 times
  // (every 5 min for 35 min), shooting 7 push notifications at every user
  // per match. Now: fire once, ~30 min before kickoff.
  const windowStartMs = Date.now() + 25 * 60 * 1000;
  const windowEndMs   = Date.now() + 30 * 60 * 1000;
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEnd   = new Date(windowEndMs).toISOString();

  console.log(`[deadline-reminders] Checking matches locking between ${windowStart} and ${windowEnd}...`);

  // 1. Match window: prediction_lock_utc in [now+25min, now+30min]
  const matchResult = await db.$client.execute({
    sql: `
      SELECT
        m.id,
        ht.name AS home_team,
        away_t.name AS away_team,
        m.prediction_lock_utc
      FROM matches m
      JOIN teams ht ON ht.id = m.home_team_id
      JOIN teams away_t ON away_t.id = m.away_team_id
      WHERE m.prediction_lock_utc > ?
        AND m.prediction_lock_utc <= ?
        AND m.status = 'scheduled'
    `,
    args: [windowStart, windowEnd],
  });

  const upcomingMatches = matchResult.rows as unknown as UpcomingMatch[];

  if (upcomingMatches.length === 0) {
    console.log('[deadline-reminders] No matches closing soon — skipping');
    return;
  }

  console.log(`[deadline-reminders] ${upcomingMatches.length} match(es) closing soon`);

  // 2. Get all push subscriptions from DB
  const subsResult = await db.$client.execute(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions'
  );

  const subscriptions = subsResult.rows as unknown as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    console.log('[deadline-reminders] No push subscriptions found — skipping');
    return;
  }

  console.log(`[deadline-reminders] Sending to ${subscriptions.length} subscription(s)`);

  // 3. For each match, send a push notification to all subscribers
  for (const match of upcomingMatches) {
    const payload = {
      title: '⚽ ¡Último momento para pronosticar!',
      body: `${match.home_team} vs ${match.away_team} — cierra en 30 minutos`,
    };

    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await sendPushNotification(sub, payload);
          sent++;
        } catch {
          failed++;
        }
      }),
    );

    console.log(
      `[deadline-reminders] Match ${match.id} (${match.home_team} vs ${match.away_team}): ${sent} sent, ${failed} failed`,
    );
  }
}
