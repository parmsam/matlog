import { dayKey } from '../core/days';
import { injuries } from '../core/injuries';
import { isSession } from '../core/events';
import { app, settings } from '../core/log';
import { currentRank, matMinutes, PATCHES } from '../core/stats';
import type { Belt } from '../core/types';
import { nextLine } from './buddyLines';

/**
 * A little training buddy (a grappler, bear, sloth, octopus, frog or cat). It wears your belt (and stripes), a gi or a rashguard to
 * match the theme, and the patches you've earned. It gets ready while a session runs, ties its
 * belt when one starts, taps out when you log a tap and cheers a finish. Decoration only: it never
 * looks disappointed about anything.
 */

export type Reaction = 'tie' | 'tap' | 'cheer';

const host = () => document.getElementById('companion')!;
let drawnKey = '';
let reactTimer: number | undefined;

export type BuddyId = 'grappler' | 'bear' | 'sloth' | 'octopus' | 'frog' | 'cat';

/**
 * Every buddy shares one rig (body, sleeves and hands, belt and knot, legs, eyes and two mouths),
 * so belt colors, stripes, patches and reactions work for all of them. A character only adds its
 * own colors, head and extras (`back` is drawn behind the body, `head` on top).
 */
interface Character {
  label: string;
  skin: string;
  back?: string;
  head: string;
  /** Eye centers: the blink and highlights use them. */
  eyes: [number, number, number];
}

const eye = (x: number, y: number) => `<circle class="eye" cx="${x}" cy="${y}" r="3.2" /><circle cx="${x + 1.1}" cy="${y - 1.2}" r="1.1" fill="#fff" />`;
const cheeks = (y: number, dx = 12) => `<ellipse cx="${50 - dx}" cy="${y}" rx="4" ry="2.4" fill="#ff8fa3" opacity="0.45" /><ellipse cx="${50 + dx}" cy="${y}" rx="4" ry="2.4" fill="#ff8fa3" opacity="0.45" />`;

