import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const BRAND_INK = '#1C1A3D';

/**
 * Opens the connection to the API while the app downloads, so the first call (restoring the
 * session, which sends the cookie) does not wait for DNS and TLS.
 */
function preconnectToApi(apiUrl: string): Plugin {
  return {
    name: 'preconnect-to-api',
    transformIndexHtml: () => [
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: new URL(apiUrl).origin, crossorigin: 'use-credentials' },
        injectTo: 'head',
      },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preconnectToApi(
      loadEnv(mode, process.cwd(), 'VITE_')['VITE_API_URL'] ?? 'http://localhost:3000',
    ),
    VitePWA({
      // The app asks before switching to a new version, so nobody loses a half-filled form.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'Raising Talents',
        short_name: 'Raising Talents',
        description:
          'Show your best work to the agents and scouts who find athletes, musicians, models, actors and creators.',
        lang: 'en-NG',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: BRAND_INK,
        categories: ['entertainment', 'social', 'sports'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Latin and Latin Extended cover English and Nigerian names (ẹ, ọ, ṣ). The rest load only if used.
        // hls.js is only for browsers without native HLS, and only once a video plays.
        // The error tracker loads only in builds that report errors, so it is not precached.
        globIgnores: ['**/*vietnamese*', '**/hls-*.js', '**/sentry-client-*.js'],
        navigateFallback: '/index.html',
        // API calls are personal and must never come from a cache.
        navigateFallbackDenylist: [/^\/v1\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/hls-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'video-player', expiration: { maxEntries: 2 } },
          },
          {
            // Ready images never change at a given address, so the cache can serve them first.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/media/') && url.pathname.endsWith('.webp'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    // Every import of zod, the API contracts' included, goes through this module first.
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      {
        find: /^zod$/,
        replacement: fileURLToPath(new URL('./src/zod-for-browser.ts', import.meta.url)),
      },
    ],
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
}));
