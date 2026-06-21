// Sends push notifications to all subscribers ~30 min before each fantasy
// round's deadline. Mirrors the pattern from send-deadline-reminders.ts:
// a slim 5-min "fire zone" [now+25min, now+30min] so each round triggers
// exactly one notification per cron tick.
//
// Fantasy rounds and their deadlines are defined in
// packages/api/src/lib/fantasy-rounds.ts. The worker has no workspace dep
// on the api package, so we inline the deadline data here. If a deadline
// changes in fantasy-rounds.ts, update this list too.

import { db } from '../db/client.js';
import { sendPushNotification } from '../lib/push-sender.js';

interface FantasyRoundDeadline {
  slug: string;
  label: string;
  deadline: string; // ISO UTC
}

// Deadlines mirrored from packages/api/src/lib/fantasy-rounds.ts.
// Keep in sync when rounds change.
const FANTASY_ROUND_DEADLINES: FantasyRoundDeadline[] = [
  { slug: 'group_1', label: 'Fecha 1 (Grupos)',       deadline: '2026-06-13T18:55:00Z' },
  { slug: 'group_2', label: 'Fecha 2 (Grupos)',       deadline: '2026-06-19T16:55:00Z' },
  { slug: 'group_3', label: 'Fecha 3 (Grupos)',       deadline: '2026-06-26T16:55:00Z' },
  { slug: 'r32',     label: 'Ronda de 32',            deadline: '2026-07-04T17:55:00Z' },
  { slug: 'r16',     label: 'Octavos de final',       deadline: '2026-07-10T17:55:00Z' },
  { slug: 'qf',      label: 'Cuartos de final',       deadline: '2026-07-14T17:55:00Z' },
  { slug: 'sf',      label: 'Semifinales',            deadline: '2026-07-17T17:55:00Z' },
  { slug: 'final',   label: 'Final y 3er puesto',     deadline: '2026-07-19T14:55:00Z' },
];

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendFantasyDeadlineReminders(): Promise<void> {
  const nowMs = Date.now();
  const windowStartMs = nowMs + 25 * 60 * 1000;
  const windowEndMs   = nowMs + 30 * 60 * 1000;

  console.log(
    `[fantasy-deadline-reminders] Checking rounds closing between ` +
    `${new Date(windowStartMs).toISOString()} and ${new Date(windowEndMs).toISOString()}...`,
  );

  // Find rounds whose deadline falls in the [now+25min, now+30min] window
  // AND whose deadline is still in the future (i.e. still open).
  const closingSoon = FANTASY_ROUND_DEADLINES.filter((r) => {
    const deadlineMs = new Date(r.deadline).getTime();
    return deadlineMs > windowStartMs && deadlineMs <= windowEndMs;
  });

  if (closingSoon.length === 0) {
    console.log('[fantasy-deadline-reminders] No fantasy rounds closing soon — skipping');
    return;
  }

  console.log(
    `[fantasy-deadline-reminders] ${closingSoon.length} round(s) closing soon: ` +
    closingSoon.map((r) => r.slug).join(', '),
  );

  // Fetch all push subscriptions once
  const subsResult = await db.$client.execute(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions',
  );

  const subscriptions = subsResult.rows as unknown as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    console.log('[fantasy-deadline-reminders] No push subscriptions found — skipping');
    return;
  }

  console.log(`[fantasy-deadline-reminders] Sending to ${subscriptions.length} subscription(s)`);

  for (const round of closingSoon) {
    const payload = {
      title: '⚽ ¡Armá tu equipo de Fantasy!',
      body: `La ${round.label} cierra en 30 minutos — definí tu 11 y capitán`,
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
      `[fantasy-deadline-reminders] Round ${round.slug} (${round.label}): ${sent} sent, ${failed} failed`,
    );
  }
}
