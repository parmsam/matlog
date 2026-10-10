import { expect, test } from '@playwright/test';

test('the built app registers a service worker and works offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('html[data-ready]')).toBeAttached();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-card="class"]')).toBeVisible();
  const llms = await page.evaluate(() => fetch('./llms.txt').then((r) => r.text()));
  expect(llms).toContain('window.matlog');
});
