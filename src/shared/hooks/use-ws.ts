import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';

export function useLeagueSocket(leagueId: number | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!leagueId) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join:league', leagueId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'match:update') {
          // Invalidate match queries so UI refreshes
          qc.invalidateQueries({ queryKey: ['matches'] });
          qc.invalidateQueries({ queryKey: ['match', msg.matchId] });
        }

        if (msg.type === 'standings:updated') {
          qc.invalidateQueries({ queryKey: ['league', leagueId, 'standings'] });
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = (err) => {
      console.warn('[ws] connection error', err);
    };

    return () => {
      ws.send(JSON.stringify({ type: 'leave:league', leagueId }));
      ws.close();
    };
  }, [leagueId, qc]);

  const send = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { send };
}
