/**
 * Hace ping al endpoint /sync del API en cada tick del cron.
 *
 * El API ya tiene toda la lógica encadenada:
 *   football-data.org → ESPN (fallback) → al detectar finished, dispara
 *   syncFifaStatsForMatch (FIFA timeline público, sin key) → recompute fantasy.
 *
 * Antes el worker poolleaba directamente API-Football, pero su free tier
 * NO cubre WC 2026 (verificado por el equipo). El resultado era que los
 * partidos nunca se marcaban como `finished` automáticamente y todo el
 * pipeline de stats / scoring quedaba parado.
 *
 * Requiere env vars:
 *   - API_BASE_URL  (e.g. https://mundialito-d2jk.onrender.com)
 *   - SYNC_SECRET   (opcional; si está seteada en el API, mandamos el header)
 */
const API_BASE_URL = process.env.API_BASE_URL ?? '';
const SYNC_SECRET = process.env.SYNC_SECRET ?? '';

export async function pollLiveMatches(): Promise<void> {
  if (!API_BASE_URL) {
    console.warn('[poll-live] API_BASE_URL not set — skipping');
    return;
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/sync`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SYNC_SECRET) headers['x-sync-secret'] = SYNC_SECRET;

  try {
    const res = await fetch(url, { method: 'POST', headers });
    if (!res.ok) {
      console.error(`[poll-live] /sync returned ${res.status}: ${await res.text().catch(() => '')}`);
      return;
    }
    const body = (await res.json()) as { data?: { synced?: number; matchesChecked?: number; errors?: string[] } };
    const d = body.data ?? {};
    console.log(`[poll-live] /sync ok — checked=${d.matchesChecked ?? 0} synced=${d.synced ?? 0} errors=${(d.errors ?? []).length}`);
    if ((d.errors ?? []).length > 0) {
      console.warn(`[poll-live] errors:`, d.errors);
    }
  } catch (err) {
    console.error('[poll-live] fetch error:', err);
  }
}
