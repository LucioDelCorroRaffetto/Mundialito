import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { pushSubscriptions } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function subscribeHandler(req: Request, res: Response) {
  const { endpoint, keys } = req.body as z.infer<typeof subscribeSchema>;
  const userId = req.user!.id;

  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers['user-agent'] ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        // Re-bind the subscription to whoever is currently authenticated:
        // when a user shares a device, the previous owner's userId would
        // otherwise stick to this endpoint and their notifications would
        // end up pushed to the new user. Always reassign on resubscribe.
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

  return res.json({ ok: true });
}