export const BUDDIES: Record<BuddyId, Character> = {
  grappler: {
    label: 'Grappler',
    skin: '#f3c9a6',
    eyes: [42, 58, 37],
    head: `<circle class="skin" cx="29.5" cy="38" r="4.5" /><circle class="skin" cx="70.5" cy="38" r="4.5" />
      <circle class="skin" cx="50" cy="36" r="21" />
      <path d="M29.2 34 C28 16 44 12 52 13 C64 13 73 21 70.8 34 C67 27 61 23.5 54 23 C53 25.5 49 27.5 44 27 C38 27 33 29.5 29.2 34 Z" fill="var(--hair, #2b2118)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" />
      ${cheeks(44)}`,
  },
  bear: {
    label: 'Bear',
    skin: '#a8754a',
    eyes: [42, 58, 34],
    head: `<circle class="skin" cx="32" cy="19" r="7" /><circle cx="32" cy="19" r="3.6" fill="#e3c09a" />
      <circle class="skin" cx="68" cy="19" r="7" /><circle cx="68" cy="19" r="3.6" fill="#e3c09a" />
      <circle class="skin" cx="50" cy="36" r="21" />
      <ellipse cx="50" cy="44" rx="10" ry="7.5" fill="#e3c09a" stroke="var(--ink)" stroke-width="1.6" />
      <ellipse cx="50" cy="40.5" rx="3.4" ry="2.4" fill="var(--ink)" />`,
  },
  sloth: {
    label: 'Sloth',
    skin: '#a89a86',
    eyes: [42, 58, 37],
    head: `<circle class="skin" cx="50" cy="36" r="21" />
      <ellipse cx="50" cy="39" rx="16.5" ry="13" fill="#eadfcc" />
      <ellipse cx="41" cy="37.5" rx="6.5" ry="4" fill="#6b5844" transform="rotate(18 41 37.5)" />
      <ellipse cx="59" cy="37.5" rx="6.5" ry="4" fill="#6b5844" transform="rotate(-18 59 37.5)" />
      <ellipse cx="50" cy="42" rx="3" ry="2" fill="var(--ink)" />`,
  },
  octopus: {
    label: 'Octopus',
    skin: '#e98aa9',
    eyes: [42, 58, 38],
    back: `<g fill="none" stroke="var(--ink)" stroke-width="7.5" stroke-linecap="round"><path d="M33 86 C22 90 16 84 20 78" /><path d="M67 86 C78 90 84 84 80 78" /></g>
      <g fill="none" stroke="#e98aa9" stroke-width="4.2" stroke-linecap="round"><path d="M33 86 C22 90 16 84 20 78" /><path d="M67 86 C78 90 84 84 80 78" /></g>`,
    head: `<path class="skin" d="M28 44 C26 18 38 9 50 9 C62 9 74 18 72 44 C72 52 62 57 50 57 C38 57 28 52 28 44 Z" />
      <circle cx="40" cy="20" r="2.2" fill="#c96a8a" /><circle cx="59" cy="17" r="1.6" fill="#c96a8a" /><circle cx="63" cy="25" r="2.4" fill="#c96a8a" />
      ${cheeks(45)}`,
  },
  frog: {
    label: 'Frog',
    skin: '#7cc576',
    eyes: [39, 61, 25],
    head: `<ellipse class="skin" cx="50" cy="40" rx="24" ry="17" />
      <circle class="skin" cx="39" cy="25" r="8.5" /><circle class="skin" cx="61" cy="25" r="8.5" />
      <circle cx="39" cy="25" r="5.6" fill="#fff" /><circle cx="61" cy="25" r="5.6" fill="#fff" />
      ${cheeks(44, 14)}`,
  },
  cat: {
    label: 'Cat',
    skin: '#f0a35e',
    eyes: [42, 58, 37],
    back: `<path d="M70 88 C86 88 88 70 80 64" fill="none" stroke="var(--ink)" stroke-width="8" stroke-linecap="round" /><path d="M70 88 C86 88 88 70 80 64" fill="none" stroke="#f0a35e" stroke-width="4.6" stroke-linecap="round" />`,
    head: `<path class="skin" d="M31 27 L32 9 L46 18 Z" /><path d="M34 22 L34.5 13 L41 18 Z" fill="#ffb3c1" />
      <path class="skin" d="M69 27 L68 9 L54 18 Z" /><path d="M66 22 L65.5 13 L59 18 Z" fill="#ffb3c1" />
      <circle class="skin" cx="50" cy="36" r="21" />
      <path d="M46 18 l1 5 M50 17 v6 M54 18 l-1 5" stroke="#b86a2a" stroke-width="2" stroke-linecap="round" />
      <path d="M48 41 h4 l-2 2.4 Z" fill="#ff8fa3" stroke="var(--ink)" stroke-width="1" stroke-linejoin="round" />
      <path d="M29 41 l9 1 M29 46 l9 -1 M71 41 l-9 1 M71 46 l-9 -1" stroke="var(--ink)" stroke-width="1.1" stroke-linecap="round" opacity="0.7" />`,
  },
};

/** "A different one each day": the same buddy all day, chosen from the day. */
export function buddyFor(choice: string, day: string): BuddyId {
  if (choice in BUDDIES) return choice as BuddyId;
  const ids = Object.keys(BUDDIES) as BuddyId[];
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ids[h % ids.length];
}

