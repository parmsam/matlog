import { dayDate } from '../core/days';
import { duration, plural } from '../core/format';
import type { WeekHeatmap } from '../core/stats';

const CELL = 13;
const GAP = 3;
const LEFT = 26;
const TOP = 16;

/** Weeks as columns, weekdays as rows (GitHub-style), with a month label where a month starts. */
export function heatmapSvg(h: WeekHeatmap, weekStart: 0 | 1): string {
  const w = LEFT + h.weeks.length * (CELL + GAP);
  const ht = TOP + 7 * (CELL + GAP);
  const names = weekStart === 1 ? ['M', '', 'W', '', 'F', '', 'S'] : ['S', '', 'T', '', 'T', '', 'S'];
  const rows = names.map((n, i) => (n ? `<text x="0" y="${TOP + i * (CELL + GAP) + CELL - 2}" font-size="10">${n}</text>` : '')).join('');
  let lastMonth = -1;
  const months: string[] = [];
  const cells: string[] = [];
  h.cells.forEach((week, wi) => {
    const x = LEFT + wi * (CELL + GAP);
    const m = dayDate(week[0].day).getMonth();
    if (m !== lastMonth) {
      if (wi < h.weeks.length - 2) months.push(`<text x="${x}" y="10" font-size="10">${dayDate(week[0].day).toLocaleDateString(undefined, { month: 'short' })}</text>`);
      lastMonth = m;
    }
    week.forEach((c, di) => {
      const y = TOP + di * (CELL + GAP);
      const label = `${dayDate(c.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${c.minutes ? `${duration(c.minutes * 60_000)}, ${plural(c.sessions, 'session')}` : 'rest'}`;
      cells.push(`<rect class="hm-cell ${c.future ? 'hm-future' : `hm-${c.level}`}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5"><title>${label}</title></rect>`);
    });
  });
  return `<svg viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" role="img" aria-label="Mat time per day, ${h.weeks.length} weeks">${months.join('')}${rows}${cells.join('')}</svg>`;
}
