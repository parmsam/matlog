import { card, ev, expect, MIN, open, storedEvents, test, toastEl, unfold } from './helpers';

test('tap starts a class, the timer survives a reload, tap stops it', async ({ page }) => {
  await open(page);
  await card(page, 'class').click();
  await expect(card(page, 'class')).toHaveClass(/running/);
  await expect(toastEl(page)).toContainText('Class started');
  await expect.poll(async () => (await storedEvents(page)).length).toBe(1);
  await page.reload();
  await expect(card(page, 'class')).toHaveClass(/running/);
  await card(page, 'class').click();
  await expect(card(page, 'class')).not.toHaveClass(/running/);
  await expect.poll(async () => (await storedEvents(page))[0]?.endAt).toBeDefined();
});

test('Undo and the −15m chip', async ({ page }) => {
  await open(page);
  await card(page, 'open-mat').click();
  const before = (await page.evaluate(() => window.matlog.entries(1)))[0].start;
  await toastEl(page).getByRole('button', { name: '−15m' }).click();
  const after = (await page.evaluate(() => window.matlog.entries(1)))[0].start;
  expect(new Date(before).getTime() - new Date(after).getTime()).toBe(15 * MIN);
  await toastEl(page).getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, 'open-mat')).not.toHaveClass(/running/);
  expect(await page.evaluate(() => window.matlog.entries(1))).toEqual([]);
});

test('starting open mat while class runs switches it', async ({ page }) => {
  await open(page);
  await card(page, 'class').click();
  await card(page, 'open-mat').click();
  await expect(toastEl(page)).toContainText('Now counting as open mat');
  await expect(card(page, 'open-mat')).toHaveClass(/running/);
  await expect(card(page, 'class')).not.toHaveClass(/running/);
});

test('hold a card to log a finished session with techniques', async ({ page }) => {
  await open(page);
  const box = (await card(page, 'drilling').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'No-gi' }).click();
  const tags = sheet.locator('[data-tags="techniques"]');
  await tags.fill('knee slice');
  await tags.press('Enter');
  await tags.fill('My weird sweep');
  await tags.press('Enter');
  await sheet.locator('[data-f="len"]').fill('45');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const [e] = await storedEvents(page);
  expect(e.type).toBe('drilling');
  expect(e.detail).toMatchObject({ attire: 'nogi', techniques: ['knee-cut', 'My weird sweep'] });
  expect(e.endAt! - e.at).toBe(45 * MIN);
  await expect(page.locator('#entries')).toContainText('Knee cut pass');
});

test('stopping a round asks how it went', async ({ page }) => {
  await open(page);
  await card(page, 'roll').click();
  await card(page, 'roll').click();
  const sheet = page.locator('#sheet');
  await expect(sheet).toContainText('Round over');
  await sheet.locator('[data-f="partner"]').fill('Sam');
  await sheet.getByRole('button', { name: 'Purple' }).click();
  await sheet.locator('[data-tag="subsFor"][data-value="armbar"]').click();
  await sheet.locator('[data-tag="subsAgainst"][data-value="triangle"]').click();
  await unfold(page, 'positions');
  await sheet.locator('[data-tag="stuck"][data-value="half-guard"]').click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#entries')).toContainText('Sam');
  const stats = await page.evaluate(() => window.matlog.stats());
  expect(stats).toMatchObject({ rounds: 1, subsFor: 1, subsAgainst: 1, stuck: [{ position: 'Half guard', n: 1 }] });
});

test('a ?do= link logs once and cleans the URL', async ({ page }) => {
  await open(page, {}, './?do=log&type=open-mat&min=60&gi=nogi');
  await expect(toastEl(page)).toContainText('Via link: 🤼 Open mat · 1h 00m');
  await expect(page).toHaveURL(/\/matlog\/$/);
  const [e] = await storedEvents(page);
  expect(e).toMatchObject({ type: 'open-mat', detail: { min: 60, attire: 'nogi' } });
});

test('a bad link says why', async ({ page }) => {
  await open(page, {}, './?do=log&type=yoga');
  await expect(toastEl(page)).toContainText("don't know “yoga”");
  expect(await storedEvents(page)).toEqual([]);
});

