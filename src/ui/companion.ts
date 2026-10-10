import { isSession } from '../core/events';
import { app, settings } from '../core/log';
import { currentRank, matMinutes, PATCHES } from '../core/stats';
import type { Belt } from '../core/types';

/**
 * A little grappler who trains with you. It wears your belt (and stripes), a gi or a rashguard to
 * match the theme, and the patches you've earned. It gets ready while a session runs, ties its
 * belt when one starts, taps out when you log a tap and cheers a finish. Decoration only: it never
 * looks disappointed about anything.
 */

export type Reaction = 'tie' | 'tap' | 'cheer';

const host = () => document.getElementById('companion')!;
let drawnKey = '';
let reactTimer: number | undefined;

function svg(belt: Belt, stripes: number, patchColors: string[]): string {
  const barX = 62;
  const stripeMarks = Array.from({ length: stripes }, (_, i) => `<rect class="stripe" x="${barX + 2 + i * 3}" y="66.5" width="1.6" height="7" />`).join('');
  const patches = patchColors
    .slice(0, 4)
    .map((c, i) => `<circle class="patch-mark" cx="${[33, 67, 35, 65][i]}" cy="${[62, 62, 84, 84][i]}" r="3.4" fill="${c}" />`)
    .join('');
  return `<svg class="buddy" viewBox="0 0 100 100" role="img" aria-label="Your training buddy">
    <g class="rig">
      <ellipse cx="50" cy="96" rx="26" ry="3" fill="currentColor" opacity="0.08" />
      <path class="body" d="M24 92 C22 70 30 56 50 56 C70 56 78 70 76 92 Z" />
      <path class="lapel" d="M40 58 L50 74 L60 58" />
      <g class="hand l"><circle class="skin" cx="22" cy="80" r="6" /></g>
      <g class="hand r"><circle class="skin" cx="78" cy="80" r="6" /></g>
      <rect class="belt" x="25" y="66" width="50" height="8" rx="1.5" style="--belt: var(--belt-${belt}); --belt-bar: ${belt === 'black' ? 'var(--k-comp)' : 'var(--belt-black)'}" />
      <rect class="bar" x="${barX}" y="66.5" width="12" height="7" style="--belt-bar: ${belt === 'black' ? 'var(--k-comp)' : 'var(--belt-black)'}" />
      ${stripeMarks}
      <g class="tail" style="--belt: var(--belt-${belt})">
        <path class="belt" d="M47 73 L42 86 L46 87 L50 75 Z" />
        <path class="belt" d="M53 73 L58 86 L54 87 L50 75 Z" />
        <rect class="belt" x="46" y="65" width="8" height="10" rx="2" />
      </g>
      ${patches}
      <circle class="ear" cx="29" cy="36" r="5" />
      <circle class="ear" cx="71" cy="36" r="5" />
      <circle class="skin" cx="50" cy="36" r="21" />
      <path d="M30 30 C32 16 68 16 70 30 C64 22 36 22 30 30 Z" fill="var(--ink)" />
      <g class="eyes"><circle class="eye" cx="42" cy="37" r="2.6" /><circle class="eye" cx="58" cy="37" r="2.6" /></g>
      <path class="mouth calm" d="M45 46 Q50 49 55 46" />
      <path class="mouth happy" d="M43 44 Q50 53 57 44 Z" fill="var(--ink)" />
      <path class="sweat" d="M70 24 q3 5 0 7 q-3 -2 0 -7 Z" />
    </g>
  </svg>`;
}

export function renderCompanion(now = Date.now()) {
  const el = host();
  const prefs = settings.get();
  el.hidden = !prefs.companion;
  if (!prefs.companion) return;
  const { events } = app.get();
  const rank = currentRank(events, prefs, now);
  const minutes = matMinutes(events, now);
  const colors = PATCHES.filter((p) => prefs.patches.includes(p.id) && minutes >= p.hours * 60).map((p) => p.color);
  const key = `${rank.belt}${rank.stripes}${colors.join()}`;
  if (key !== drawnKey) {
    el.innerHTML = svg(rank.belt, rank.stripes, colors);
    drawnKey = key;
  }
  const training = events.some((e) => !e.deleted && (isSession(e) || e.type === 'roll') && e.endAt === undefined && !e.detail?.min);
  const buddy = el.querySelector<SVGSVGElement>('svg.buddy')!;
  buddy.dataset.state = training ? 'training' : 'idle';
}

/** Plays a one-off reaction. */
export function companionReact(r: Reaction) {
  const buddy = host().querySelector<SVGSVGElement>('svg.buddy');
  if (!buddy) return;
  buddy.classList.remove('react-tie', 'react-tap', 'react-cheer');
  void buddy.getBoundingClientRect();
  buddy.classList.add(`react-${r}`);
  clearTimeout(reactTimer);
  reactTimer = window.setTimeout(() => buddy.classList.remove(`react-${r}`), 1200);
}
