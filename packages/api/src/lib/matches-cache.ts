/**
 * Cache en memoria de muy corta duración para los endpoints de lectura de
 * `matches`. Motivo: en Render free tier, las filas que Turso devuelve cuentan
 * como bandwidth saliente (Service-Initiated). El frontend pollea `GET
 * /matches` cada ~30s y `GET /matches/:id` cada ~45s desde ~40 usuarios; sin
 * cache, cada poll re-lee Turso y esas filas se facturan. Con un TTL corto,
 * todos los polls que caen dentro de la misma ventana colapsan en una sola
 * lectura a Turso.
 *
 * Por qué NO degrada la experiencia en vivo:
 *  - El TTL (20s) es menor que el intervalo de polling, así que un poll nunca
 *    ve datos más viejos que el tick anterior.
 *  - Los cambios reales (gol, cambio de estado, cierre) se empujan al instante
 *    por WebSocket (`broadcastMatchUpdate`), y ESE mismo choke point invalida
 *    esta cache (ver ws/broadcast.ts). O sea: apenas algo cambia de verdad, el
 *    siguiente poll lee fresco de inmediato; el TTL solo evita lecturas
 *    redundantes cuando NO cambió nada.
 */

type Entry = { expiresAt: number; body: unknown };

const TTL_MS = 20_000;
const store = new Map<string, Entry>();

export function getCachedMatches(key: string): unknown | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.body;
}

export function setCachedMatches(key: string, body: unknown): void {
  store.set(key, { expiresAt: Date.now() + TTL_MS, body });
}

/**
 * Invalida toda la cache de matches. Se llama desde el choke point de escritura
 * (broadcastMatchUpdate) para que cualquier cambio real se refleje en el
 * próximo poll sin esperar al TTL.
 */
export function invalidateMatchesCache(): void {
  store.clear();
}
