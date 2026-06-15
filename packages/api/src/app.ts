import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { eq } from 'drizzle-orm';
import { tokenParse } from './middleware/token-parse.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';
import { syncScores } from './services/sync-scores.js';
import { syncScoresFromEspn } from './services/sync-espn.js';
import { syncFifaStatsForMatch } from './services/sync-fifa-stats.js';
import { reconcileMatchStatuses } from './services/reconcile-matches.js';
import { syncFixtureTimes } from './services/fixture-time-sync.js';
import { invalidateForecastCache } from './services/forecast-service.js';
import { db } from './db/index.js';
import { matches } from './db/schema/index.js';

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

  // Pull fresh kickoff times from FIFA before any other sync. If a match
  // was rescheduled (FIFA moves a game by hours, common close to kickoff)
  // we want score+stat syncs to reason about the new time, and reconcile
  // to flip the status based on it. Acotamos a 48h hacia adelante para
  // mantener el costo en 2 requests a FIFA por tick. La sincronización
  // completa del fixture queda en el script manual.
  const fixtureTimes = await syncFixtureTimes(0, 48 * 3600 * 1000).catch((err) => {
    console.error('[fixture-time-sync] failed:', err);
    return { updated: 0, unchanged: 0, errors: [String(err)] };
  });

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

  // After score sync, refresh FIFA timeline (goals/cards/subs per minute) for
  // any live matches so the cronología renders during the game instead of
  // only at full time. Each call is wrapped so one bad match doesn't poison
  // the rest of the tick.
  const liveMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.status, 'live'))
    .catch((err) => {
      console.error('[sync-live-fifa] failed loading live matches:', err);
      return [] as { id: number }[];
    });

  // Sync in parallel — sequential awaits would multiply each FIFA request
  // latency by the number of live matches and easily exceed cron-job.org's
  // 30s ceiling on a slot with 3-4 simultaneous games. inFlight inside
  // syncFifaStatsForMatch prevents per-match re-entry; cross-match calls
  // are independent so concurrent is safe.
  const fifaResults: Array<{ matchId: number; upserted: number; skipped?: string; error?: string }> =
    await Promise.all(
      liveMatches.map(async (m) => {
        try {
          const r = await syncFifaStatsForMatch(m.id, { force: true });
          if (r.skipped) {
            console.log(`[sync-live-fifa] match ${m.id}: skipped (${r.skipped})`);
          } else {
            console.log(`[sync-live-fifa] match ${m.id}: ${r.upserted} events synced`);
          }
          return { matchId: m.id, upserted: r.upserted, skipped: r.skipped };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[sync-live-fifa] match ${m.id}: ${msg}`);
          return { matchId: m.id, upserted: 0, error: msg };
        }
      }),
    );
  const fifaEventsSynced = fifaResults.reduce((acc, r) => acc + r.upserted, 0);

  // Safety net: catches matches the feeds left stuck (scheduled past
  // kickoff, live hours after FT). Runs last so it sees the latest
  // status from both feeds before deciding to force a transition.
  const reconcile = await reconcileMatchStatuses().catch((err) => {
    console.error('[reconcile-matches] failed:', err);
    return { startedAuto: 0, finishedAuto: 0, skippedNoScore: 0, errors: [String(err)] };
  });
  const shouldInvalidate =
    result.synced > 0 ||
    fifaEventsSynced > 0 ||
    reconcile.startedAuto > 0 ||
    reconcile.finishedAuto > 0 ||
    fixtureTimes.updated > 0;
  if (shouldInvalidate) invalidateForecastCache();
  return res.json({ data: { ...result, liveFifa: fifaResults, reconcile, fixtureTimes } });
});
app.use('/api/v1', apiRouter);

app.use(errorHandler);
