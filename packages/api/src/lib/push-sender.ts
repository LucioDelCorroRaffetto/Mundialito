import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema/index.js';

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
    // 410 Gone / 404 = subscription is permanently dead. Delete it so it stops
    // accumulating and being iterated on every future send. The endpoint has a
    // UNIQUE index, so deleting by endpoint removes exactly this dead row.
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      console.log('[push] Subscription expired — deleting endpoint:', subscription.endpoint);
      try {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
      } catch (delErr: any) {
        console.error('[push] Failed to delete expired subscription:', delErr?.message);
      }
    } else {
      console.error('[push] Send error:', err?.message);
    }
  }
}
