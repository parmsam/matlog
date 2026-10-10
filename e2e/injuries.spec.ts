import { card, ev, expect, MIN, open, storedEvents, test } from './helpers';

test('injury log: log, update, heal; the home line and the buddy follow', async ({ page }) => {
  await open(page);
  await expect(page.locator('#injury-line')).toBeHidden();
  await page.keyboard.press('i');
  const d = page.locator('#injuries');
  await d.getByRole('button', { name: '+ Log an injury' }).click();
  await d.getByRole('button', { name: 'Knee' }).click();
  await d.getByRole('button', { name: 'Left' }).click();
  await d.getByRole('button', { name: 'Moderate' }).click();
  await d.locator('[data-how]').fill('heel hook at open mat');
  await d.locator('[data-around]').fill('no leg locks');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.locator('.injury')).toContainText('Left knee');
  await expect(d.locator('.injury')).toContainText('Training around it: no leg locks');
  await d.getByRole('button', { name: '+ Update' }).click();
  await d.locator('[data-update-text]').fill('less swelling');
  await d.locator('[data-update-text]').press('Enter');
  await expect(d.locator('.injury .updates')).toContainText('less swelling');
  await page.keyboard.press('Escape');
  await expect(page.locator('#injury-line')).toHaveText('🩹 Left knee · 0 days');
  await expect(page.locator('#companion .bandage')).toHaveCount(1);

  await page.locator('#injury-line').click();
  await d.getByRole('button', { name: 'Healed' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#injury-line')).toBeHidden();
  await expect(page.locator('#companion .bandage')).toHaveCount(0);
  const [inj] = (await storedEvents(page)).filter((e) => e.type === 'injury');
  expect(inj.detail?.injury).toMatchObject({ area: 'knee', side: 'left', severity: 'moderate', how: 'heel hook at open mat', around: 'no leg locks', updates: [{ text: 'less swelling' }] });
  expect(inj.detail?.injury?.healedAt).toBeTruthy();
});

test('Got hurt? from a round prefills it and links the round', async ({ page }) => {
  const now = Date.now();
  const s = ev('open-mat', now - 90 * MIN, { detail: { min: 60 } });
  const r = ev('roll', now - 80 * MIN, { detail: { min: 5, partner: 'Riley' } });
  await open(page, { events: [s, r] });
  await page.locator(`[data-entry="${r.id}"]`).click();
  await page.locator('#sheet').getByRole('button', { name: '🩹 Got hurt?' }).click();
  const d = page.locator('#injuries');
  await expect(d.locator('[data-how]')).toHaveValue('rolling with Riley');
  await d.getByRole('button', { name: 'Hand / fingers' }).click();
  await d.getByRole('button', { name: 'Save' }).click();
  const inj = (await storedEvents(page)).find((e) => e.type === 'injury')!;
  expect(inj.detail?.injury).toMatchObject({ area: 'fingers', sessionId: s.id, rollId: r.id });
  // Closing the injury log goes back to the round's sheet underneath.
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeVisible();
});

test('injuries in Progress and the API', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.matlog.injuries('right shoulder', { severity: 'minor', how: 'kimura', daysAgo: 3 }));
  await page.evaluate(() => window.matlog.log('class', { min: 60 }));
  const list = await page.evaluate(() => window.matlog.injuries());
  expect(list.active[0]).toMatchObject({ what: 'Right shoulder', severity: 'minor', days: 3 });
  await page.keyboard.press('g');
  const p = page.locator('#progress');
  await expect(p).toContainText('Injuries');
  await expect(p).toContainText('sessions trained around one');
  await expect(p).toContainText('Shoulder');
  await page.evaluate((id) => window.matlog.heal(id), list.active[0].id);
  expect((await page.evaluate(() => window.matlog.injuries())).healed).toHaveLength(1);
  await expect(card(page, 'class')).toBeVisible();
});
