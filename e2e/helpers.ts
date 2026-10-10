import { test as base, expect, type Page } from '@playwright/test';
import type { LogEvent, Settings } from '../src/core/types';

/** `test` that fails if the page throws an uncaught error. */
export const test = base.extend<{ noPageErrors: void }>({
  noPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use();
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const MIN = 60_000;

interface Seed {
  events?: LogEvent[];
  settings?: Partial<Settings>;
  mirrorOnly?: boolean;
}

/** Loads the app from a known state, resetting storage from a same-origin page that isn't the app. */
export async function open(page: Page, seed: Seed = {}, path = './') {
  await page.goto('./favicon.svg');
  await page.evaluate(async (seed) => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase('matlog');
      r.onsuccess = r.onerror = r.onblocked = () => res(null);
    });
    localStorage.setItem('matlog:v1:settings', JSON.stringify({ theme: 'nogi', ...seed.settings }));
    const events = seed.events ?? [];
    if (seed.mirrorOnly) {
      localStorage.setItem('matlog:v1:mirror', JSON.stringify({ events }));
      return;
    }
    if (!events.length) return;
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open('matlog', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('events', { keyPath: 'id' });
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const tx = r.result.transaction('events', 'readwrite');
        events.forEach((e) => tx.objectStore('events').put(e));
        tx.oncomplete = () => {
          r.result.close();
          res();
        };
      };
    });
  }, seed);
  await page.goto(path);
  await expect(page.locator('html[data-ready]')).toBeAttached();
}

/** Events as persisted in IndexedDB. */
export async function storedEvents(page: Page): Promise<LogEvent[]> {
  return page.evaluate(
    () =>
      new Promise<LogEvent[]>((res, rej) => {
        const r = indexedDB.open('matlog', 1);
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const q = r.result.transaction('events').objectStore('events').getAll();
          q.onsuccess = () => {
            r.result.close();
            res((q.result as LogEvent[]).filter((e) => !e.deleted));
          };
        };
      }),
  );
}

export function ev(type: LogEvent['type'], at: number, extra: Partial<LogEvent> = {}): LogEvent {
  return { id: `e-${type}-${at}-${Math.random().toString(36).slice(2, 7)}`, type, at, createdAt: at, updatedAt: at, ...extra };
}

export const card = (page: Page, id: string) => page.locator(`[data-card="${id}"]`);
export const toastEl = (page: Page) => page.locator('.toast:not(.leaving)');
