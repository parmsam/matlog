import { expect, open, storedEvents, test } from './helpers';

test('paste the documented format: everything lands, and the preview says so', async ({ page }) => {
  await open(page);
  await page.locator('#paste-open').click();
  const d = page.locator('#paste');
  await d.getByRole('button', { name: 'Use the example' }).click();
  const prev = d.locator('[data-preview]');
  await expect(prev).toContainText('topic: Half guard passing');
  await expect(prev).toContainText('1 technique note');
  await expect(prev).toContainText('1 problem');
  await expect(prev).toContainText('1 injury');
  await expect(prev).toContainText('from half guard bottom');
  await d.getByRole('button', { name: 'Log it' }).click();
  const types = (await storedEvents(page)).map((e) => e.type).sort();
  expect(types).toEqual(['class', 'injury', 'problem', 'roll', 'technote']);
  await expect(page.locator('#entries')).toContainText('Half guard passing');
});

test('copy prompt for an AI carries the format and your names', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.evaluate(() => window.matlog.log('roll', { partner: 'Riley', landed: 'My spin thing' }));
  await page.locator('#paste-open').click();
  const d = page.locator('#paste');
  await d.locator('.format-help summary').click();
  await d.getByRole('button', { name: 'Copy prompt for an AI' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('### Rounds');
  expect(text).toContain('My spin thing');
  expect(text).toContain('Riley');
});

test('edit a built-in, hide one, and make a variation', async ({ page }) => {
  await open(page);
  await page.keyboard.press('t');
  const d = page.locator('#tech');
  // A technique only shows in the list once used: tag one through the API.
  await page.evaluate(() => {
    window.matlog.log('class', { min: 60, techniques: ['arm drag', 'osoto gari'] });
    window.matlog.log('roll', { landed: 'Shoulder post wrist grab arm drag' });
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await d.getByRole('button', { name: 'Shoulder post wrist grab arm drag' }).click();
  await d.getByRole('button', { name: 'Add type and positions' }).click();
  await d.getByRole('button', { name: 'Transition' }).click();
  await d.locator('[data-from]').selectOption('open-guard');
  await d.locator('[data-to]').selectOption('back');
  await d.locator('[data-parent]').fill('Arm drag');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toContainText('Variation of Arm drag');
  await d.getByRole('button', { name: 'Arm drag', exact: true }).click();
  await expect(d).toContainText('Variations: Shoulder post wrist grab arm drag');
  await expect(d).toContainText('With its variations');
  await d.getByRole('button', { name: 'Edit' }).click();
  await d.locator('[data-name]').fill('Arm drag (seated)');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.locator('h3').first()).toHaveText('Arm drag (seated)');
  await expect(d).toContainText('edited by you');
  // Hide Osoto gari from suggestions.
  await d.getByRole('button', { name: '‹ All techniques' }).click();
  await d.getByRole('button', { name: 'Osoto gari' }).click();
  await d.getByRole('button', { name: 'Edit' }).click();
  await d.locator('[data-hidden]').check();
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toContainText('hidden from suggestions');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+C');
  await expect(page.locator('#sheet [data-tag="techniques"][data-value="osoto-gari"]')).toHaveCount(0);
  await expect(page.locator('#sheet datalist#dl-tech option[value="Osoto gari"]')).toHaveCount(0);
  // Back to the built-in version.
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await d.getByRole('button', { name: 'Arm drag (seated)' }).click();
  await d.getByRole('button', { name: 'Edit' }).click();
  await d.getByRole('button', { name: 'Back to the built-in version' }).click();
  await expect(d.locator('h3').first()).toHaveText('Arm drag');
});

test('topic on a session: set in the sheet, shown in the list, linked in the library', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+C');
  const sheet = page.locator('#sheet');
  await sheet.locator('[data-f="topic"]').fill('Knee cut');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#entries')).toContainText('Knee cut');
  const [s] = await storedEvents(page);
  expect(s.detail?.topic).toBe('Knee cut');
  await page.evaluate(() => window.matlog.techniqueNotes('knee cut', 'knee to the mat first', { kind: 'detail' }));
  await page.keyboard.press('t');
  await page.locator('#tech').getByRole('button', { name: 'Knee cut pass' }).click();
  await expect(page.locator('#tech .from-log')).toContainText('Knee cut');
});
