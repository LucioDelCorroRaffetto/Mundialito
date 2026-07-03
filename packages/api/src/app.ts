import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { tokenParse } from './middleware/token-parse.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.js';
import { apiRouter } from './routes/index.js';
import { syncScores } from './services/sync-scores.js';
import { syncScoresFromEspn } from './services/sync-espn.js';
import { syncLiveMatches } from './services/sync-live.js';
import { reconcileMatchStatuses } from './services/reconcile-matches.js';
import { syncFixtureTimes } from './services/fixture-time-sync.js';
import { reconcileSquadsFromWikipedia } from './services/squad-reconcile.js';
import { invalidateForecastCache } from './services/forecast-service.js';
import { libsqlClient } from './db/client.js';
import { db } from './db/index.js';
import { matches } from './db/schema/index.js';
import { computeSyncDateFrom } from './lib/sync-window.js';

export const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5174', 'http://localhost:5173'];

console.log('[CORS] Allowed origins:', ALLOWED_ORIGINS);

// gzip/deflate de las respuestas. Toda la API es JSON (matches, leaderboard,
// fantasy, forecast), que comprime ~70-90%. Reduce el bucket "HTTP Responses"
// del bandwidth de Render. El costo de CPU a esta escala es ruido y el browser
// descomprime nativo — no hay cambios en el frontend.
app.use(compression());

// CSP no aplica acá — es una API JSON, no sirve HTML. Va en el frontend
// (vercel.json). El resto de los headers de helmet (nosniff, etc.) sí aplican.
app.use(helmet({ contentSecurityPolicy: false }));

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
// 600kb so a base64 avatar (handler caps it at ~400k chars in update-me)
// fits comfortably. The default 100kb silently 413s detailed phone photos
// before they ever reach the handler.
app.use(express.json({ limit: '600kb' }));
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
let syncInProgress = false;

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

  // cron-job.org llama cada 3min, pero un tick lento (feeds caídos, Wikipedia
  // lenta) puede seguir corriendo cuando llega el próximo — dos syncs en
  // paralelo duplican requests a football-data (10/min) y pueden pisarse
  // entre sí en updates no atómicos. Un solo flag in-memory alcanza (single
  // instance, igual que rate-limit.ts).
  if (syncInProgress) {
    return res.status(429).json({ error: 'sync already running' });
  }
  syncInProgress = true;

  try {
    return await runSync(req, res);
  } finally {
    syncInProgress = false;
  }
});

async function runSync(req: express.Request, res: express.Response) {
  const today = new Date().toISOString().slice(0, 10);
  // Ventana del feed adaptativa: normalmente "ayer" (matches que arrancaron
  // cerca de medianoche UTC y terminaron pasadas las 00:00), pero si hay algún
  // partido NO finalizado con kickoff ya pasado ("colgado"), retrocede hasta su
  // fecha para que el feed lo traiga (FINISHED + score) y la lógica de sync lo
  // cierre sola. Sin esto, un colgado que pasó las ~48h de la ventana fija (cron
  // caído >2 días, o feed que no lo matcheó un rato) quedaba en scheduled/live
  // para siempre. football-data acepta el rango en una sola request.
  const matchWindowRows = await db
    .select({ status: matches.status, kickoffUtc: matches.kickoffUtc })
    .from(matches)
    .catch((err) => {
      console.error('[sync] no se pudieron leer matches para la ventana adaptativa:', err);
      return [] as { status: string; kickoffUtc: string }[];
    });
  const feedDateFrom = computeSyncDateFrom(matchWindowRows, new Date());
  // Lista de días UTC [feedDateFrom .. today] inclusive, para el fallback ESPN
  // (que consulta por día). En estado normal son 2 días (ayer+hoy); sólo se
  // ensancha cuando hay un colgado y football-data no está disponible.
  const espnDays: string[] = [];
  for (
    let t = new Date(`${feedDateFrom}T00:00:00Z`).getTime();
    t <= new Date(`${today}T00:00:00Z`).getTime();
    t += 86_400_000
  ) {
    espnDays.push(new Date(t).toISOString().slice(0, 10));
  }

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
  // feedDateFrom es "ayer" en estado normal, o más atrás si hay un colgado —
  // football-data acepta el rango entero en una sola request.
  let result = await syncScores({ dateFrom: feedDateFrom, dateTo: today }).catch((err) => ({
    synced: 0, errors: [String(err)], matchesChecked: 0,
  }));

  if (result.errors.length > 0 || !process.env.FOOTBALL_DATA_API_KEY) {
    // Run ESPN per day across the window; merge results. (ESPN consulta por día.)
    const espnResults = await Promise.all(
      espnDays.map((d) =>
        syncScoresFromEspn(d).catch((err) => ({ synced: 0, errors: [`${d}: ${String(err)}`], matchesChecked: 0 })),
      ),
    );
    result = {
      synced: result.synced + espnResults.reduce((s, r) => s + r.synced, 0),
      errors: [
        ...result.errors.map((e) => `[fd] ${e}`),
        ...espnResults.flatMap((r) => r.errors.map((e) => `[espn] ${e}`)),
      ],
      matchesChecked: Math.max(result.matchesChecked, ...espnResults.map((r) => r.matchesChecked)),
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
}

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
// 300/min por IP no molesta a un usuario real (polling más agresivo es 45s en
// match-detail) pero acota scraping/abuso; login/register/refresh ya tienen
// su propio límite más estricto (middleware/rate-limit.ts, 10/5min).
app.use('/api/v1', rateLimit({ windowMs: 60_000, max: 300, routeKey: 'api-general' }));
app.use('/api/v1', apiRouter);

app.use(errorHandler);
