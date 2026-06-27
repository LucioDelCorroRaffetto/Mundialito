/**
 * Singleton broadcast helpers — import these from route handlers to avoid
 * circular deps with ws/server.ts.
 */
import { broadcastMatchUpdated } from './server.js';
import { invalidateMatchesCache } from '../lib/matches-cache.js';
import type { Match } from '../db/schema/matches.js';

/**
 * Broadcast a full match object to all connected WS clients.
 * Sends { type: 'match_updated', data: match }.
 *
 * También invalida la cache HTTP de matches: este es el único punto por el que
 * pasan todas las escrituras relevantes de un partido (sync de score, finalize,
 * update de admin), así que invalidar acá garantiza que el próximo poll lea
 * fresco de Turso apenas hubo un cambio real, sin esperar al TTL.
 */
export function broadcastMatchUpdate(match: Match) {
  invalidateMatchesCache();
  broadcastMatchUpdated(match);
}
