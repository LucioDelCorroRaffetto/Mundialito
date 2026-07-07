// Sends push notifications to all subscribers ~30 min before each match's predictionLockUtc.
// Runs every 2 min (ver render.yaml). Idempotente por partido vía
// worker_flags['deadline_reminder_sent_<matchId>'] — mismo patrón que
// send-wrapped-ready.ts.

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

function flagKey(matchId: number): string {
  return `deadline_reminder_sent_${matchId}`;
}

async function isFlagSet(key: string): Promise<boolean> {
  const res = await db.$client.execute({
    sql: 'SELECT 1 FROM worker_flags WHERE key = ?',
    args: [key],
  });
  return res.rows.length > 0;
}

async function setFlag(key: string): Promise<void> {
  await db.$client.execute({
    sql: `INSERT INTO worker_flags (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, '1', new Date().toISOString()],
  });
}

export async function sendDeadlineReminders(): Promise<void> {
  // Ventana ancha (20 min) con margen de sobra ante demoras del cron gratuito
  // de Render (arranque en frío, cola, etc.). Antes usamos una ventana exacta
  // de 2 min (= intervalo del cron) para evitar duplicados, pero eso dejaba
  // CERO margen: un solo tick retrasado hacía que el partido nunca entrara en
  // la ventana y el aviso no se mandaba nunca. La ventana ancha puede ver el
  // mismo partido en varios ticks — por eso el envío es idempotente por
  // partido vía worker_flags, no por ventana.
  const windowStartMs = Date.now() + 15 * 60 * 1000;
  const windowEndMs   = Date.now() + 35 * 60 * 1000;
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEnd   = new Date(windowEndMs).toISOString();

  console.log(`[deadline-reminders] Checking matches locking between ${windowStart} and ${windowEnd}...`);

  // 1. Match window: prediction_lock_utc in [now+15min, now+35min]
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

  const candidates = matchResult.rows as unknown as UpcomingMatch[];

  // 2. Filter out matches already notified (idempotencia).
  const upcomingMatches: UpcomingMatch[] = [];
  for (const match of candidates) {
    if (await isFlagSet(flagKey(match.id))) continue;
    upcomingMatches.push(match);
  }

  if (upcomingMatches.length === 0) {
    console.log('[deadline-reminders] No matches closing soon (o ya avisados) — skipping');
    return;
  }

  console.log(`[deadline-reminders] ${upcomingMatches.length} match(es) closing soon`);

  // 3. Get all push subscriptions from DB
  const subsResult = await db.$client.execute(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions'
  );

  const subscriptions = subsResult.rows as unknown as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    console.log('[deadline-reminders] No push subscriptions found — skipping');
    return;
  }

  console.log(`[deadline-reminders] Sending to ${subscriptions.length} subscription(s)`);

  // 4. For each match, send a push notification to all subscribers, then flag it.
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

    await setFlag(flagKey(match.id));
    console.log(
      `[deadline-reminders] Match ${match.id} (${match.home_team} vs ${match.away_team}): ${sent} sent, ${failed} failed — flag seteado`,
    );
  }
}
