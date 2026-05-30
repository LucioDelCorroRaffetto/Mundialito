import { Request, Response } from 'express';
import webpush from 'web-push';
import { db } from '../../../db/index.js';
import { pushSubscriptions } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

/**
 * Fires a test push to every subscription the current user owns. Lets people
 * verify that notifications actually arrive on their device before the
 * tournament starts — otherwise the first time they'd find out something's
 * wrong is when they miss the 30-minute deadline ping.
 *
 * Calls web-push directly (instead of the shared sendPushNotification helper)
 * so we can distinguish "delivered", "soft-failed" and "endpoint is dead"
 * and clean up stale rows in one go.
 *
 * Returns counts so the client can show "enviada a X dispositivo(s)".
 */
export async function sendTestPushHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@mundialito.app';

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({
      error: { code: 'VAPID_MISSING', message: 'Servidor sin VAPID configurado' },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) {
    return res.status(404).json({
      error: { code: 'NO_SUBSCRIPTION', message: 'No tenés ninguna suscripción activa' },
    });
  }

  const payload = JSON.stringify({
    title: '⚽ ¡Notificaciones funcionando!',
    body: 'Vas a recibir avisos 30 minutos antes de cada partido del Mundial.',
    url: '/home',
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err: any) {
      failed++;
      // Garbage-collect dead subscriptions so future runs don't fail on them.
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        removed++;
      }
    }
  }

  return res.json({ data: { devices: subs.length, sent, failed, removed } });
}
