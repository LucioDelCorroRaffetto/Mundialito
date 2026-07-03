// Push post-final: avisa a todos los usuarios que su Wrapped ya está listo.
// Se dispara desde run-daily.ts (una vez al día) después del match final
// terminar. Idempotente vía worker_flags['wrapped_push_sent'] — correrlo dos
// veces manda un solo push en total.

import { db } from '../db/client.js';
import { sendPushNotification } from '../lib/push-sender.js';

const DRY_RUN = process.env.DRY_RUN === '1';
const FLAG_KEY = 'wrapped_push_sent';

interface SubRow { id: number; endpoint: string; p256dh: string; auth: string }

async function isFlagSet(): Promise<boolean> {
  const res = await db.$client.execute({
    sql: 'SELECT 1 FROM worker_flags WHERE key = ?',
    args: [FLAG_KEY],
  });
  return res.rows.length > 0;
}

async function setFlag(): Promise<void> {
  await db.$client.execute({
    sql: `INSERT INTO worker_flags (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [FLAG_KEY, '1', new Date().toISOString()],
  });
}

export async function sendWrappedReady(): Promise<void> {
  const finalRes = await db.$client.execute(
    `SELECT status FROM matches WHERE round = 'final' LIMIT 1`,
  );
  const finalStatus = finalRes.rows[0]?.status;

  if (finalStatus !== 'finished') {
    console.log('[wrapped-ready] La final todavía no terminó — nada que hacer');
    return;
  }

  if (await isFlagSet()) {
    console.log('[wrapped-ready] Push ya enviado antes (worker_flags) — nada que hacer');
    return;
  }

  const subsRes = await db.$client.execute(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions',
  );
  const subs = subsRes.rows as unknown as SubRow[];
  console.log(`[wrapped-ready] Enviando a ${subs.length} suscripción(es)${DRY_RUN ? ' [DRY]' : ''}`);

  if (DRY_RUN) return;

  const payload = {
    title: '🏆 Tu Mundialito Wrapped está listo',
    body: 'Mirá tu resumen del Mundial y compartilo',
    url: '/wrapped',
  };

  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, payload);
      sent++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  await setFlag();
  console.log(`[wrapped-ready] sent=${sent} failed=${failed} — flag seteado`);
}
