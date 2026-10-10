import type { Page } from '@playwright/test';
import { expect, open, test } from './helpers';

/** Refreshes docs/*.png. Run: SCREENSHOTS=1 npx playwright test screenshots --project=chromium */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/*.png');

/** Five months of made-up training: partners and notes are fake. */
async function seed(page: Page) {
  await page.evaluate(() => {
    const subs = ['armbar', 'rnc', 'triangle', 'kimura', 'guillotine', 'darce'];
    const parts = ['Riley', 'Alex', 'Jo', 'Priya', 'Marco'];
    const belts = ['white', 'blue', 'purple', 'brown', 'blue'] as const;
    const techs = [['knee cut', 'body lock pass'], ['scissor sweep', 'armbar from guard', 'triangle'], ['double leg', 'snap down', 'darce'], ['dogfight', 'old school sweep', 'knee shield'], ['seatbelt', 'rnc', 'bow and arrow']];
    for (let i = 150; i > 0; i -= 1 + (i % 3)) {
      const t = i % 11 === 0 ? 'open-mat' : i % 7 === 0 ? 'drilling' : 'class';
      const end = i * 24 * 60 - 120;
      window.matlog.log(t, { min: 60 + (i % 4) * 15, minutesAgo: end, gi: i % 2 ? 'gi' : 'nogi', techniques: techs[i % 5] });
      for (let r = 0; r < 3; r++) {
        const k = i + r;
        window.matlog.log('roll', {
          minutesAgo: end + 5 + r * 8,
          min: 6,
          partner: parts[k % 5],
          belt: belts[k % 5],
          size: (['smaller', 'similar', 'bigger'] as const)[k % 3],
          subs: k % 3 ? subs[k % 6] : undefined,
          tapped: k % 4 === 0 ? subs[(k * 7) % 6] : undefined,
          stuck: k % 3 === 0 ? 'half guard' : k % 5 === 0 ? 'mount' : k % 7 === 0 ? 'side control' : undefined,
        });
      }
    }
    window.matlog.start('class', { minutesAgo: 34 });
    window.matlog.start('roll', { minutesAgo: 2 });
  });
}

const settings = { startBelt: 'blue' as const, startStripes: 2, focus: 'framing from bottom side control', patches: ['p10' as const, 'p25' as const, 'p50' as const], theme: 'auto' as const };

test('desktop, progress, techniques', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, { settings });
  await seed(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/screenshot-desktop.png' });
  await page.keyboard.press('g');
  await expect(page.locator('#progress')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/screenshot-progress.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/screenshot-techniques.png' });
});

test('mobile, gi theme, round sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, { settings });
  await seed(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/screenshot-mobile.png' });
  await page.locator('[data-card="roll"]').click();
  const sheet = page.locator('#sheet');
  await sheet.locator('[data-f="partner"]').fill('Riley');
  await sheet.getByRole('button', { name: 'Purple', exact: true }).click();
  await sheet.getByRole('button', { name: 'Bigger' }).click();
  await sheet.locator('[data-tag="subsFor"][data-value="armbar"]').click();
  await sheet.locator('[data-tag="stuck"][data-value="half-guard"]').click();
  await sheet.evaluate((d) => (d.scrollTop = 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/screenshot-round.png' });
});
