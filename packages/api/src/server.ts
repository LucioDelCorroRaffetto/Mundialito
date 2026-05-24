import http from 'node:http';
import { app } from './app.js';
import { PORT } from './constants.js';
import { initDb } from './db/client.js';
import { createWsServer } from './ws/server.js';
import { startAutoSync } from './services/auto-sync.js';

async function start() {
  await initDb();
  const httpServer = http.createServer(app);
  createWsServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`Mundialito API running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    startAutoSync();
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
