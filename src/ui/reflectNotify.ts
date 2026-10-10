import { kindById, type KindId } from '../core/kinds';
import { app, getEvent, settings } from '../core/log';
import { reflectionDue } from '../core/notebook';
import { openReflect } from './reflectView';

/**
 * A system notification when a reflection comes due, so a laptop with matlog open in a background
 * tab or window gets a nudge. The banner on the home screen is still the main prompt: there's no
 * server, so nothing can arrive while the app is closed, and phones pause it soon after you switch away.
 */

const KEY = 'matlog:v1:reflect-notified';

export const canNotify = () => 'Notification' in window;

/** Asks for permission (call from a tap). True when notifications may be shown. */
export async function askToNotify(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

function notified(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...notified(), id].slice(-30)));
  } catch {
    /* storage off: it may notify again after a reload */
  }
}

/** Shows the notification once per session, only while you're looking at something else. Safe to call often. */
export function checkReflectNotify(now = Date.now()) {
  if (!settings.get().reflectNotify || !canNotify() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const s = reflectionDue(app.get().events, settings.get(), now);
  if (!s || notified().includes(s.id)) return;
  remember(s.id);
  try {
    const n = new Notification('How did it go?', {
      body: `Reflect on ${kindById(s.type as KindId).label.toLowerCase()}: five minutes in the notebook.`,
      tag: `reflect-${s.id}`,
      icon: './pwa-192.png',
    });
    n.onclick = () => {
      window.focus();
      n.close();
      const e = getEvent(s.id);
      if (e) openReflect(e);
    };
  } catch {
    /* Some browsers (Android Chrome) only show notifications from a service worker. */
  }
}
