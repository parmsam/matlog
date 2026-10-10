import { card, ev, expect, MIN, open, storedEvents, test, toastEl } from './helpers';

test('round clock: start, count down, end, rest', async ({ page }) => {
  await open(page); // default: 5-minute rounds, 1-minute rest
  await page.keyboard.press('k');
  const clock = page.locator('#clock');
  await expect(clock).toBeVisible();
  await expect(clock.locator('.clock-big')).toHaveText('5:00');
  await clock.getByRole('button', { name: 'Start round' }).click();
  await expect(card(page, 'roll')).toHaveClass(/running/);
  await expect(clock.locator('.clock-label')).toContainText('Round');
  await clock.getByRole('button', { name: 'Longer rounds' }).click();
  await expect(clock).toContainText('6 min');
  await clock.getByRole('button', { name: 'End round' }).click();
  await expect(clock.locator('.clock-label')).toHaveText('Rest');
  await expect(card(page, 'roll')).not.toHaveClass(/running/);
});

test('a round with nothing running offers to start open mat; saving a round offers the next', async ({ page }) => {
  await open(page);
  await card(page, 'roll').click();
  await toastEl(page).getByRole('button', { name: 'Start open mat' }).click();
  await expect(card(page, 'open-mat')).toHaveClass(/running/);
  await card(page, 'roll').click();
  const sheet = page.locator('#sheet');
  await sheet.locator('[data-f="start"]').selectOption('side-control');
  await sheet.getByRole('button', { name: 'Bottom' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await toastEl(page).getByRole('button', { name: 'Next round' }).click();
  await expect(card(page, 'roll')).toHaveClass(/running/);
  const stored = await storedEvents(page);
  expect(stored.find((e) => e.type === 'roll' && e.endAt)?.detail).toMatchObject({ start: 'side-control', role: 'bottom' });
});

test('editing a session lists its rounds and adds one', async ({ page }) => {
  const now = Date.now();
  const s = ev('open-mat', now - 3 * 60 * MIN, { detail: { min: 90 } });
  await open(page, { events: [s, ev('roll', now - 170 * MIN, { detail: { min: 6, partner: 'Riley' } })] });
  await page.locator(`[data-entry="${s.id}"]`).click();
  const sheet = page.locator('#sheet');
  await expect(sheet.locator('.round-list')).toContainText('Riley');
  await sheet.getByRole('button', { name: '+ Add a round' }).click();
  await sheet.locator('[data-f="partner"]').fill('Jo');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.locator(`[data-entry="${s.id}"]`).click();
  await expect(sheet.locator('.round-list')).toContainText('Jo');
});

test('classes start on the hour by default, and the toast offers the exact time', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 9, 20, 10));
  await open(page, {}, './?do=log&type=class&min=60');
  const [e] = await storedEvents(page);
  expect(new Date(e.at).getHours() * 60 + new Date(e.at).getMinutes()).toBe(19 * 60);
  const exact = toastEl(page).getByRole('button', { name: /^Use / });
  await expect(exact).toBeVisible();
  await exact.click();
  await expect.poll(async () => new Date((await storedEvents(page))[0].at).getMinutes()).toBe(10);
});

test('your own technique: add it, it joins the graph and the ladder', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.matlog.log('roll', { landed: 'Kiss of the dragon', belt: 'white', size: 'bigger' }));
  await page.keyboard.press('t');
  const d = page.locator('#tech');
  await expect(d.locator('tr', { hasText: 'Kiss of the dragon' })).toContainText('your own');
  await d.getByRole('button', { name: 'Kiss of the dragon' }).click();
  await d.getByRole('button', { name: 'Add type and positions' }).click();
  await d.getByRole('button', { name: 'Transition' }).click();
  await d.locator('[data-from]').selectOption('open-guard');
  await d.locator('[data-to]').selectOption('back');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toContainText('Open guard → Back');
  await expect(d.locator('table.ladder')).toContainText('1/1');
  await d.getByRole('button', { name: '‹ All techniques' }).click();
  await expect(d.locator('.graph-edge')).toHaveCount(1);
  // It's in the log, so it backs up.
  expect((await storedEvents(page)).some((e) => e.type === 'technique')).toBe(true);
});

test('Study is hidden by default and can be turned on; hidden buttons still work by key', async ({ page }) => {
  await open(page);
  await expect(card(page, 'study')).toBeHidden();
  await page.keyboard.press('s');
  await expect(card(page, 'study')).toBeVisible(); // running, so it shows
  await page.keyboard.press('s');
  await page.keyboard.press(',');
  await page.locator('#settings [data-card-toggle="comp"]').uncheck();
  await page.locator('#settings [data-card-toggle="study"]').check();
  await page.keyboard.press('Escape');
  await expect(card(page, 'comp')).toBeHidden();
  await expect(card(page, 'study')).toBeVisible();
  expect(await page.evaluate(() => window.matlog.state().matHours)).toBe(0);
});

test('tap the buddy for a line', async ({ page }) => {
  await open(page);
  await page.locator('#companion').click();
  await expect(page.locator('#buddy-says')).toBeVisible();
  const first = await page.locator('#buddy-says').textContent();
  await page.locator('#companion').click();
  await expect(page.locator('#buddy-says')).not.toHaveText(first!);
});
