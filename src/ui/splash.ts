import type { Belt } from '../core/types';

/** Shortest time the splash stays up, so it reads as a moment rather than a flicker. */
export const SPLASH_MIN_MS = 900;
/** It never holds the app longer than this, even if loading is slow. */
export const SPLASH_MAX_MS = 2500;

/** Preview splashes stay up until the knot has tied. */
const PREVIEW_MS = 1400;

/** A belt that slides in and knots itself, in your belt's color and stripes (the rank stored last time). */
const belt = (b: Belt, stripes: number) => `<svg class="splash-mark" viewBox="0 0 120 64" aria-hidden="true" style="--belt: var(--belt-${b}); --belt-bar: ${b === 'black' ? 'var(--k-comp)' : 'var(--belt-black)'}">
  <rect class="splash-belt" x="6" y="22" width="108" height="14" rx="3" />
  <rect class="splash-bar" x="84" y="22" width="20" height="14" />
  ${Array.from({ length: Math.min(4, Math.max(0, stripes)) }, (_, i) => `<rect class="splash-stripe" x="${86.5 + i * 4.4}" y="23.5" width="2.2" height="11" style="animation-delay: ${560 + i * 90}ms" />`).join('')}
  <g class="splash-knot">
    <path class="splash-belt" d="M56 34 L47 58 L54 60 L60 38 Z" />
    <path class="splash-belt" d="M64 34 L73 58 L66 60 L60 38 Z" />
    <rect class="splash-belt" x="52" y="18" width="16" height="22" rx="4" />
  </g>
</svg>`;

/**
 * Branded splash over the app while it opens. It leaves once the log has loaded and the minimum
 * time has passed, or straight away on any tap or key (the tap is swallowed so it never logs).
 * Links that log something (`?do=`) skip it: they should feel instant. A `preview` plays it once
 * over whatever is open (Settings, when your belt changes), so you see how it'll look.
 */
export function showSplash(
  ready: Promise<unknown>,
  { enabled, rank = 'white', stripes = 0, search = location.search, preview = false }: { enabled: boolean; rank?: Belt; stripes?: number; search?: string; preview?: boolean },
) {
  if (!enabled || (!preview && new URLSearchParams(search).has('do'))) return;
  document.querySelector('.splash')?.remove();
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `${belt(rank, stripes)}<p class="splash-name">matlog</p><p class="splash-caption">Every round, logged.</p>`;
  document.body.append(el);
  // An open dialog sits in the top layer; a popover joins it there, above the dialog.
  if (preview && 'showPopover' in el) {
    el.popover = 'manual';
    el.showPopover();
  }

  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    window.removeEventListener('keydown', onKey, true);
    el.classList.add('leaving');
    // Fallback for when animationend never fires (reduced motion, hidden tab).
    const remove = () => el.remove();
    el.addEventListener('animationend', remove, { once: true });
    window.setTimeout(remove, 600);
  };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    leave();
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    leave();
  });
  // The tap that dismisses shouldn't land on a card underneath once the splash is fading.
  el.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey, true);

  const min = new Promise((res) => window.setTimeout(res, preview ? PREVIEW_MS : SPLASH_MIN_MS));
  void Promise.race([Promise.all([ready.catch(() => undefined), min]), new Promise((res) => window.setTimeout(res, SPLASH_MAX_MS))]).then(leave);
}
