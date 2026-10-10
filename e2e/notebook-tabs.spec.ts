import { ev, expect, MIN, open, test } from './helpers';

test('the Notebook: tabs, the last tab remembered, reflections listed', async ({ page }) => {
  const s = ev('open-mat', Date.now() - 5 * 60 * MIN, { detail: { min: 60 } });
  await open(page, { events: [s] });
  await page.locator('#notebook-open').click();
  const nb = page.locator('#notebook');
  await expect(nb.getByRole('tab', { name: 'Focus' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#focus-sheet')).toBeVisible();
  await nb.getByRole('tab', { name: 'Reflections' }).click();
  await expect(page.locator('#reflections')).toBeVisible();
  await expect(page.locator('#focus-sheet')).toBeHidden();
  await expect(page.locator('#reflections')).toContainText('Not reflected on yet');
  await page.locator('#reflections').getByRole('button', { name: 'Reflect' }).click();
  const r = page.locator('#reflect');
  await r.locator('[data-problem]').fill('lost frames in half guard');
  await r.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#reflections')).toContainText('Problem: lost frames in half guard');
  await expect(page.locator('#reflections')).toContainText('You’re all caught up');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await expect(nb.getByRole('tab', { name: 'Reflections' })).toHaveAttribute('aria-selected', 'true');
  await nb.getByRole('tab', { name: 'Problems' }).click();
  await expect(page.locator('#problems')).toContainText('lost frames in half guard');
});

test('keys and the home card open the right tab; paste moved next to Add past session', async ({ page }) => {
  await open(page);
  await page.keyboard.press('i');
  await expect(page.locator('#notebook').getByRole('tab', { name: 'Injuries' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await page.locator('#focus').click();
  await expect(page.locator('#notebook').getByRole('tab', { name: 'Focus' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await page.locator('#paste-open').click();
  await expect(page.locator('#paste')).toBeVisible();
});
