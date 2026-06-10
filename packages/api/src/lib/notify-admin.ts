import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { sendPushNotification } from './push-sender.js';

/**
 * Sends a push notification to every device subscribed by the admin user(s).
 * Used to alert when the FIFA stats pipeline runs into trouble during a real
 * tournament match — without this, a silent parser failure would only be
 * caught by manually inspecting Render logs.
 *
 * The admin set is taken from `ADMIN_USER_IDS` (comma-separated env). Falls
 * back to a no-op when the env is missing.
 */
export async function notifyAdmin(title: string, body: string, url = '/admin'): Promise<void> {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (adminIds.length === 0) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, adminIds));
  if (subs.length === 0) return;

  for (const s of subs) {
    try {
      await sendPushNotification(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        { title, body, url },
      );
    } catch (err) {
      // 410 (gone) means the subscription is expired — clean it up.
      if ((err as { statusCode?: number }).statusCode === 410) {
        try {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } catch {
          // ignore secondary failure
        }
      }
    }
  }
}
