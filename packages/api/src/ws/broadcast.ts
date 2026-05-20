/**
 * Singleton broadcast helpers — import these from route handlers to avoid
 * circular deps with ws/server.ts.
 */
import { broadcastMatchUpdated } from './server.js';
import type { Match } from '../db/schema/matches.js';

/**
 * Broadcast a full match object to all connected WS clients.
 * Sends { type: 'match_updated', data: match }.
 */
export function broadcastMatchUpdate(match: Match) {
  broadcastMatchUpdated(match);
}
