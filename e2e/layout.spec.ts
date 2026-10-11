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

test('a long technique chip leaves the text box usable', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+C');
  const sheet = page.locator('#sheet');
  const input = sheet.locator('[data-tags="techniques"]');
  await input.fill('Shoulder post wrist grab arm drag to the back take');
  await input.press('Enter');
  const box = await sheet.locator('[data-tags="techniques"]').boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(120);
  expect(await sheet.evaluate((x) => x.scrollWidth - x.clientWidth)).toBeLessThanOrEqual(0);
});

test('the Notebook tabs all fit on a phone', async ({ page }) => {
  await open(page);
  await page.keyboard.press('n');
  const tabs = page.locator('#notebook .tabs');
  expect(await tabs.evaluate((x) => x.scrollWidth - x.clientWidth)).toBeLessThanOrEqual(0);
  for (const name of ['Focus', 'Problems', 'Injuries', 'Reflections']) {
    const t = page.locator('#notebook').getByRole('tab', { name });
    expect(await t.evaluate((x) => x.scrollWidth - x.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test('the top bar fits on small phones, palette button included', async ({ page }) => {
  for (const width of [320, 360, 375, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await open(page);
    await expect(page.locator('#palette-open')).toBeVisible();
    const over = await page.locator('.topbar').evaluate((n) => {
      const bar = n.getBoundingClientRect();
      return Math.max(...[...n.querySelectorAll('.icon-btn')].filter((b) => (b as HTMLElement).offsetParent).map((b) => b.getBoundingClientRect().right)) - bar.right;
    });
    expect(over, `${width}px`).toBeLessThanOrEqual(0);
  }
});