export function buddySvg(id: BuddyId, belt: Belt, stripes: number, patchColors: string[], injured = false): string {
  const c = BUDDIES[id];
  const bar = belt === 'black' ? 'var(--k-comp)' : 'var(--belt-black)';
  const barX = 58;
  const stripeMarks = Array.from({ length: stripes }, (_, i) => `<rect class="stripe" x="${barX + 1.6 + i * 2.6}" y="72.6" width="1.4" height="5.8" />`).join('');
  const patches = patchColors
    .slice(0, 4)
    .map((col, i) => `<circle class="patch-mark" cx="${[38, 62, 40, 60][i]}" cy="${[65, 65, 83, 83][i]}" r="2.8" fill="${col}" />`)
    .join('');
  const [lx, rx, ey] = c.eyes;
  const mouthY = id === 'frog' ? 46 : id === 'bear' ? 47 : 47.5;
  const arm = (d: string) => `<path d="${d}" fill="none" stroke="var(--buddy-line)" stroke-width="11" stroke-linecap="round" /><path d="${d}" fill="none" stroke="var(--cloth)" stroke-width="6.6" stroke-linecap="round" />`;
  return `<svg class="buddy" data-buddy="${id}" viewBox="0 0 100 100" role="img" aria-label="Your training buddy, ${c.label}" style="--skin: ${c.skin}; --belt: var(--belt-${belt}); --belt-bar: ${bar}">
    <g class="rig">
      <ellipse cx="50" cy="96.5" rx="24" ry="2.6" fill="currentColor" opacity="0.1" />
      ${c.back ?? ''}
      <rect class="body" x="37.5" y="80" width="10" height="13" rx="4" /><rect class="body" x="52.5" y="80" width="10" height="13" rx="4" />
      <ellipse class="skin" cx="42" cy="94" rx="6" ry="3" /><ellipse class="skin" cx="58" cy="94" rx="6" ry="3" />
      <path class="body" d="M31 84 C29 66 37 57 50 57 C63 57 71 66 69 84 C62 87 38 87 31 84 Z" />
      <path class="lapel" d="M42 58.5 L50 70 L58 58.5" />
      <g class="hand l">${arm('M35 63 C29 67 27 72 27 77')}<circle class="skin" cx="27" cy="79" r="5" /></g>
      <g class="hand r">${arm('M65 63 C71 67 73 72 73 77')}<circle class="skin" cx="73" cy="79" r="5" /></g>
      <rect class="belt" x="31.5" y="72" width="37" height="7" rx="2" />
      <rect class="bar" x="${barX}" y="72.4" width="9" height="6.2" />
      ${stripeMarks}
      <g class="tail">
        <path class="belt" d="M47.5 78 L44 89 L47.5 90 L50 79.5 Z" />
        <path class="belt" d="M52.5 78 L56 89 L52.5 90 L50 79.5 Z" />
        <rect class="belt" x="46" y="71" width="8" height="9" rx="2.4" />
      </g>
      ${patches}
      ${c.head}
      <g class="eyes">${eye(lx, ey)}${eye(rx, ey)}</g>
      <path class="mouth calm" d="M46 ${mouthY} Q50 ${mouthY + 3} 54 ${mouthY}" />
      <path class="mouth happy" d="M44.5 ${mouthY - 1} Q50 ${mouthY + 7} 55.5 ${mouthY - 1} Z" fill="var(--ink)" />
      <path class="sweat" d="M73 22 q3 5 0 7 q-3 -2 0 -7 Z" />
      ${injured ? '<g class="bandage" transform="rotate(-24 61 25)"><rect x="54" y="22" width="14" height="6" rx="2.5" fill="#f2d2a9" stroke="var(--ink)" stroke-width="1.2" /><rect x="59" y="22.6" width="4" height="4.8" fill="#e5bb88" /></g>' : ''}
    </g>
  </svg>`;
}

export function renderCompanion(now = Date.now()) {
  const el = host();
  const prefs = settings.get();
  el.hidden = prefs.companion === 'off';
  if (prefs.companion === 'off') return;
  const id = buddyFor(prefs.companion, dayKey(now));
  const { events } = app.get();
  const rank = currentRank(events, prefs, now);
  const minutes = matMinutes(events, now);
  const colors = PATCHES.filter((p) => prefs.patches.includes(p.id) && minutes >= p.hours * 60).map((p) => p.color);
  // A small bandage while an injury is logged as active. Decoration, never a status.
  const injured = injuries(events, now).active.length > 0;
  const key = `${id}${rank.belt}${rank.stripes}${colors.join()}${injured}`;
  if (key !== drawnKey) {
    el.innerHTML = buddySvg(id, rank.belt, rank.stripes, colors, injured);
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

let sayTimer: number | undefined;
/** Tap the buddy: a line in its own voice, taking turns with shared ones. */
export function companionSay() {
  const prefs = settings.get();
  if (prefs.companion === 'off') return;
  const id = buddyFor(prefs.companion, dayKey(Date.now()));
  let bubble = document.getElementById('buddy-says');
  if (!bubble) {
    bubble = document.createElement('p');
    bubble.id = 'buddy-says';
    bubble.className = 'buddy-says';
    bubble.setAttribute('role', 'status');
    host().after(bubble);
  }
  bubble.textContent = nextLine(id);
  bubble.hidden = false;
  companionReact('cheer');
  clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (bubble!.hidden = true), 3200);
}
