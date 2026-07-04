import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (no 'autoUpdate'): cuando hay una versión nueva NO recargamos
      // sola la página — mostramos un toast "Actualizar" (ver use-pwa-update.ts)
      // y el usuario decide cuándo. Clave porque el ruteo es client-side: la PWA
      // puede quedar abierta días sin re-pedir index.html, así que sin este
      // aviso el usuario se queda con chunks viejos (bug de octavos bloqueados).
      // Además evita que una recarga automática le borre un marcador a medio
      // tipear.
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable.png',
        'screenshot-home.png',
        'sc-leagues.png',
      ],
      manifest: {
        // Stable id so newer Chrome / Edge keep the install across
        // scope changes (avoids "another version is already installed").
        id: '/',
        name: 'Mundialito · Prode + Fantasy del Mundial',
        short_name: 'Mundialito',
        description: 'El prode + fantasy del Mundial entre amigos',
        theme_color: '#0a0e1a',
        background_color: '#0a0e1a',
        display: 'standalone',
        // display_override prefers window-controls-overlay on desktop but
        // falls back to standalone on Android/iOS (where wco is ignored).
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/?source=pwa',
        lang: 'es-AR',
        dir: 'ltr',
        icons: [
          // Both purposes on the SAME 512 file so Android picks one without
          // a separate file. iOS uses apple-touch-icon.png (180×180).
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['sports', 'games', 'entertainment'],
        // Screenshots improve the install dialog on Android Chrome (since
        // Chrome 92). Two ratios so the prompt has both phone + wide samples.
        screenshots: [
          {
            src: '/screenshot-home.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Pantalla principal con el countdown del Mundial',
          },
          {
            src: '/sc-leagues.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Tus ligas y la tabla de posiciones',
          },
        ],
      },
      workbox: {
        // Precache hashed assets but NOT index.html — it must always come
        // from the network so users pick up new chunk hashes as soon as a
        // deploy lands. Without this exclusion, the SW kept serving a
        // stale HTML that referenced JS chunks deleted by the new build,
        // producing the "Failed to fetch dynamically imported module"
        // crash.
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
        globIgnores: ['**/index.html'],
        navigateFallback: null,
        // skipWaiting FALSE a propósito: con registerType 'prompt' el SW nuevo
        // debe quedarse en "waiting" hasta que el usuario toque "Actualizar" en
        // el toast (updateServiceWorker(true) dispara el skip waiting + reload).
        // Si lo dejáramos en true, el SW se activaría solo y perderíamos el
        // control del momento de recarga. clientsClaim sigue en true para que,
        // una vez activado, tome el control de la pestaña sin pasos extra.
        skipWaiting: false,
        clientsClaim: true,
        // Don't serve precached responses for navigations — let the
        // network return the latest index.html every time.
        cleanupOutdatedCaches: true,
        importScripts: ['/sw-custom.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-webfonts', expiration: { maxEntries: 30 } },
          },
          {
            urlPattern: /^https:\/\/mundialito-d2jk\.onrender\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Split heavy vendor libs into their own long-cacheable chunks so an
    // update to app code doesn't bust the framer/charts cache, and so the
    // main chunk stays trim. Anything not listed here stays in the small
    // 'vendor' chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          framer: ['framer-motion'],
          query: ['@tanstack/react-query', 'axios'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
    // Allow Google Sign-In popup to postMessage back (mirrors vercel.json headers)
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
});
