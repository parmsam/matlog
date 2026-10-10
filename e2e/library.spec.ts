import { ev, expect, MIN, open, test } from './helpers';

test('the library lists every technique by type, filters the whole of it, and shows hidden ones last', async ({ page }) => {
  const now = Date.now();
  await open(page, {
    events: [
      ev('class', now - 3 * 60 * MIN, { detail: { min: 60, techniques: ['scissor-sweep', 'My spin thing'] } }),
      ev('technique', now - 60 * MIN, { detail: { technique: { id: 'osoto-gari', label: 'Osoto gari', kind: 'takedown', from: 'standing', to: 'side-control', hidden: true } } }),
    ],
  });
  await page.keyboard.press('t');
  const t = page.locator('#tech');
  // Used: only what you've logged.
  await expect(t.locator('tbody tr')).toHaveCount(2);
  await expect(t).not.toContainText('Double leg');

  await t.getByRole('button', { name: /^All \d+/ }).click();
  await expect(t.getByRole('heading', { name: 'All techniques' })).toBeVisible();
  await expect(t.locator('.tech-group', { hasText: 'Takedowns' })).toBeVisible();
  await expect(t.locator('tr', { hasText: 'Double leg' })).toContainText('Standing →');
  await expect(t.locator('tr', { hasText: 'Scissor sweep' })).toContainText('drilled 1×');
  await expect(t.locator('.tech-group', { hasText: 'Typed in, no type yet' })).toBeVisible();
  await expect(t.locator('.tech-group').last()).toContainText('Hidden from suggestions');
  await expect(t.locator('table').last()).toContainText('Osoto gari');

  // The filter searches the whole library, by name, other names, position or type.
  await t.locator('[data-filter]').fill('mount');
  await expect(t.locator('tbody tr').first()).toBeVisible();
  for (const row of await t.locator('tbody tr').allInnerTexts()) expect(row.toLowerCase()).toContain('mount');
  await t.locator('[data-filter]').fill('zzzz');
  await expect(t).toContainText('No technique matches.');
  await t.locator('[data-filter]').fill('double');

  // An unused one opens like any other, and back returns to All.
  await t.getByRole('button', { name: 'Double leg' }).click();
  await expect(t.getByRole('heading', { name: 'Double leg' })).toBeVisible();
  await t.getByRole('button', { name: '‹ All techniques' }).click();
  await expect(t.getByRole('heading', { name: 'All techniques' })).toBeVisible();

  await t.getByRole('button', { name: 'Used' }).click();
  await expect(t.getByRole('heading', { name: 'Last drilled or tried' })).toBeVisible();
});
