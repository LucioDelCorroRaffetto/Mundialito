import http from 'node:http';
import { app } from './app.js';
import { PORT } from './constants.js';
import { initDb } from './db/client.js';
import { createWsServer } from './ws/server.js';
import { startAutoSync, stopAutoSync } from './services/auto-sync.js';

async function start() {
  await initDb();
  const httpServer = http.createServer(app);
  createWsServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`Mundialito API running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    startAutoSync();
  });

  // Graceful shutdown: stop the auto-sync timers and let in-flight HTTP
  // requests finish before the process exits. Without this a deploy could
  // kill the API mid-sync, leaving `matches` updated but `predictions.points`
  // partially recomputed (broken standings).
  const shutdown = (sig: string) => {
    console.log(`[server] received ${sig} — shutting down gracefully`);
    stopAutoSync();
    httpServer.close((err) => {
      if (err) {
        console.error('[server] close error:', err);
        process.exit(1);
      }
      process.exit(0);
    });
    // Hard timeout — if anything hangs (open WS, slow query), bail after
    // 10 s so the platform doesn't kill us with SIGKILL anyway.
    setTimeout(() => {
      console.warn('[server] forcing exit after 10s timeout');
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
