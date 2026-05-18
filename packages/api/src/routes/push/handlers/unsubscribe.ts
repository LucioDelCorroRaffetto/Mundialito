import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { pushSubscriptions } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function unsubscribeHandler(req: Request, res: Response) {
  const { endpoint } = req.body as z.infer<typeof unsubscribeSchema>;

  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));

  return res.json({ ok: true });
}
