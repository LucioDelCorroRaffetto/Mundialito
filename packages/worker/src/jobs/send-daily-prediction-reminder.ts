// Recordatorio DIARIO temprano: "hoy hay partidos, entrá a pronosticar".
//
// A diferencia de send-deadline-reminders (que dispara ~30 min antes de CADA
// partido), este job corre UNA vez por día bien temprano y le avisa a TODOS los
// suscriptos qué partidos se juegan hoy y contra quién, para que la gente se
// acuerde de entrar a la app. Es un broadcast: le llega a todos los que tienen
// push activado, hayan pronosticado o no. Si no hay partidos hoy, no manda nada.
//
// No incluye fecha a propósito: el aviso es "hoy", y la app la usan desde
// varios países — la hora ya se muestra por zona (ver latamTimes) para no
// confundir. La fecha calendario sería redundante y ambigua entre husos.
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
interface SubRow { endpoint: string; p256dh: string; auth: string }

// En fase eliminatoria los rivales pueden estar sin definir (placeholder
// "Por determinar"). En ese caso no mostramos nombres — quedaría feo un
// "Por determinar vs Por determinar" — y los contamos como "por definir".
const isTbd = (name: string) => /por determinar|tbd/i.test(name);

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

  // Hora del primer partido del día, mostrada por zona LATAM (country-aware).
  const firstTime = latamTimes(matches[0].kickoff_utc);

  // Rivales del día: los definidos se listan por nombre; los TBD se cuentan.
  const namedLabels = matches
    .filter((m) => !isTbd(m.home) && !isTbd(m.away))
    .map((m) => `${m.home} vs ${m.away}`);
  const tbdCount = matches.length - namedLabels.length;

  let body: string;
  if (matches.length === 1) {
    body = namedLabels.length
      ? `Hoy juega ${namedLabels[0]} a las ${firstTime}. ¡Entrá y pronosticá!`
      : `Hoy hay un partido a las ${firstTime}. ¡Entrá y pronosticá!`;
  } else if (namedLabels.length === 0) {
    // Todos los cruces todavía sin definir (eliminatorias sin resolver).
    body = `Hoy juegan ${matches.length} partidos, con los rivales por definir. El primero a las ${firstTime}. ¡Entrá y pronosticá!`;
  } else {
    const pieces: string[] = [namedLabels.join(', ')];
    if (tbdCount) pieces.push(`${tbdCount} partido${tbdCount > 1 ? 's' : ''} por definir`);
    body = `Hoy juegan ${matches.length} partidos: ${pieces.join(' y ')}. El primero a las ${firstTime}. ¡Entrá y pronosticá!`;
  }

  const payload = { title: '⚽ ¡Hoy hay partidos!', body, url: '/matches' };
  console.log(`[daily-reminder] ${matches.length} partido(s) hoy — mensaje: ${body}`);

  // Broadcast: todas las suscripciones push, sin filtrar por usuario.
  const subsRes = await db.$client.execute(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions',
  );
  const subs = subsRes.rows as unknown as SubRow[];
  console.log(`[daily-reminder] ${subs.length} suscripción(es) push${DRY_RUN ? ' [DRY]' : ''}`);

  if (DRY_RUN) return;

  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, payload);
      sent++;
    } catch {
      failed++;
    }
    // Rate limit suave entre envíos, igual que los scripts one-off.
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`[daily-reminder] sent=${sent} failed=${failed}`);
}
