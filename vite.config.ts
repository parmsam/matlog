import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: '/matlog/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    VitePWA({
      // Ask before updating: silently reloading could interrupt a round timer mid-entry.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'llms.txt'],
      manifest: {
        name: 'matlog · BJJ training journal',
        short_name: 'matlog',
        description: 'One-tap BJJ training journal: classes, open mats, rolls, techniques. All data stays on your phone.',
        theme_color: '#14161c',
        background_color: '#14161c',
        display: 'standalone',
        start_url: '/matlog/',
        scope: '/matlog/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        // Long-press the installed app icon (Android, desktop). These use the ?do= link actions.
        shortcuts: [
          { name: 'Start or stop class', short_name: 'Class', url: '/matlog/?do=toggle&type=class' },
          { name: 'Log a 60 minute open mat', short_name: 'Open mat', url: '/matlog/?do=log&type=open-mat&min=60' },
          { name: 'Start or stop a round', short_name: 'Round', url: '/matlog/?do=toggle&type=roll' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,txt,webmanifest}'],
        navigateFallbackDenylist: [/^[^?#]*\/[^/?#]+\.[^/?#]+$/],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-css' } },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // A zone with DST so week logic is tested across clock changes (CI runs in UTC).
    env: { TZ: 'America/New_York' },
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
});
