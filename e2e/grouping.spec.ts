import { card, ev, expect, MIN, open, storedEvents, test, toastEl, unfold } from './helpers';

for (const kind of ['class', 'drilling', 'comp', 'open-mat'] as const) {
  test(`rounds group under ${kind}, and stay there when its time changes`, async ({ page }) => {
    await open(page, { settings: { classOnHour: false } });
    await card(page, kind).click();
    // A round started during the session.
    await card(page, 'roll').click();
    await card(page, 'roll').click();
    await page.locator('#sheet [data-f="partner"]').fill('Riley');
    await page.locator('#sheet').getByRole('button', { name: 'Save' }).click();
    await card(page, kind).click(); // stop the session
    const session = (await storedEvents(page)).find((e) => e.type === kind)!;
    // A round added from the session's sheet afterwards.
    await page.locator(`[data-entry="${session.id}"]`).click();
    await unfold(page, 'rounds');
    await page.locator('#sheet').getByRole('button', { name: kind === 'comp' ? '+ Add a match' : '+ Add a round' }).click();
    await page.locator('#sheet [data-f="partner"]').fill('Jo');
    await page.locator('#sheet').getByRole('button', { name: 'Save' }).click();
    // Move the session an hour earlier: linked rounds come along.
    await page.locator(`[data-entry="${session.id}"]`).click();
    const at = page.locator('#sheet [data-f="at"]');
    const t = new Date(new Date(await at.inputValue()).getTime() - 60 * MIN);
    const p = (n: number) => String(n).padStart(2, '0');
    await at.fill(`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`);
    await page.locator('#sheet').getByRole('button', { name: 'Save' }).click();
    const entry = page.locator('#entries .entry', { has: page.locator(`[data-entry="${session.id}"]`) });
    await expect(entry.locator('.roll-row')).toHaveCount(2);
    await expect(entry).toContainText('Riley');
    await expect(entry).toContainText('Jo');
    const rounds = (await storedEvents(page)).filter((e) => e.type === 'roll');
    expect(rounds.every((r) => r.detail?.sessionId === session.id)).toBe(true);
    await expect(toastEl(page)).toBeVisible();
  });
}

test('an unlinked round logged just after a session ends still groups with it', async ({ page }) => {
  const now = Date.now();
  const s = ev('drilling', now - 70 * MIN, { detail: { min: 60 } });
  await open(page, { events: [s, ev('roll', now - 5 * MIN, { detail: { min: 5, partner: 'Late' } })] });
  const entry = page.locator('#entries .entry', { has: page.locator(`[data-entry="${s.id}"]`) });
  await expect(entry).toContainText('Late');
});

test('technique notes: add a key detail and a source, see what else the log says', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.matlog.log('class', { min: 60, techniques: ['knee cut'], note: 'Coach: knee to the mat first' });
    window.matlog.problems('my knee cut gets stuffed by a knee shield');
  });
  await page.keyboard.press('t');
  const d = page.locator('#tech');
  await d.getByRole('button', { name: 'Knee cut pass' }).click();
  await d.locator('[data-note-text]').fill('Underhook the far arm before cutting');
  await d.getByRole('button', { name: 'Add note' }).click();
  await d.getByRole('button', { name: 'Source', exact: true }).click();
  await d.locator('[data-note-text]').fill('Half guard passing, vol 2');
  await d.locator('[data-note-url]').fill('https://example.com/v?t=90');
  await d.getByRole('button', { name: 'Add note' }).click();
  await expect(d.locator('.tech-note').first()).toContainText('Key detail');
  await expect(d.locator('.tech-note').first()).toContainText('Underhook the far arm');
  await expect(d.locator('.tech-note a')).toHaveAttribute('href', 'https://example.com/v?t=90');
  await expect(d.locator('.from-log')).toContainText('Coach: knee to the mat first');
  await expect(d.locator('.from-log')).toContainText('knee shield');
  await d.getByRole('button', { name: '‹ All techniques' }).click();
  await expect(d.locator('tr', { hasText: 'Knee cut pass' })).toContainText('📝 2');
  expect((await storedEvents(page)).filter((e) => e.type === 'technote')).toHaveLength(2);
});
