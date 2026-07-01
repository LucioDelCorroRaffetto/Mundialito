/**
 * Runner del recordatorio diario de pronósticos.
 * Se ejecuta UNA vez por día vía el cron `mundialito-daily-reminder` de Render
 * (12:00 UTC ≈ 09:00 AR) y sale. Ver render.yaml.
 *
 * Separado de run-once.js a propósito: run-once corre cada 2 min (deadlines por
 * partido) y este job NO debe correr cada 2 min — mandaría el mismo push del
 * día una y otra vez.
 *
 *   DRY_RUN=1 node dist/run-daily.js   # preview, no envía
 *   node dist/run-daily.js             # envía
 */
import 'dotenv/config';
import { sendDailyPredictionReminder } from './jobs/send-daily-prediction-reminder.js';

async function main() {
  console.log('[run-daily] starting at', new Date().toISOString());
  try {
    await sendDailyPredictionReminder();
  } catch (err) {
    console.error('[run-daily] daily-reminder error:', err);
  }
  console.log('[run-daily] done');
  process.exit(0);
}

main().catch((err) => {
  console.error('[run-daily] fatal:', err);
  process.exit(1);
});
