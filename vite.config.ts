import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
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
