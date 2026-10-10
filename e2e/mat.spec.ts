import { card, ev, expect, MIN, open, storedEvents, test, toastEl, unfold } from './helpers';

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
  await unfold(page, 'positions');
  await sheet.locator('[data-f="start"]').selectOption('side-control');
  await sheet.getByRole('button', { name: 'Bottom' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await toastEl(page).getByRole('button', { name: 'Next round' }).click();
  await expect(card(page, 'roll')).toHaveClass(/running/);
  const stored = await storedEvents(page);
  expect(stored.find((e) => e.type === 'roll' && e.endAt)?.detail).toMatchObject({ start: 'side-control', role: 'bottom' });
});

test('a situational round: goal, a count each way, and how it went', async ({ page }) => {
  const now = Date.now();
  const r = ev('roll', now - 10 * MIN, { detail: { min: 5, partner: 'Riley' } });
  await open(page, { events: [ev('open-mat', now - 30 * MIN, { detail: { min: 60 } }), r] });
  await page.locator(`[data-entry="${r.id}"]`).click();
  const sheet = page.locator('#sheet');
  await unfold(page, 'positions');
  await sheet.locator('[data-f="start"]').selectOption('mount');
  await sheet.getByRole('button', { name: 'Bottom' }).click();
  await sheet.locator('[data-f="goal"]').fill('escape or sweep');
  const mine = sheet.getByRole('group', { name: 'You got yours' });
  const theirs = sheet.getByRole('group', { name: 'They got theirs' });
  await expect(mine.getByRole('button', { name: 'One fewer' })).toBeDisabled();
  await mine.getByRole('button', { name: 'One more' }).click();
  await page.keyboard.press('Space'); // focus stays on +, so it keeps counting
  await theirs.getByRole('button', { name: 'One more' }).click();
  await theirs.getByRole('button', { name: 'One more' }).click();
  await theirs.getByRole('button', { name: 'One fewer' }).click();
  await expect(mine.locator('output')).toHaveText('2');
  await expect(theirs.locator('output')).toHaveText('1');
  await sheet.locator('[data-f="goalNote"]').fill('  framed early, got out twice  ');
  await sheet.getByRole('button', { name: 'Save' }).click();
  const stored = (await storedEvents(page)).find((e) => e.id === r.id)!;
  expect(stored.detail).toMatchObject({ start: 'mount', role: 'bottom', goal: 'escape or sweep', goalsFor: 2, goalsAgainst: 1, goalNote: 'framed early, got out twice' });
});

test('editing a session lists its rounds and adds one', async ({ page }) => {
  const now = Date.now();
  const s = ev('open-mat', now - 3 * 60 * MIN, { detail: { min: 90 } });
  await open(page, { events: [s, ev('roll', now - 170 * MIN, { detail: { min: 6, partner: 'Riley' } })] });
  await page.locator(`[data-entry="${s.id}"]`).click();
  const sheet = page.locator('#sheet');
  await unfold(page, 'rounds');
  await expect(sheet.locator('.round-list')).toContainText('Riley');
  await sheet.getByRole('button', { name: '+ Add a round' }).click();
  await sheet.locator('[data-f="partner"]').fill('Jo');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.locator(`[data-entry="${s.id}"]`).click();
  await unfold(page, 'rounds');
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

test('cards can log past sessions only: a tap opens a finished entry, a running one still stops', async ({ page }) => {
  const now = Date.now();
  const running = ev('roll', now - 2 * MIN);
  await open(page, { settings: { cardsLogPast: true }, events: [running] });
  await expect(card(page, 'open-mat')).toContainText('tap to log');
  await card(page, 'open-mat').click();
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-f="running"]')).not.toBeChecked();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'open-mat')).not.toHaveClass(/running/);
  const stored = await storedEvents(page);
  expect(stored.find((e) => e.type === 'open-mat')?.endAt).toBeDefined();
  // The round that was already running stops (and opens its sheet), as usual.
  await card(page, 'roll').click();
  await expect(card(page, 'roll')).not.toHaveClass(/running/);
});

test('the next round in a session carries the situation over', async ({ page }) => {
  const now = Date.now();
  const s = ev('open-mat', now - 20 * MIN);
  const r = ev('roll', now - 10 * MIN, { endAt: now - 5 * MIN, detail: { sessionId: s.id, start: 'side-control', role: 'bottom', goal: 'escape or sweep', goalsFor: 2, goalNote: 'framed' } });
  await open(page, { events: [s, r] });
  await card(page, 'roll').click();
  await expect(toastEl(page)).toContainText('Side control bottom, escape or sweep');
  await card(page, 'roll').click(); // stop: the sheet opens on the situation
  const sheet = page.locator('#sheet');
  await expect(sheet.locator('[data-section="positions"]')).toHaveAttribute('open', '');
  await expect(sheet.locator('[data-f="goal"]')).toHaveValue('escape or sweep');
  await expect(sheet.getByRole('group', { name: 'You got yours' }).locator('output')).toHaveText('0');
  await expect(sheet.locator('[data-f="goalNote"]')).toHaveValue('');
  await sheet.getByRole('button', { name: 'Save' }).click();
  const next = (await storedEvents(page)).filter((e) => e.type === 'roll' && e.id !== r.id)[0];
  expect(next.detail).toMatchObject({ sessionId: s.id, start: 'side-control', role: 'bottom', goal: 'escape or sweep' });
  expect(next.detail?.goalsFor).toBeUndefined();
});

test('reflection notification: asks permission, then notifies once while you are elsewhere', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'permission granting differs by browser');
  await context.grantPermissions(['notifications']);
  await page.addInitScript(() => {
    const shown: string[] = [];
    (window as unknown as { shown: string[] }).shown = shown;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      onclick: (() => void) | null = null;
      constructor(title: string, o: { body: string }) {
        shown.push(`${title} ${o.body}`);
      }
      close() {}
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
  });
  const now = Date.now();
  await open(page, { settings: { reflectAfter: 0 }, events: [ev('class', now - 90 * MIN, { endAt: now - 30 * MIN })] });
  await page.locator('#settings-open').click();
  await page.locator('[data-reflect-notify]').check();
  await page.keyboard.press('Escape');
  // Pretend the window lost focus, then check twice: one notification.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', { value: () => false });
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
  });
  expect(await page.evaluate(() => (window as unknown as { shown: string[] }).shown)).toEqual(['How did it go? Reflect on class: five minutes in the notebook.']);
});
