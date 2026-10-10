import { mergeData } from './events';
import type { LogData, LogEvent } from './types';

/**
 * Where the log lives. IndexedDB is primary; localStorage keeps a full mirror as a second on-device copy.
 * Loading merges both, so data missing from one side (evicted, private mode, a bug) comes back from the other.
 */

const DB_NAME = 'matlog';
const DB_VERSION = 1;
export const MIRROR_KEY = 'matlog:v1:mirror';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function readIdb(): Promise<LogEvent[] | null> {
  try {
    const db = await openDb();
    return await new Promise<LogEvent[]>((resolve, reject) => {
      const req = db.transaction('events', 'readonly').objectStore('events').getAll();
      req.onsuccess = () => resolve(req.result as LogEvent[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('matlog: IndexedDB read failed', err);
    return null;
  }
}

export async function writeIdb(events: LogEvent[]): Promise<boolean> {
  if (!events.length) return true;
  try {
    const db = await openDb();
    const tx = db.transaction('events', 'readwrite');
    const store = tx.objectStore('events');
    events.forEach((e) => store.put(e));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
    });
    return true;
  } catch (err) {
    console.warn('matlog: IndexedDB write failed', err);
    return false;
  }
}

export function readMirror(): LogData | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<LogData>;
    return { events: Array.isArray(data.events) ? data.events : [] };
  } catch {
    return null;
  }
}

/** Returns false if the mirror couldn't be written (quota, disabled storage). */
export function writeMirror(data: LogData): boolean {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ events: data.events }));
    return true;
  } catch {
    return false;
  }
}

export interface LoadResult extends LogData {
  /** Events the mirror had that IndexedDB didn't (and were written back). */
  restored: number;
  idbOk: boolean;
}

export async function loadAll(): Promise<LoadResult> {
  const idb = await readIdb();
  const mirror = readMirror() ?? { events: [] };
  const base = { events: idb ?? [] };
  const merged = mergeData(base, mirror);
  const restored = merged.added + merged.updated;
  if (idb && restored) {
    const have = new Set(base.events.map((e) => `${e.id}:${e.updatedAt}`));
    await writeIdb(merged.events.filter((e) => !have.has(`${e.id}:${e.updatedAt}`)));
  }
  return { events: merged.events, restored: idb ? restored : 0, idbOk: !!idb };
}

/** For tests: forget the open connection. */
export function _resetDb() {
  dbPromise?.then((db) => db.close()).catch(() => {});
  dbPromise = null;
}