test('paste a Markdown class note', async ({ page }) => {
  await open(page);
  await page.locator('#paste-open').click();
  const d = page.locator('#paste');
  await d.locator('[data-md]').fill('## Class\nLength: 75m\nTechniques: scissor sweep\n\n### Rolls\n- Jo (blue): hit rnc\n- Sam (purple): tapped to kimura');
  await expect(d.locator('[data-preview]')).toContainText('Scissor sweep');
  await d.getByRole('button', { name: 'Log it' }).click();
  await expect(toastEl(page)).toContainText('Logged 1 session and 2 rounds');
  await expect(page.locator('#entries')).toContainText('2 rounds');
});

test('Progress and the technique library show what was logged', async ({ page }) => {
  const now = Date.now();
  const events = [
    ev('class', now - 3 * 60 * MIN, { detail: { min: 600, techniques: ['scissor-sweep'] } }),
    ev('roll', now - 2.5 * 60 * MIN, { detail: { min: 6, subsFor: ['armbar'], stuck: ['half-guard'] } }),
    ev('promotion', now - 24 * 60 * MIN, { detail: { belt: 'blue', stripes: 1 } }),
  ];
  await open(page, { events });
  await expect(page.locator('#rank')).toContainText('Blue belt · 1 stripe');
  await expect(page.locator('#hours')).toContainText('10h on the mat');
  await page.keyboard.press('g');
  const p = page.locator('#progress');
  await expect(p).toContainText('10h');
  await expect(p).toContainText('Armbar');
  await expect(p.locator('.timeline li')).toHaveCount(2);
  await expect(p.locator('.patch:not(.locked)')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  const t = page.locator('#tech');
  await expect(t.locator('table')).toContainText('Scissor sweep');
  await expect(t.locator('.graph-edge')).toHaveCount(1);
});

test('crossing 10 mat hours unlocks a patch', async ({ page }) => {
  await open(page, { events: [ev('class', Date.now() - 20 * 60 * MIN, { detail: { min: 590 } })] }, './?do=log&type=drilling&min=30');
  await expect(toastEl(page)).toContainText('Patch unlocked: 10 hours');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('matlog:v1:settings')!).patches)).toEqual(['p10']);
});

test('restores from the localStorage mirror when IndexedDB is empty', async ({ page }) => {
  await open(page, { events: [ev('comp', Date.now() - 5 * 60 * MIN, { detail: { min: 120 } })], mirrorOnly: true });
  await expect(toastEl(page)).toContainText('Recovered 1 entry');
  await expect(page.locator('#entries')).toContainText('Comp');
  await expect.poll(async () => (await storedEvents(page)).length).toBe(1);
});

test('settings: theme, start belt and buddy', async ({ page }) => {
  await open(page);
  await page.keyboard.press(',');
  const s = page.locator('#settings');
  await s.locator('select[name="theme"]').selectOption('gi');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gi');
  await s.locator('select[name="startBelt"]').selectOption('purple');
  await s.locator('select[name="companion"]').selectOption('octopus');
  await page.keyboard.press('Escape');
  await expect(page.locator('#rank')).toContainText('Purple belt');
  await expect(page.locator('#companion svg')).toHaveAttribute('data-buddy', 'octopus');
  await page.keyboard.press(',');
  await s.locator('select[name="companion"]').selectOption('off');
  await page.keyboard.press('Escape');
  await expect(page.locator('#companion')).toBeHidden();
});

test('every buddy draws, and ties its belt on start', async ({ page }) => {
  await open(page);
  for (const id of ['grappler', 'bear', 'sloth', 'octopus', 'frog', 'cat']) {
    await page.evaluate((id) => localStorage.setItem('matlog:v1:settings', JSON.stringify({ splash: false, companion: id })), id);
    await page.reload();
    await expect(page.locator('#companion svg')).toHaveAttribute('data-buddy', id);
  }
  await card(page, 'class').click();
  await expect(page.locator('#companion svg')).toHaveClass(/react-tie/);
  await expect(page.locator('#companion svg')).toHaveAttribute('data-state', 'training');
});

