import type { Belt } from '../core/types';

/** Shortest time the splash stays up, so it reads as a moment rather than a flicker. */
export const SPLASH_MIN_MS = 900;
/** It never holds the app longer than this, even if loading is slow. */
export const SPLASH_MAX_MS = 2500;

/** A belt that slides in and knots itself, in your belt's color (the rank stored last time). */
const belt = (b: Belt) => `<svg class="splash-mark" viewBox="0 0 120 64" aria-hidden="true" style="--belt: var(--belt-${b}); --belt-bar: ${b === 'black' ? 'var(--k-comp)' : 'var(--belt-black)'}">
  <rect class="splash-belt" x="6" y="22" width="108" height="14" rx="3" />
  <rect class="splash-bar" x="84" y="22" width="20" height="14" />
  <g class="splash-knot">
    <path class="splash-belt" d="M56 34 L47 58 L54 60 L60 38 Z" />
    <path class="splash-belt" d="M64 34 L73 58 L66 60 L60 38 Z" />
    <rect class="splash-belt" x="52" y="18" width="16" height="22" rx="4" />
  </g>
</svg>`;

/**
 * Branded splash over the app while it opens. It leaves once the log has loaded and the minimum
 * time has passed, or straight away on any tap or key (the tap is swallowed so it never logs).
 * Links that log something (`?do=`) skip it: they should feel instant.
 */
export function showSplash(ready: Promise<unknown>, { enabled, rank = 'white', search = location.search }: { enabled: boolean; rank?: Belt; search?: string }) {
  if (!enabled || new URLSearchParams(search).has('do')) return;
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `${belt(rank)}<p class="splash-name">matlog</p><p class="splash-caption">Every round, logged.</p>`;
  document.body.append(el);

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

  const min = new Promise((res) => window.setTimeout(res, SPLASH_MIN_MS));
  void Promise.race([Promise.all([ready.catch(() => undefined), min]), new Promise((res) => window.setTimeout(res, SPLASH_MAX_MS))]).then(leave);
}
