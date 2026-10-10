import { expect, open, test } from './helpers';
import { RECIPES } from '../src/ui/agentApi';

test('window.matlog: help, logging, state, markdown round trip', async ({ page }) => {
  // Exact times: the round 30 minutes ago belongs to the class.
  await open(page, { settings: { classOnHour: false } });
  const help = await page.evaluate(() => window.matlog.help());
  expect(help).toContain('matlog.log(type, opts?)');
  const r = await page.evaluate(() => window.matlog.log('class', { min: 90, gi: 'gi', techniques: ['knee cut'] }));
  expect(r).toMatchObject({ result: 'logged', entry: { type: 'class', minutes: 90, gi: 'gi', techniques: ['Knee cut pass'] } });
  await page.evaluate(() => window.matlog.log('roll', { partner: 'Sam', belt: 'purple', subs: 'armbar', tapped: ['triangle'], stuck: 'half guard', minutesAgo: 30 }));
  const s = await page.evaluate(() => window.matlog.state());
  expect(s).toMatchObject({ matHours: 1.5, sessions: 1, rank: { belt: 'white', stripes: 0 } });
  await expect(page.evaluate(() => window.matlog.log('yoga'))).rejects.toThrow(/don't know/);
  const md = await page.evaluate(() => window.matlog.markdown(1));
  expect(md).toContain('## Class');
  expect(md).toContain('### Rounds\n- Sam (purple, 5m)\n  - Hit: Armbar\n  - Tapped to: Triangle\n  - Stuck: Half guard');
  const parsed = await page.evaluate((md) => window.matlog.parseMarkdown(md), md);
  expect(parsed[0]).toMatchObject({ type: 'class', min: 90, attire: 'gi' });
});

test('every recipe in the help runs', async ({ page }) => {
  await open(page);
  for (const r of RECIPES) {
    const code = r.code.replace('matlog.importMarkdown(text)', "matlog.importMarkdown('## Open mat\\nLength: 30m')");
    await page.evaluate((c) => new Function(`return ${c}`)(), code);
  }
});