test('backup reminder: Back up now and Not now', async ({ page }) => {
  const old = Date.now() - 10 * 24 * 60 * MIN;
  const events = Array.from({ length: 6 }, (_, i) => ev('class', old + i * 60 * MIN, { detail: { min: 60 }, createdAt: old + i }));
  await open(page, { events });
  const banner = page.locator('#banner');
  await expect(banner).toContainText('No backup yet');
  const download = page.waitForEvent('download');
  await banner.getByRole('button', { name: 'Back up now' }).click();
  expect((await download).suggestedFilename()).toMatch(/^matlog-.*\.json$/);
  await expect(banner).toBeHidden();

  await open(page, { events });
  await banner.getByRole('button', { name: 'Not now' }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.locator('html[data-ready]')).toBeAttached();
  await expect(banner).toBeHidden();
});

test('backup reminder interval is a setting', async ({ page }) => {
  const old = Date.now() - 10 * 24 * 60 * MIN;
  await open(page, { events: Array.from({ length: 6 }, (_, i) => ev('class', old + i, { detail: { min: 60 } })), settings: { backupEveryDays: 0 } });
  await expect(page.locator('#banner')).toBeHidden();
  await page.keyboard.press(',');
  await page.locator('#settings [data-backup-every]').selectOption('7');
  await expect(page.locator('#banner')).toContainText('No backup yet');
});

test('splash shows by default, a tap dismisses it without logging, and it can be turned off', async ({ page }) => {
  await open(page, { settings: { splash: true } });
  const splash = page.locator('.splash');
  await expect(splash).toBeAttached();
  await splash.click({ position: { x: 100, y: 300 } });
  await expect(splash).toHaveCount(0);
  expect(await storedEvents(page)).toEqual([]);
  await page.keyboard.press(',');
  await page.locator('#settings input[name="splash"]').uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html[data-ready]')).toBeAttached();
  await expect(splash).toHaveCount(0);
});

test('links skip the splash', async ({ page }) => {
  await open(page, { settings: { splash: true } }, './?do=log&type=class&min=60');
  await expect(page.locator('.splash')).toHaveCount(0);
  await expect(toastEl(page)).toContainText('Via link');
});

test('a round with moves landed and tried', async ({ page }) => {
  await open(page);
  await card(page, 'roll').click();
  await card(page, 'roll').click();
  const sheet = page.locator('#sheet');
  await unfold(page, 'moves');
  const landed = sheet.locator('[data-tags="landed"]');
  await landed.fill('knee slice');
  await landed.press('Enter');
  const tried = sheet.locator('[data-tags="tried"]');
  await tried.fill('berimbolo');
  await tried.press('Enter');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#entries')).toContainText('↗ Knee cut pass');
  await page.keyboard.press('t');
  const row = page.locator('#tech tr', { hasText: 'Knee cut pass' });
  await expect(row).toContainText('1 of 1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await expect(page.locator('#progress')).toContainText('Moves in rounds');
});

test('typing a technique and tapping Save straight away keeps it (regression)', async ({ page }) => {
  await open(page);
  const box = (await card(page, 'class').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const sheet = page.locator('#sheet');
  await sheet.locator('[data-tags="techniques"]').fill('arm drag');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const [e] = await storedEvents(page);
  expect(e.detail?.techniques).toEqual(['take-back-guard']);
  await expect(page.locator('#entries')).toContainText('Arm drag');
});

test('a brand-new technique typed in a session is kept as typed, and tapping elsewhere shows its chip', async ({ page }) => {
  await open(page);
  const box = (await card(page, 'drilling').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const sheet = page.locator('#sheet');
  await sheet.locator('[data-tags="techniques"]').fill('Kiss of the dragon');
  await sheet.locator('[data-f="len"]').click();
  await expect(sheet.locator('[data-untag="techniques"]')).toHaveText(['Kiss of the dragon']);
  await sheet.getByRole('button', { name: 'Save' }).click();
  const [e] = await storedEvents(page);
  expect(e.detail?.techniques).toEqual(['Kiss of the dragon']);
});
