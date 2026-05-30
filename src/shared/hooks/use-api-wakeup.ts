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

type WakeupState = 'idle' | 'waking' | 'ready';

/**
 * Pings the API health endpoint and tracks whether the server is cold-
 * starting. Returns the current wakeup state so the UI can show a friendly
 * loading screen instead of an empty / broken-looking page.
 *
 * `idle`   — fast response (< 2 s), or first request still in flight
 * `waking` — first request took > 2 s, showing loading screen
 * `ready`  — server responded, loading screen can be dismissed
 */
export function useApiWakeup(): WakeupState {
  const [state, setState] = useState<WakeupState>('idle');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

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
      timer = setTimeout(() => {
        if (!cancelled) setState('waking');
      }, SHOW_AFTER_MS);

      const ok = await ping();

      if (timer) clearTimeout(timer);

      if (cancelled) return;

      if (ok) {
        setState('ready');
        return;
      }

      // Server didn't respond — keep showing the screen and retry.
      setState('waking');

      const retry = async () => {
        if (cancelled) return;
        const ok = await ping();
        if (!cancelled && ok) {
          setState('ready');
        } else if (!cancelled) {
          retryTimer = setTimeout(retry, RETRY_INTERVAL_MS);
        }
      };
      retryTimer = setTimeout(retry, RETRY_INTERVAL_MS);
    }

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return state;
}
