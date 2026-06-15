/**
 * Sincroniza horarios de TODOS los partidos del torneo contra el feed FIFA.
 * Diferencia con el sync incremental que corre cada tick desde /sync:
 *   - El de /sync mira solo los próximos 48h (2 requests a FIFA).
 *   - Este recorre las 6 semanas del torneo para detectar reschedules
 *     lejanos (ej. cambio de sede de cuartos a 3 semanas).
 *
 * Idempotente. Corré cuando sospeches que la app muestra una hora vieja
 * de un partido lejano. Para ahora-y-mañana, basta esperar 1 tick del
 * cron (que ya lo cubre).
 */
import 'dotenv/config';
import { syncFixtureTimes } from '../services/fixture-time-sync.js';

const SIX_WEEKS_MS = 42 * 24 * 3600 * 1000;

async function main() {
  console.log('[sync-fixture-times] running full-tournament sweep...');
  const result = await syncFixtureTimes(0, SIX_WEEKS_MS);
  console.log(
    `[sync-fixture-times] updated=${result.updated} unchanged=${result.unchanged} errors=${result.errors.length}`,
  );
  for (const e of result.errors) console.warn('  err:', e);
}

main().catch((err) => {
  console.error('[sync-fixture-times] fatal:', err);
  process.exit(1);
});
