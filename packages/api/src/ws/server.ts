import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

// Map: leagueId → Set of connected WebSockets
const rooms = new Map<number, Set<WebSocket>>();

export function createWsServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    let joinedLeagues: number[] = [];

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'join:league' && typeof msg.leagueId === 'number') {
          const leagueId = msg.leagueId;
          if (!rooms.has(leagueId)) rooms.set(leagueId, new Set());
          rooms.get(leagueId)!.add(ws);
          joinedLeagues.push(leagueId);
          ws.send(JSON.stringify({ type: 'joined', leagueId }));
        }

        if (msg.type === 'leave:league' && typeof msg.leagueId === 'number') {
          rooms.get(msg.leagueId)?.delete(ws);
          joinedLeagues = joinedLeagues.filter((id) => id !== msg.leagueId);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      for (const leagueId of joinedLeagues) {
        rooms.get(leagueId)?.delete(ws);
      }
    });

    ws.on('error', () => {
      for (const leagueId of joinedLeagues) {
        rooms.get(leagueId)?.delete(ws);
      }
    });
  });

  return wss;
}

// Broadcast a full match object to all connected clients.
// Sends { type: 'match_updated', data: match } — used from admin update-match handler.
export function broadcastMatchUpdated(match: object) {
  const msg = JSON.stringify({ type: 'match_updated', data: match });
  for (const [, room] of rooms) {
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }
}
