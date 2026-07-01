// Recordatorio DIARIO temprano: "hoy hay partidos, entrá a pronosticar".
//
// A diferencia de send-deadline-reminders (que dispara ~30 min antes de CADA
// partido, para todos), este job corre UNA vez por día bien temprano y le
// avisa a cada usuario cuántos pronósticos le faltan para los partidos de HOY.
// Es personalizado: quien ya pronosticó todo lo de hoy NO recibe nada (cero
// spam). Si no hay partidos hoy, no manda nada.
//
// Pensado para el cron `mundialito-daily-reminder` de Render (una vez al día,
// 12:00 UTC ≈ 09:00 AR). Ver render.yaml.
//
//   DRY_RUN=1 node dist/run-daily.js   # solo muestra, no envía
//   node dist/run-daily.js             # envía

import { db } from '../db/client.js';
import { sendPushNotification } from '../lib/push-sender.js';

const DRY_RUN = process.env.DRY_RUN === '1';

// Argentina es UTC-3 todo el año (sin DST). El recordatorio se ancla al día
// calendario AR: desde "ahora" hasta el fin del día AR, para incluir también
// los partidos nocturnos (p. ej. 22:00 AR = 01:00 UTC del día siguiente) y
// excluir los de mañana.
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Fin del día calendario argentino actual, como ISO UTC. */
function endOfArDayUtc(now: Date): string {
  const arWall = new Date(now.getTime() - AR_OFFSET_MS); // campos UTC = reloj AR
  const endArWallMs = Date.UTC(
    arWall.getUTCFullYear(),
    arWall.getUTCMonth(),
    arWall.getUTCDate(),
    23, 59, 59, 999,
  );
  return new Date(endArWallMs + AR_OFFSET_MS).toISOString();
}

// latamTimes vive en packages/api/src/lib/latam-time.ts, pero el worker no
// depende del paquete api (igual que los deadlines de fantasy están inlineados
// en send-fantasy-deadline-reminders). Copia mínima; mantener en sync.
const ZONES: Array<{ tz: string; label: string }> = [
  { tz: 'America/Argentina/Buenos_Aires', label: 'AR/UY/BR' },
  { tz: 'America/Santiago',               label: 'CL/BO/VE' },
  { tz: 'America/Bogota',                 label: 'CO/PE/EC' },
  { tz: 'America/Mexico_City',            label: 'MX/CA/CU' },
];

function latamTimes(isoUtc: string): string {
  const date = new Date(isoUtc);
  const seen = new Map<string, string[]>();
  for (const { tz, label } of ZONES) {
    let time: string;
    try {
      time = date.toLocaleTimeString('es', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      time = date.toISOString().slice(11, 16);
    }
    const labels = seen.get(time) ?? [];
    labels.push(label);
    seen.set(time, labels);
  }
  return [...seen.entries()].map(([time, labels]) => `${time} ${labels.join('/')}`).join(' · ');
}

interface MatchRow { id: number; kickoff_utc: string; home: string; away: string }
interface SubRow { id: number; user_id: number; endpoint: string; p256dh: string; auth: string }

export async function sendDailyPredictionReminder(): Promise<void> {
  const now = new Date();
  const endOfDay = endOfArDayUtc(now);

  // Partidos que todavía se pueden pronosticar y que arrancan HOY (AR).
  const matchesRes = await db.$client.execute({
    sql: `SELECT m.id, m.kickoff_utc, ht.name AS home, away_t.name AS away
          FROM matches m
          JOIN teams ht ON ht.id = m.home_team_id
          JOIN teams away_t ON away_t.id = m.away_team_id
          WHERE m.status = 'scheduled'
            AND m.kickoff_utc > ?
            AND m.kickoff_utc <= ?
          ORDER BY m.kickoff_utc ASC`,
    args: [now.toISOString(), endOfDay],
  });
  const matches = matchesRes.rows as unknown as MatchRow[];

  if (matches.length === 0) {
    console.log('[daily-reminder] No hay partidos hoy (AR) — nada que enviar');
    return;
  }

  const matchIds = matches.map((m) => Number(m.id));
  const first = matches[0];
  // En fase eliminatoria los rivales pueden estar sin definir (placeholder
  // "Por determinar"). En ese caso no mostramos nombres — quedaría feo un
  // "Por determinar vs Por determinar" — y usamos una frase genérica.
  const isTbd = (name: string) => /por determinar|tbd/i.test(name);
  const firstNamed = !isTbd(first.home) && !isTbd(first.away);
  const firstLabel = `${first.home} vs ${first.away}`;
  const firstTime = latamTimes(first.kickoff_utc);
  console.log(`[daily-reminder] ${matches.length} partido(s) hoy — primero ${firstLabel} @ ${firstTime}`);

  // Suscripciones agrupadas por usuario.
  const subsRes = await db.$client.execute(
    'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions',
  );
  const subs = subsRes.rows as unknown as SubRow[];
  const subsByUser = new Map<number, SubRow[]>();
  for (const s of subs) {
    const list = subsByUser.get(Number(s.user_id)) ?? [];
    list.push(s);
    subsByUser.set(Number(s.user_id), list);
  }
  console.log(`[daily-reminder] ${subsByUser.size} usuario(s) con suscripción push`);

  const placeholders = matchIds.map(() => '?').join(',');
  let sent = 0, skippedReady = 0, failed = 0;

  for (const [userId, userSubs] of subsByUser) {
    // Un match cuenta como "pronosticado" si el usuario tiene CUALQUIER
    // predicción para él (en cualquier liga): la primera predicción se
    // propaga a todas sus ligas, así que DISTINCT match_id alcanza.
    const predRes = await db.$client.execute({
      sql: `SELECT COUNT(DISTINCT match_id) AS c FROM predictions
            WHERE user_id = ? AND match_id IN (${placeholders})`,
      args: [userId, ...matchIds],
    });
    const done = Number(predRes.rows[0]?.c ?? 0);
    const pending = matchIds.length - done;

    if (pending <= 0) { skippedReady++; continue; }

    const plural = pending > 1;
    let body: string;
    if (matches.length > 1) {
      const tail = firstNamed
        ? `El primero: ${firstLabel} a las ${firstTime}.`
        : `El primero arranca a las ${firstTime}.`;
      body = `Te falta${plural ? 'n' : ''} ${pending} pronóstico${plural ? 's' : ''} para hoy. ${tail} ¡Entrá y jugá!`;
    } else {
      body = firstNamed
        ? `${firstLabel} juega hoy a las ${firstTime} y todavía no lo pronosticaste. ¡Entrá y jugá!`
        : `Hoy hay un partido a las ${firstTime} y todavía no lo pronosticaste. ¡Entrá y jugá!`;
    }

    const payload = { title: '⚽ ¡Hoy hay partidos!', body, url: '/matches' };
    console.log(`  user ${userId} (${pending} pendiente${plural ? 's' : ''})${DRY_RUN ? ' [DRY]' : ''}: ${body}`);
    if (DRY_RUN) continue;

    for (const sub of userSubs) {
      try {
        await sendPushNotification(sub, payload);
        sent++;
      } catch {
        failed++;
      }
      // Rate limit suave entre envíos, igual que los scripts one-off.
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  console.log(`[daily-reminder] sent=${sent} alDia(skip)=${skippedReady} failed=${failed}`);
}
