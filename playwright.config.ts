import { defineConfig, devices } from '@playwright/test';

const PORT = 4280;
/** Production build + preview, for things only the built app has (service worker, offline). */
const PREVIEW_PORT = 4281;

/**
 * Tests log things relative to now, which can land on yesterday just after midnight. Run in a
 * fixed-offset zone where it's currently around midday, in the browser and the test process alike.
 */
const offset = ((12 - new Date().getUTCHours() + 36) % 24) - 12;
const TZ = offset === 0 ? 'Etc/UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
process.env.TZ = TZ;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}/matlog/`, trace: 'on-first-retry', timezoneId: TZ },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /pwa\.spec|layout\.spec/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /pwa\.spec|layout\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /pwa\.spec/ },
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testMatch: /layout\.spec/ },
    { name: 'pwa', testMatch: /pwa\.spec/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}/matlog/` } },
  ],
  webServer: [
    { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/matlog/`, reuseExistingServer: !process.env.CI },
    {
      command: `npx vite build --logLevel warn && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}/matlog/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
