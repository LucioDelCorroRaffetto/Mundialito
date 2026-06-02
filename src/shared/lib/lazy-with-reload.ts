import { lazy, type ComponentType } from 'react';

/**
 * Cause: after a new Vercel deploy, the user's cached index.html (often
 * held by the PWA service worker, browser cache, or just the open tab)
 * references the OLD JS chunks with hashes like `fantasy-B874jX6V.js`.
 * Those files don't exist in the new build, so Vercel's SPA rewrite
 * serves index.html with MIME type text/html. The browser refuses to
 * load HTML as a JS module and throws "Failed to fetch dynamically
 * imported module" — which previously crashed straight into the
 * ErrorBoundary's "Algo salió mal" screen.
 *
 * Fix: detect that specific error class and force a hard reload of the
 * page. The reload fetches a fresh index.html with the new chunk hashes,
 * and everything resolves. A sessionStorage flag prevents reload loops
 * if for some reason the error is not actually due to a stale deploy.
 */
const RELOAD_KEY = 'mundialito_chunk_reload_attempt';

function looksLikeStaleChunkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? '';
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w\d_-]+ failed/i.test(msg) ||
    /MIME type/i.test(msg) ||
    /not a valid JavaScript MIME type/i.test(msg)
  );
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Clear the flag on any successful load so a future stale-deploy
      // event can trigger a reload again.
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      if (looksLikeStaleChunkError(err) && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        // Hard reload — bypass the SW cache via the no-store fetch so we
        // actually pull a fresh index.html from the network.
        window.location.reload();
        // Return a never-rendered stub so React doesn't see a rejected
        // promise before the navigation happens.
        return {
          default: (() => null) as unknown as T,
        };
      }
      throw err;
    }
  });
}
