import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { tokenParse } from './middleware/token-parse.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';
import { syncScores } from './services/sync-scores.js';
import { syncScoresFromEspn } from './services/sync-espn.js';
import { syncLiveMatches } from './services/sync-live.js';
import { reconcileMatchStatuses } from './services/reconcile-matches.js';
import { syncFixtureTimes } from './services/fixture-time-sync.js';
import { reconcileSquadsFromWikipedia } from './services/squad-reconcile.js';
import { invalidateForecastCache } from './services/forecast-service.js';
import { libsqlClient } from './db/client.js';

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
// 'combined' in prod (timestamp + IP + UA — useful for "what happened at
// 19:43?" during a live match); 'dev' (terse, colorized) locally.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(tokenParse);

// Health check that actually touches the DB. A bare {status:'ok'} reports
// healthy even when Turso is down, which defeats alerting. Short timeout so a
// hung DB doesn't hang the probe (and trips a 503 the host can act on).
app.get('/health', async (_req, res) => {
  try {
    await Promise.race([
      libsqlClient.execute('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2500)),
    ]);
    return res.json({ status: 'ok', db: 'up' });
  } catch {
    return res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Sync endpoint — intended to be called by an external cron service
// (e.g. cron-job.org every 3 min). Secured by SYNC_SECRET.
//
// This endpoint drives the authoritative live-scoring path (scores + FIFA
// timeline + finalize + reconcile + squad reconcile) and leans on a rate-
// limited external feed (football-data: 10 req/min). Leaving it open lets
// anyone exhaust that quota or force finalize/reconcile mid-match. In
// production we therefore REFUSE to serve it unless SYNC_SECRET is set, and
// always require the header to match — there is no "secret missing → open"
// fallback anymore.
app.post('/sync', async (req, res) => {
  const secret = process.env.SYNC_SECRET;
  // In production a missing secret means the endpoint would be wide open —
  // refuse to serve it instead. In dev (no NODE_ENV=production) we keep the
  // old behaviour of allowing an unauthenticated call when no secret is set,
  // so local testing of the sync path stays frictionless.
  if (process.env.NODE_ENV === 'production' && !secret) {
    console.error('[sync] SYNC_SECRET is not set — refusing to expose /sync in production');
    return res.status(503).json({ error: 'sync disabled: SYNC_SECRET not configured' });
  }
  if (secret && req.headers['x-sync-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);
  // Include yesterday so matches that started near midnight UTC and
  // finished after 00:00 UTC are still picked up in the next tick.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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

  // Try primary (football-data.org), fall back to ESPN if it fails.
  // dateFrom=yesterday covers matches that started before midnight UTC.
  let result = await syncScores({ dateFrom: yesterday, dateTo: today }).catch((err) => ({
    synced: 0, errors: [String(err)], matchesChecked: 0,
  }));

  if (result.errors.length > 0 || !process.env.FOOTBALL_DATA_API_KEY) {
    // Run ESPN for both dates; merge results.
    const [espnY, espnT] = await Promise.all([
      syncScoresFromEspn(yesterday).catch((err) => ({ synced: 0, errors: [String(err)], matchesChecked: 0 })),
      syncScoresFromEspn(today).catch((err) => ({ synced: 0, errors: [String(err)], matchesChecked: 0 })),
    ]);
    result = {
      synced: result.synced + espnY.synced + espnT.synced,
      errors: [
        ...result.errors.map((e) => `[fd] ${e}`),
        ...espnY.errors.map((e) => `[espn-y] ${e}`),
        ...espnT.errors.map((e) => `[espn-t] ${e}`),
      ],
      matchesChecked: Math.max(result.matchesChecked, espnY.matchesChecked, espnT.matchesChecked),
    };
  }

  // After score sync, refresh FIFA timeline (goals/cards/subs per minute) for
  // any live matches so the cronología renders during the game instead of
  // only at full time, y cerramos por pitazo final. La lógica vive en
  // syncLiveMatches() (compartida con el timer interno de alta frecuencia de
  // auto-sync, que la corre cada pocos segundos para bajar el lag del vivo).
  const live = await syncLiveMatches();
  const fifaResults = live.fifaResults;
  const fifaEventsSynced = live.eventsSynced;
  const anyFinalizedByFifa = live.anyFinalized;

  // Safety net: catches matches the feeds left stuck (scheduled past
  // kickoff, live hours after FT). Runs last so it sees the latest
  // status from both feeds before deciding to force a transition.
  const reconcile = await reconcileMatchStatuses().catch((err) => {
    console.error('[reconcile-matches] failed:', err);
    return { startedAuto: 0, finishedAuto: 0, skippedNoScore: 0, errors: [String(err)] };
  });
  // Squad reconciliation (1 request a Wikipedia, cubre los 48 equipos).
  // Gateá por cooldown de 12h para no martillar Wikipedia ni la DB —
  // los call-ups/withdrawals son eventos esporádicos. Fire-and-forget:
  // si Wikipedia tarda 5s no queremos bloquear cron-job.org.
  const squadStatus = maybeRunSquadReconcile();

  const shouldInvalidate =
    result.synced > 0 ||
    fifaEventsSynced > 0 ||
    anyFinalizedByFifa ||
    reconcile.startedAuto > 0 ||
    reconcile.finishedAuto > 0 ||
    fixtureTimes.updated > 0;
  if (shouldInvalidate) invalidateForecastCache();
  return res.json({ data: { ...result, liveFifa: fifaResults, reconcile, fixtureTimes, squads: squadStatus } });
});

let lastSquadReconcileAt = 0;
const SQUAD_RECONCILE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
function maybeRunSquadReconcile(): { triggered: boolean; lastRunAt: string | null } {
  const now = Date.now();
  if (now - lastSquadReconcileAt < SQUAD_RECONCILE_COOLDOWN_MS) {
    return {
      triggered: false,
      lastRunAt: lastSquadReconcileAt ? new Date(lastSquadReconcileAt).toISOString() : null,
    };
  }
  // Marcá inmediato — si dos ticks concurrentes pegan ambos pasan este
  // chequeo, sólo el primero debería disparar.
  lastSquadReconcileAt = now;
  reconcileSquadsFromWikipedia()
    .then((r) => {
      const total = r.renamed + r.inserted + r.deleted + r.posFixed;
      if (total > 0) {
        console.log(
          `[squad-reconcile] ${r.processed} teams checked, ${total} changes ` +
          `(renamed=${r.renamed} inserted=${r.inserted} deleted=${r.deleted} pos=${r.posFixed})`,
        );
        invalidateForecastCache();
      } else {
        console.log(`[squad-reconcile] ${r.processed} teams checked, no changes`);
      }
      for (const e of r.errors) console.warn('[squad-reconcile] err:', e);
    })
    .catch((err) => {
      console.error('[squad-reconcile] failed:', err);
      // Resetear timestamp si falló — la próxima corrida puede reintentar
      // sin esperar 12h.
      lastSquadReconcileAt = 0;
    });
  return { triggered: true, lastRunAt: new Date(now).toISOString() };
}
app.use('/api/v1', apiRouter);

app.use(errorHandler);
