import webpush from 'web-push';
import { db } from '../db/client.js';

// VAPID keys must be set in environment
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@mundialito.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not configured — skipping push');
    return;
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
  } catch (err: any) {
    // 410 Gone / 404 = subscription is permanently dead. Delete it so the
    // deadline-reminder jobs (which fan out to every subscriber) stop
    // iterating dead rows forever. endpoint has a UNIQUE index.
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      console.log('[push] Subscription expired — deleting endpoint:', subscription.endpoint);
      try {
        await db.$client.execute({
          sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
          args: [subscription.endpoint],
        });
      } catch (delErr: any) {
        console.error('[push] Failed to delete expired subscription:', delErr?.message);
      }
    } else {
      console.error('[push] Send error:', err?.message);
    }
  }
}
