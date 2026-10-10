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

test('icons: favicon, iOS touch icon and Android manifest icons are real PNGs', async ({ page, request }) => {
  await page.goto('./');
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const ico = await page.locator('link[rel="icon"][href$=".ico"]').getAttribute('href');
  for (const href of [touch!, ico!]) {
    const r = await request.get(new URL(href, page.url()).href);
    expect(r.ok(), href).toBe(true);
  }
  expect((await request.get(new URL(touch!, page.url()).href)).headers()['content-type']).toContain('image/png');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(manifestHref!, page.url()).href)).json();
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, new URL(manifestHref!, page.url())).href)).ok(), icon.src).toBe(true);
});
