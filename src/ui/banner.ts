import { app, settings } from '../core/log';
import { reflectionDue } from '../core/notebook';
import { kindById, type KindId } from '../core/kinds';
import { dayDate, dayKey } from '../core/days';
import { backupBanner, backupLater, backUpNow } from './backup';
import { esc } from './dom';
import { openReflect } from './reflectView';

/**
 * One banner under the hero, one message at a time: the backup reminder first (the browser is the
 * only copy), then the reflection prompt, then a one-time tip. Safe to call often.
 */

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

interface Tip {
  id: string;
  html: string;
  when?: () => boolean;
}

export const TIPS: Tip[] = [
  { id: 'welcome', html: '👋 <b>Tap a card when you bow in</b>, tap it again when you’re done. Hold a card to log one you already did.' },
  { id: 'install', html: '📲 <b>Add matlog to your Home Screen</b> so iPhone keeps your log: Share → Add to Home Screen.', when: () => isIos() && !isStandalone() },
  { id: 'install-android', html: '📲 <b>Install matlog</b>: ⋮ menu → Add to Home screen. It works offline.', when: () => isAndroid() && !isStandalone() },
  { id: 'focus', html: '🎯 <b>What are you working on?</b> Tap the card up top to set a focus and work it in 1–2 week blocks.' },
  { id: 'reflect', html: '📓 <b>A while after a session</b>, matlog asks how it went: a five-minute notebook, not a test. Change when in Settings.' },
  { id: 'clock', html: '⏱️ <b>Open mat?</b> The round clock (<kbd>K</kbd>, or the timer up top) times rounds and rest and keeps the screen on.' },
  { id: 'paste', html: '📋 <b>Keep notes elsewhere?</b> Paste a class note (<kbd>V</kbd>) and it becomes a session with its rounds and problems.' },
  { id: 'links', html: '🔗 <b>Siri and Shortcuts</b>: Settings → Shortcuts and Siri has links that log a class in one tap.' },
];

/** Tips that apply on this device and haven't been dismissed. */
const dueTips = () => TIPS.filter((t) => !settings.get().tipsSeen.includes(t.id) && (t.when?.() ?? true));
let browsing = 0;

export function showBanner() {
  const el = document.getElementById('banner')!;
  if (!app.get().loaded) return;
  let html = backupBanner();
  if (!html) {
    const s = reflectionDue(app.get().events, settings.get(), Date.now());
    if (s) {
      const k = kindById(s.type as KindId);
      const day = dayKey(s.at) === dayKey(Date.now()) ? 'today’s' : `${dayDate(dayKey(s.at)).toLocaleDateString(undefined, { weekday: 'long' })}’s`;
      html = `<span>📓 <b>Reflect on ${day} ${esc(k.label.toLowerCase())}</b>: a problem you hit, an idea to try. Five minutes.</span><span class="head-actions"><button type="button" class="chip" data-reflect-later="${s.id}">Not now</button><button type="button" class="chip primary" data-reflect="${s.id}">Reflect</button></span>`;
    }
  }
  if (!html) {
    const tips = dueTips();
    if (tips.length) {
      const t = tips[browsing % tips.length];
      html = `<span>${t.html}</span><span class="head-actions">${tips.length > 1 ? `<span class="tip-count">${(browsing % tips.length) + 1}/${tips.length}</span><button type="button" class="chip" data-tip-next>Next ›</button>` : ''}<button type="button" class="chip primary" data-tip-ok="${t.id}">Got it</button></span>`;
    }
  }
  if (!html) {
    el.hidden = true;
    return;
  }
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = false;
}

export function mountBanner() {
  document.getElementById('banner')!.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    const d = t.dataset;
    if (d.backup !== undefined) void backUpNow().then(showBanner);
    else if (d.backupLater !== undefined) backupLater();
    else if (d.reflect) {
      const s = app.get().events.find((x) => x.id === d.reflect);
      if (s) openReflect(s);
    } else if (d.reflectLater) settings.set({ reflectSkipped: [...settings.get().reflectSkipped, d.reflectLater].slice(-30) });
    else if (d.tipNext !== undefined) browsing++;
    else if (d.tipOk) {
      // Browsing doesn't mark tips seen; only "Got it" does. Then start again from the first one left.
      browsing = 0;
      settings.set({ tipsSeen: [...new Set([...settings.get().tipsSeen, d.tipOk])] });
    }
    showBanner();
  });
}
