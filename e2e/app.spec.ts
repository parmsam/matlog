import { card, ev, expect, MIN, open, storedEvents, test, toastEl } from './helpers';

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

test('settings: theme, start belt and focus', async ({ page }) => {
  await open(page);
  await page.keyboard.press(',');
  const s = page.locator('#settings');
  await s.locator('select[name="theme"]').selectOption('gi');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gi');
  await s.locator('select[name="startBelt"]').selectOption('purple');
  await s.locator('input[name="focus"]').fill('framing from bottom side');
  await s.locator('input[name="focus"]').blur();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rank')).toContainText('Purple belt');
  await expect(page.locator('#focus')).toContainText('framing from bottom side');
});
