/**
 * Last-call push: avisa a cada usuario qué le falta antes del kickoff
 * inaugural (fantasy incompleto y/o pronósticos pendientes de los partidos
 * de las próximas 24 h). Personalizado por usuario; quien ya está listo no
 * recibe nada (cero spam).
 *
 *   npx tsx src/scripts/notify-last-call.ts            # envía
 *   DRY_RUN=1 npx tsx src/scripts/notify-last-call.ts  # solo muestra
 *
 * Requiere: TURSO_*, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */
import 'dotenv/config';
import webpush from 'web-push';
import { createClient } from '@libsql/client';
import { latamTimes } from '../lib/latam-time.js';

const DRY_RUN = process.env.DRY_RUN === '1';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
if (!DRY_RUN && (!VAPID_PUBLIC || !VAPID_PRIVATE)) {
  console.error('VAPID keys missing'); process.exit(1);
}
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@mundialito.app',
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  );
}

interface SubRow { id: number; user_id: number; endpoint: string; p256dh: string; auth: string }

async function main() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600_000);

  // Partidos de las próximas 24 h (los que cierran hoy).
  const matchesRes = await client.execute({
    sql: `SELECT id, kickoff_utc FROM matches
          WHERE status = 'scheduled' AND kickoff_utc > ? AND kickoff_utc <= ?
          ORDER BY kickoff_utc ASC`,
    args: [now.toISOString(), in24h.toISOString()],
  });
  const todayMatchIds = matchesRes.rows.map((r) => Number(r.id));
  const firstKickoff = matchesRes.rows[0]?.kickoff_utc as string | undefined;
  const kickoffStr = firstKickoff ? latamTimes(firstKickoff) : '15:55 AR';
  console.log(`Partidos en las próximas 24h: ${todayMatchIds.length}`);

  // Suscripciones agrupadas por usuario.
  const subsRes = await client.execute(
    'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions',
  );
  const subs = subsRes.rows as unknown as SubRow[];
  const subsByUser = new Map<number, SubRow[]>();
  for (const s of subs) {
    const list = subsByUser.get(Number(s.user_id)) ?? [];
    list.push(s);
    subsByUser.set(Number(s.user_id), list);
  }
  console.log(`Usuarios con suscripción push: ${subsByUser.size}`);

  let sent = 0, skippedReady = 0, failed = 0, removed = 0;

  for (const [userId, userSubs] of subsByUser) {
    // Fantasy: ¿cuántos jugadores tiene el plantel?
    const squadRes = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM fantasy_squad_players fsp
            JOIN fantasy_teams ft ON ft.id = fsp.fantasy_team_id
            WHERE ft.user_id = ?`,
      args: [userId],
    });
    const squadCount = Number(squadRes.rows[0]?.c ?? 0);
    const fantasyMissing = Math.max(0, 15 - squadCount);

    // Pronósticos pendientes de los partidos de hoy (cualquier liga cuenta).
    let pending = 0;
    if (todayMatchIds.length > 0) {
      const placeholders = todayMatchIds.map(() => '?').join(',');
      const predRes = await client.execute({
        sql: `SELECT COUNT(DISTINCT match_id) AS c FROM predictions
              WHERE user_id = ? AND match_id IN (${placeholders})`,
        args: [userId, ...todayMatchIds],
      });
      pending = todayMatchIds.length - Number(predRes.rows[0]?.c ?? 0);
    }

    if (fantasyMissing === 0 && pending === 0) { skippedReady++; continue; }

    const parts: string[] = [];
    if (fantasyMissing > 0) {
      parts.push(squadCount === 0
        ? 'todavía no armaste tu fantasy'
        : `te faltan ${fantasyMissing} jugadores en tu fantasy`);
    }
    if (pending > 0) {
      parts.push(`tenés ${pending} pronóstico${pending > 1 ? 's' : ''} sin hacer de los partidos de hoy`);
    }
    const body = `${parts.join(' y ')[0].toUpperCase()}${parts.join(' y ').slice(1)}. ` +
      `El fantasy cierra antes del ${kickoffStr}. ¡Corré!`;
    const payload = JSON.stringify({
      title: '🚨 ¡HOY arranca el Mundial!',
      body,
      url: fantasyMissing > 0 ? '/fantasy' : '/matches',
    });

    console.log(`  user ${userId}: ${body}${DRY_RUN ? ' [DRY]' : ''}`);
    if (DRY_RUN) continue;

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 410 || code === 404) {
          removed++;
          await client.execute({ sql: 'DELETE FROM push_subscriptions WHERE id = ?', args: [sub.id] });
        } else {
          failed++;
        }
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  console.log(`\nsent=${sent} alListo(skip)=${skippedReady} failed=${failed} expiradas=${removed}`);
  client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
