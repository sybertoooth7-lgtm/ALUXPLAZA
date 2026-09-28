import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    // Only generate source maps when they'll actually be uploaded and
    // then deleted (see the conditional Sentry plugin below) — without
    // SENTRY_AUTH_TOKEN, generating maps at all would mean they ship
    // to production and sit on the public CDN, since nothing would be
    // there to delete them afterward.
    sourcemap: Boolean(process.env.SENTRY_AUTH_TOKEN),
    rollupOptions: {
      output: {
        // Split the large, rarely-changing libraries out of the app chunk.
        // Route-level lazy() in App.tsx already stopped every visitor from
        // downloading all 31 pages, but react-dom, the Sentry SDK and gsap
        // still landed in one chunk that the build flagged as >500 kB. These
        // change far less often than app code, so a separate chunk also means
        // returning visitors re-download app code without re-downloading them.
        //
        // Order matters: manual chunks run before Rollup's own splitting, and
        // the first matching entry wins. Sentry goes before react-dom because
        // the Sentry SDK imports React itself, and putting react-dom first
        // would leave Sentry's copy of React outside the react chunk.
        manualChunks: {
          sentry: ['@sentry/react'],
          gsap: ['gsap'],
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Alux Plaza | Cybersecurity Consulting',
        short_name: 'Alux Plaza',
        description:
          'Cybersecurity consulting: incident response planning, vulnerability assessments, and compliance readiness (PCI DSS, Kenya DPA 2019) for Nairobi and East Africa.',
        theme_color: '#00d4ff',
        background_color: '#050a12',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // This app is a live dashboard (client compliance status, admin
        // panels, contact form) — none of that should ever be served
        // stale from a cache. Only precache the app shell (JS/CSS/HTML)
        // for fast loads and installability; every /api/* call bypasses
        // the service worker entirely via navigateFallbackDenylist so
        // login, status checks, and form submissions always hit the
        // real network and get real, current data.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Match by path, not hostname — API_BASE is cross-origin in
            // production (Render) but same-origin via the dev proxy, and
            // this should bypass the service worker either way rather
            // than being pinned to one specific backend host.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    // Only active when SENTRY_AUTH_TOKEN is set (CI, via the
    // SENTRY_AUTH_TOKEN secret — see .github/workflows/frontend-ci.yml).
    // A local `npm run build` without that token just skips this
    // entirely rather than failing, since sentryVitePlugin() itself
    // errors out on a missing token if invoked unconditionally.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
          }),
        ]
      : []),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
