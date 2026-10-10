import { card, ev, expect, MIN, open, storedEvents, test, toastEl } from './helpers';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('focus blocks: set from the home card, tracked, rested and resumed', async ({ page }) => {
  await open(page);
  await page.locator('#focus').click();
  const d = page.locator('#focus-sheet');
  await d.locator('[data-focus]').fill('knee slice from half');
  await expect(d.locator('[data-match]')).toContainText('Knee cut pass');
  await d.getByRole('button', { name: '1 week' }).click();
  await d.getByRole('button', { name: '2 reps' }).click();
  await d.locator('[data-works]').fill('back take');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.locator('.focus-item')).toContainText('week 1 of 1');
  await page.keyboard.press('Escape');
  const home = page.locator('#focus');
  await expect(home).toContainText('knee slice from half');
  await expect(home).toContainText('✓ → back take');
  await page.evaluate(() => window.matlog.log('roll', { landed: 'knee cut' }));
  await page.evaluate(() => window.matlog.log('roll', { tried: 'knee cut' }));
  await expect(home).toContainText('landed 1 of 2 in rounds');
  await expect(home).toContainText('1 of 2 reps today');
  // Starting class shows today's focus in the toast.
  await card(page, 'open-mat').click();
  await expect(toastEl(page)).toContainText('Today: knee slice from half');

  await page.keyboard.press('f');
  await d.getByRole('button', { name: 'Rest it' }).click();
  await expect(d).toContainText('Resting since');
  await d.getByRole('button', { name: 'Start a block' }).click();
  await expect(d.locator('.focus-item')).toContainText('2 blocks');
  const api = await page.evaluate(() => window.matlog.focus());
  expect(api[0]).toMatchObject({ text: 'knee slice from half', state: 'active', role: 'Main skill' });
  expect(api[0].blocks).toHaveLength(2);
});

test('a v0.2 "Working on" line moves into the log as a focus', async ({ page }) => {
  await open(page, { settings: { focus: 'framing from bottom side', focusSince: Date.now() - 3 * DAY } as never });
  await expect(page.locator('#focus')).toContainText('framing from bottom side');
  await expect.poll(async () => (await storedEvents(page)).filter((e) => e.type === 'focus').length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('matlog:v1:settings')!).focus)).toBe('');
});

test('problems: add, solve, reopen', async ({ page }) => {
  await open(page);
  await page.keyboard.press('b');
  const d = page.locator('#problems');
  await d.locator('[data-text]').fill('getting flattened in half guard');
  await d.getByRole('button', { name: 'Someone told me' }).click();
  await d.locator('[data-idea]').fill('knee shield first');
  await d.getByRole('button', { name: 'Add problem' }).click();
  await expect(d.locator('.problem')).toContainText('Idea: knee shield first');
  await expect(d.locator('.problem')).toContainText('Someone told me');
  await d.getByRole('button', { name: 'Solved', exact: true }).click();
  await expect(d).toContainText('Open (0)');
  await page.keyboard.press('Escape');
  await expect(page.locator('#focus')).not.toContainText('open problem');
  const p = await page.evaluate(() => window.matlog.problems());
  expect(p.solved[0]).toMatchObject({ text: 'getting flattened in half guard', source: 'external' });
});

test('reflection: the banner asks a while after a session, once', async ({ page }) => {
  const s = ev('class', Date.now() - 4 * HOUR, { detail: { min: 60 } });
  await open(page, { events: [s], settings: { reflectAfter: 120 } });
  const banner = page.locator('#banner');
  await expect(banner).toContainText('Reflect on today’s class');
  await banner.getByRole('button', { name: 'Reflect' }).click();
  const d = page.locator('#reflect');
  await d.locator('[data-problem]').fill('lost the underhook');
  await d.locator('[data-idea]').fill('circle off it');
  await d.getByRole('button', { name: '4 of 5' }).click();
  await d.getByRole('button', { name: 'Partly' }).click();
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(banner).toBeHidden();
  const stored = await storedEvents(page);
  expect(stored.find((e) => e.id === s.id)?.detail).toMatchObject({ enjoy: 4, plan: 'partly' });
  expect(stored.find((e) => e.type === 'problem')?.detail?.problem).toMatchObject({ text: 'lost the underhook', idea: 'circle off it', sessionId: s.id });
  await expect(page.locator('#entries')).toContainText('📓');
  await expect(page.locator('#focus')).toContainText('1 open problem');
});

test('reflection: Not now stops asking about that session', async ({ page }) => {
  await open(page, { events: [ev('open-mat', Date.now() - 4 * HOUR, { detail: { min: 60 } })], settings: { reflectAfter: 120 } });
  await page.locator('#banner').getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('#banner')).toBeHidden();
  await page.reload();
  await expect(page.locator('html[data-ready]')).toBeAttached();
  await expect(page.locator('#banner')).toBeHidden();
});

test('tips show one at a time; Next browses, Got it dismisses', async ({ page }) => {
  await open(page, { settings: { tipsSeen: [] } });
  const banner = page.locator('#banner');
  await expect(banner).toContainText('Tap a card when you bow in');
  await banner.getByRole('button', { name: 'Next ›' }).click();
  await expect(banner).not.toContainText('Tap a card when you bow in');
  await banner.getByRole('button', { name: 'Got it' }).click();
  await expect(banner).toContainText('Tap a card when you bow in');
});
