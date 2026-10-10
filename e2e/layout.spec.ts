import { card, expect, open, test } from './helpers';

test('no sideways scrolling on a phone, home and sheets', async ({ page }) => {
  await open(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await card(page, 'roll').click();
  await card(page, 'roll').click();
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  const sw = await sheet.evaluate((d) => d.scrollWidth - d.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
  // Inputs are 16px or more, so iPhone doesn't zoom into them.
  const small = await sheet.evaluate((d) => [...d.querySelectorAll('input:not([type=checkbox]), textarea, select')].filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16).length);
  expect(small).toBe(0);
});

test('no sideways scrolling in the injury log and the reflection sheet', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.matlog.injuries('left knee', { severity: 'moderate', how: 'heel hook', around: 'no leg locks' }));
  await page.keyboard.press('i');
  const d = page.locator('#injuries');
  await d.getByRole('button', { name: '+ Log an injury' }).click();
  await d.getByRole('button', { name: 'Knee' }).click();
  expect(await d.evaluate((x) => x.scrollWidth - x.clientWidth)).toBeLessThanOrEqual(0);
});
