/**
 * notify-kickoff-today.ts
 *
 * Push a TODOS los suscriptores: el partido inaugural arranca hoy.
 * Si al usuario le falta algún pronóstico de la primera fecha, el mensaje
 * lo menciona. Si ya predijo todo, recibe solo el aviso festivo.
 *
 *   DRY_RUN=1 npx tsx src/scripts/notify-kickoff-today.ts   # preview
 *   npx tsx src/scripts/notify-kickoff-today.ts              # enviar
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

function formatAR(isoUtc: string): string {
  try {
    return new Date(isoUtc).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return new Date(isoUtc).toISOString().slice(11, 16) + ' UTC';
  }
}

async function main() {
  // Partidos de las próximas 8h (primera fecha inminente).
  const now = new Date();
  const in8h = new Date(now.getTime() + 8 * 3600_000);
  const matchesRes = await client.execute({
    sql: `SELECT m.id, m.kickoff_utc, ht.name AS home, at.name AS away
          FROM matches m
          JOIN teams ht ON ht.id = m.home_team_id
          JOIN teams at ON at.id = m.away_team_id
          WHERE m.status = 'scheduled' AND m.kickoff_utc > ? AND m.kickoff_utc <= ?
          ORDER BY m.kickoff_utc ASC`,
    args: [now.toISOString(), in8h.toISOString()],
  });

  const matches = matchesRes.rows as unknown as { id: number; kickoff_utc: string; home: string; away: string }[];
  console.log(`Partidos en las próximas 8h: ${matches.length}`);
  matches.forEach(m => console.log(`  ${m.home} vs ${m.away} — ${formatAR(m.kickoff_utc)} AR`));

  const firstMatch = matches[0];
  const kickoffStr = firstMatch ? latamTimes(firstMatch.kickoff_utc) : 'hoy';
  const matchLabel = firstMatch ? `${firstMatch.home} vs ${firstMatch.away}` : 'primer partido';
  const matchIds = matches.map(m => Number(m.id));

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

  let sent = 0, failed = 0, removed = 0;

  for (const [userId, userSubs] of subsByUser) {
    // Pronósticos pendientes de la primera fecha.
    let pending = 0;
    if (matchIds.length > 0) {
      const placeholders = matchIds.map(() => '?').join(',');
      const predRes = await client.execute({
        sql: `SELECT COUNT(DISTINCT match_id) AS c FROM predictions
              WHERE user_id = ? AND match_id IN (${placeholders})`,
        args: [userId, ...matchIds],
      });
      pending = matchIds.length - Number(predRes.rows[0]?.c ?? 0);
    }

    const title = '⚽ ¡Arranca la primera fecha del Mundial!';
    const body = pending > 0
      ? `Te falt${pending > 1 ? 'an' : 'a'} ${pending} pronóstico${pending > 1 ? 's' : ''} — ${matchLabel} empieza ${kickoffStr}. ¡Corré!`
      : `${matchLabel} empieza ${kickoffStr}. ¡Todo listo — a disfrutar!`;
    const url = pending > 0 ? '/matches' : '/home';

    console.log(`  user ${userId} (${pending} pendientes): ${body}${DRY_RUN ? ' [DRY]' : ''}`);
    if (DRY_RUN) continue;

    const payload = JSON.stringify({ title, body, url });
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
      await new Promise(r => setTimeout(r, 80));
    }
  }

  console.log(`\nsent=${sent} failed=${failed} expiradas=${removed}`);
  client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
