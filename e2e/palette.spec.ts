import { card, ev, expect, MIN, open, storedEvents, test } from './helpers';

const palette = (page: import('@playwright/test').Page) => page.locator('#palette');

test('Ctrl+K opens the palette; typing filters and Enter runs the top match', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.type('start class');
  await expect(palette(page).getByRole('option').first()).toHaveText(/Start class/);
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
  await expect(card(page, 'class')).toHaveClass(/running/);
  expect((await storedEvents(page)).map((e) => e.type)).toEqual(['class']);

  // Now it reads Stop.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('class');
  await expect(palette(page).getByRole('option', { name: /Stop class/ })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: /Log a finished class/ })).toHaveCount(0);
});

test('arrows move the selection, a click runs, Escape and Ctrl+K close', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('notebook');
  const opts = palette(page).getByRole('option');
  await expect(opts.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(opts.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(opts.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();

  await page.keyboard.press('Control+k');
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeHidden();

  await page.keyboard.press('Control+k');
  await page.keyboard.type('progress');
  await palette(page).getByRole('option', { name: /^Progress/ }).click();
  await expect(page.locator('#progress')).toBeVisible();
  // Not over another sheet: it would lose what you were doing there.
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeHidden();
});

test('finds techniques by loose letters and opens them in the library', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+k');
  await expect(palette(page).getByRole('option', { name: /Technique:/ })).toHaveCount(0);
  await page.keyboard.type('kcp');
  await expect(palette(page).getByRole('option', { name: 'Technique: Knee cut pass' })).toBeVisible();
  await palette(page).getByRole('option', { name: 'Technique: Knee cut pass' }).click();
  await expect(page.locator('#tech')).toBeVisible();
  await expect(page.locator('#tech')).toContainText('Knee cut pass');
});

test('nothing matching says so, and Enter does nothing', async ({ page }) => {
  await open(page, { events: [ev('class', Date.now() - 90 * MIN, { endAt: Date.now() - 30 * MIN })] });
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zzzzqqq');
  await expect(palette(page)).toContainText('Nothing matches');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeVisible();
});

test('the palette button opens it too', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'keyboard-only buttons are hidden on touch screens');
  await open(page);
  await page.locator('#palette-open').click();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
});

test('a belt swatch has room for all four stripes', async ({ page }) => {
  await open(page, { settings: { startBelt: 'blue', startStripes: 4 } });
  const sw = page.locator('.belt-swatch').first();
  const { stripes, width } = await sw.evaluate((el) => {
    const after = getComputedStyle(el, '::after');
    return { stripes: parseFloat(after.backgroundSize), width: parseFloat(after.width) };
  });
  // Each stripe's pattern repeats every 3px; anything less cuts the last one off.
  expect(stripes).toBe(12);
  expect(stripes + 1).toBeLessThanOrEqual(width);
});
