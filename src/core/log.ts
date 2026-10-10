import { loadAll, writeIdb, writeMirror } from './db';
import { mergeData, patchEvent } from './events';
import { loadSettings, saveSettings } from './settings';
import { createStore, persist } from './store';
import type { LogData, LogEvent, Settings } from './types';

/** The app's data, in memory. Every change goes through the functions below, which also persist it. */
export interface AppState {
  events: LogEvent[];
  loaded: boolean;
  /** False if the last localStorage mirror write failed. */
  mirrorOk: boolean;
  /** False if IndexedDB couldn't be opened or written (the mirror still has the data). */
  idbOk: boolean;
}

export const settings = createStore<Settings>(loadSettings());
export const app = createStore<AppState>({ events: [], loaded: false, mirrorOk: true, idbOk: true });

export function setupPersistence() {
  persist(settings, saveSettings);
  window.addEventListener('pagehide', flushMirror);
}

export async function init(): Promise<{ restored: number }> {
  const data = await loadAll();
  app.set({ events: data.events, loaded: true, idbOk: data.idbOk });
  if (data.restored || !data.idbOk) scheduleMirror();
  return { restored: data.restored };
}

export const snapshot = (): LogData => ({ events: app.get().events });
export const live = () => app.get().events.filter((e) => !e.deleted);

let mirrorTimer: number | undefined;
function scheduleMirror() {
  if (mirrorTimer === undefined) mirrorTimer = window.setTimeout(flushMirror, 250);
}
export function flushMirror() {
  if (mirrorTimer !== undefined) clearTimeout(mirrorTimer);
  mirrorTimer = undefined;
  const ok = writeMirror(snapshot());
  if (ok !== app.get().mirrorOk) app.set({ mirrorOk: ok });
}

function put(changed: LogEvent[]) {
  const byId = new Map(changed.map((e) => [e.id, e]));
  const events = app.get().events.map((e) => byId.get(e.id) ?? e);
  const known = new Set(events.map((e) => e.id));
  for (const e of changed) if (!known.has(e.id)) events.push(e);
  app.set({ events });
  void writeIdb(changed).then((ok) => {
    if (ok !== app.get().idbOk) app.set({ idbOk: ok });
  });
  scheduleMirror();
}

export const getEvent = (id: string) => app.get().events.find((e) => e.id === id);

export function addEvent(e: LogEvent): LogEvent {
  put([e]);
  return e;
}

export function addEvents(list: LogEvent[]) {
  if (list.length) put(list);
}

export function updateEvent(id: string, patch: Parameters<typeof patchEvent>[1], now = Date.now()): LogEvent | undefined {
  const e = getEvent(id);
  if (!e) return undefined;
  const next = patchEvent(e, patch, now);
  put([next]);
  return next;
}

export const deleteEvent = (id: string, now = Date.now()) => updateEvent(id, { deleted: true }, now);

/** Undo: put an earlier version back, with a fresh `updatedAt` so the undo wins when merged elsewhere. */
export function revertTo(prev: LogEvent, now = Date.now()) {
  const cur = getEvent(prev.id);
  put([{ ...prev, updatedAt: Math.max(now, (cur?.updatedAt ?? 0) + 1) }]);
}

/** Merges another device's export into this one. */
export async function importData(data: LogData): Promise<{ added: number; updated: number }> {
  const before = snapshot();
  const merged = mergeData(before, data);
  const old = new Map(before.events.map((e) => [e.id, e.updatedAt]));
  const changed = merged.events.filter((e) => old.get(e.id) !== e.updatedAt);
  app.set({ events: merged.events });
  const ok = await writeIdb(changed);
  app.set({ idbOk: ok });
  flushMirror();
  return { added: merged.added, updated: merged.updated };
}
