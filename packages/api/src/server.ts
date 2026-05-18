import { app } from './app.js';
import { PORT } from './constants.js';
import { initDb } from './db/client.js';

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Mundialito API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
