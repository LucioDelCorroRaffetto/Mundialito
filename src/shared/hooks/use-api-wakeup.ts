import { useState, useEffect, useRef } from 'react';

const HEALTH_URL =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1').replace('/api/v1', '') +
  '/health';

// How long to wait before concluding the server is "waking up" and showing
// the loading screen. Set conservatively: 2 s feels laggy on a warm server,
// but a cold Render start takes 10-30 s so we definitely want the screen.
const SHOW_AFTER_MS = 2_000;

// How often to retry while showing the loading screen.
const RETRY_INTERVAL_MS = 3_000;

// Hard cap on retries — after this many failed pings we give up and let the
// app render anyway. Protects users whose ad-blocker filters `/health`
// (Render endpoints occasionally match generic ad-blocker rules) from
// seeing the "Calentando motores" screen forever. The real API calls go
// through a different path (axios + /api/v1) and aren't affected by the
// same filters, so the app itself still works.
const MAX_RETRIES = 7;

// Absolute fallback: if we've been in the "waking" state for this long,
// dismiss regardless. Belt-and-suspenders to MAX_RETRIES.
const HARD_TIMEOUT_MS = 30_000;

type WakeupState = 'idle' | 'waking' | 'ready';

/**
 * Pings the API health endpoint and tracks whether the server is cold-
 * starting. Returns the current wakeup state so the UI can show a friendly
 * loading screen instead of an empty / broken-looking page.
 *
 * `idle`   — fast response (< 2 s), or first request still in flight
 * `waking` — first request took > 2 s, showing loading screen
 * `ready`  — server responded OR we gave up retrying
 *
 * The "gave up" path matters because Render's `/health` endpoint sometimes
 * gets caught by privacy/ad-block filters (anything matching `/health` can
 * be considered a tracking ping by aggressive rules). When that happens
 * the fetch returns `ERR_BLOCKED_BY_CLIENT` — indistinguishable from a
 * timeout from JS's perspective. Without a retry cap the loading screen
 * would loop forever on those browsers even though the real app works.
 */
export function useApiWakeup(): WakeupState {
  const [state, setState] = useState<WakeupState>('idle');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    async function ping(): Promise<boolean> {
      try {
        const res = await fetch(HEALTH_URL, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(25_000),
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    async function run() {
      // Start the "show loading screen" timer before the first ping so we
      // don't show it at all if the server is already awake.
      showTimer = setTimeout(() => {
        if (!cancelled) setState('waking');
      }, SHOW_AFTER_MS);

      // Hard timeout fires only after we go into "waking" — if the first
      // ping returned fast, the timer below never executes anyway.
      hardTimer = setTimeout(() => {
        if (!cancelled) setState('ready');
      }, SHOW_AFTER_MS + HARD_TIMEOUT_MS);

      const ok = await ping();

      if (showTimer) clearTimeout(showTimer);
      if (cancelled) return;

      if (ok) {
        if (hardTimer) clearTimeout(hardTimer);
        setState('ready');
        return;
      }

      // Server didn't respond — keep showing the screen and retry up to
      // MAX_RETRIES times.
      setState('waking');

      const retry = async () => {
        if (cancelled) return;
        retries++;
        const ok = await ping();
        if (cancelled) return;
        if (ok) {
          if (hardTimer) clearTimeout(hardTimer);
          setState('ready');
          return;
        }
        if (retries >= MAX_RETRIES) {
          // Give up — likely an ad-blocker is blocking /health. The real
          // app will load and its own queries will surface real errors if
          // the API is actually down.
          if (hardTimer) clearTimeout(hardTimer);
          setState('ready');
          return;
        }
        retryTimer = setTimeout(retry, RETRY_INTERVAL_MS);
      };
      retryTimer = setTimeout(retry, RETRY_INTERVAL_MS);
    }

    run();

    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };
  }, []);

  return state;
}
