import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { tokenParse } from './middleware/token-parse.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';
import { syncScores } from './services/sync-scores.js';
import { syncScoresFromEspn } from './services/sync-espn.js';

export const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5174', 'http://localhost:5173'];

console.log('[CORS] Allowed origins:', ALLOWED_ORIGINS);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(tokenParse);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Public sync endpoint — intended to be called by an external cron service
// (e.g. cron-job.org every 3 min). Secured by optional SYNC_SECRET env var.
app.post('/sync', async (req, res) => {
  const secret = process.env.SYNC_SECRET;
  if (secret && req.headers['x-sync-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Try primary (football-data.org), fall back to ESPN if it fails
  let result = await syncScores({ dateFrom: today, dateTo: today }).catch((err) => ({
    synced: 0, errors: [String(err)], matchesChecked: 0,
  }));

  if (result.errors.length > 0 || !process.env.FOOTBALL_DATA_API_KEY) {
    const espnResult = await syncScoresFromEspn(today).catch((err) => ({
      synced: 0, errors: [String(err)], matchesChecked: 0,
    }));
    result = {
      synced: result.synced + espnResult.synced,
      errors: [...result.errors.map((e) => `[fd] ${e}`), ...espnResult.errors.map((e) => `[espn] ${e}`)],
      matchesChecked: Math.max(result.matchesChecked, espnResult.matchesChecked),
    };
  }

  return res.json({ data: result });
});
app.use('/api/v1', apiRouter);

app.use(errorHandler);
