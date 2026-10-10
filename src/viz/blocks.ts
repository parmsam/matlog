import { dayDate, dayKey } from '../core/days';
import { roleLabel, type FocusView } from '../core/focus';
import { esc } from '../ui/dom';

const DAY = 86_400_000;
const ROW = 26;
const LABEL_W = 150;
const W = 520;

/**
 * Focus blocks over time: one row per focus, a bar for each block, gaps for rests. Shows the
 * "work it, rest it, come back" rhythm at a glance. The last `days` days, today at the right.
 */
export function blocksSvg(vs: FocusView[], now: number, days = 182): string {
  const from = now - days * DAY;
  const x = (ts: number) => LABEL_W + Math.max(0, Math.min(1, (ts - from) / (now - from))) * (W - LABEL_W - 6);
  const shown = vs.filter((v) => v.f.blocks.some((b) => (b.to ?? now) >= from)).slice(0, 10);
  const h = shown.length * ROW + 22;
  const months: string[] = [];
  for (let d = new Date(from); d.getTime() <= now; d.setMonth(d.getMonth() + 1, 1)) {
    const t = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    if (t < from) continue;
    months.push(`<line x1="${x(t)}" x2="${x(t)}" y1="14" y2="${h}" stroke="var(--faint)" /><text x="${x(t) + 3}" y="10" font-size="10">${dayDate(dayKey(t)).toLocaleDateString(undefined, { month: 'short' })}</text>`);
  }
  const rows = shown
    .map((v, i) => {
      const y = 18 + i * ROW;
      const bars = v.f.blocks
        .filter((b) => (b.to ?? now) >= from)
        .map((b) => {
          const x1 = x(b.from);
          const x2 = Math.max(x1 + 3, x(b.to ?? now));
          return `<rect x="${x1}" y="${y + 4}" width="${x2 - x1}" height="${ROW - 10}" rx="4" class="block-bar ${v.f.role}"><title>${esc(v.f.text)}: ${dayDate(dayKey(b.from)).toLocaleDateString()} – ${b.to ? dayDate(dayKey(b.to)).toLocaleDateString() : 'now'}</title></rect>`;
        })
        .join('');
      return `<text x="0" y="${y + ROW / 2 + 2}" font-size="11" class="block-label">${esc(v.f.text.length > 22 ? `${v.f.text.slice(0, 21)}…` : v.f.text)}</text>${bars}`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-label="Focus blocks over the last ${Math.round(days / 30)} months">${months.join('')}<line x1="${x(now)}" x2="${x(now)}" y1="14" y2="${h}" stroke="var(--accent)" stroke-dasharray="2 2" />${rows}</svg>
  <ul class="block-legend">${['main', 'complement', 'habit', 'experiment', 'side'].map((r) => `<li><i class="block-bar ${r}"></i>${roleLabel(r as FocusView['f']['role'])}</li>`).join('')}</ul>`;
}
