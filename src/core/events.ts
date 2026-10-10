import type { Detail, EventType, LogData, LogEvent, SessionKind } from './types';

export const SESSION_KINDS: readonly SessionKind[] = ['class', 'open-mat', 'drilling', 'comp'];
export const isSession = (e: { type: EventType }): boolean => (SESSION_KINDS as readonly string[]).includes(e.type);
/** Types that run from a start to an end (tap to start, tap to stop). */
export const isTimedType = (t: EventType) => t !== 'promotion' && t !== 'focus' && t !== 'problem' && t !== 'technique' && t !== 'injury' && t !== 'technote';
/** Notebook entries (focuses and problems): not training, never on a timeline. */
export const isNotebook = (e: { type: EventType }) => e.type === 'focus' || e.type === 'problem' || e.type === 'technique' || e.type === 'injury' || e.type === 'technote';
/** Running: timed, not ended, and not a finished entry logged with a length. */
export const isOngoing = (e: LogEvent) => !e.deleted && isTimedType(e.type) && e.endAt === undefined && !e.detail?.min;

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEvent(type: EventType, at: number, detail: Detail | undefined, now: number, endAt?: number): LogEvent {
  const e: LogEvent = { id: newId(), type, at, createdAt: now, updatedAt: now };
  if (endAt !== undefined) e.endAt = endAt;
  const clean = cleanDetail(detail);
  if (clean) e.detail = clean;
  return e;
}

/** Returns a new event with the patch applied and `updatedAt` bumped. */
export function patchEvent(e: LogEvent, patch: Partial<Omit<LogEvent, 'id' | 'createdAt'>>, now: number): LogEvent {
  const next: LogEvent = { ...e, ...patch, updatedAt: Math.max(now, e.updatedAt + 1) };
  if ('endAt' in patch && patch.endAt === undefined) delete next.endAt;
  if ('detail' in patch) {
    const clean = cleanDetail(patch.detail);
    if (clean) next.detail = clean;
    else delete next.detail;
  }
  return next;
}

/** Drops empty fields (and empty lists) so stored events stay small and comparable. */
export function cleanDetail(d: Detail | undefined): Detail | undefined {
  if (!d) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
    if (Array.isArray(v)) {
      const list = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
      if (list.length) out[k] = list;
      continue;
    }
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim();
      continue;
    }
    out[k] = v;
  }
  return Object.keys(out).length ? (out as Detail) : undefined;
}

export interface MergeResult extends LogData {
  added: number;
  updated: number;
}

/**
 * Merges another copy of the log into ours by id; newest `updatedAt` wins. Soft deletes merge like
 * any edit, so a delete on one device carries over. Merging the same data twice changes nothing.
 */
export function mergeData(ours: LogData, theirs: LogData): MergeResult {
  let added = 0;
  let updated = 0;
  const events = new Map(ours.events.map((e) => [e.id, e]));
  for (const e of theirs.events) {
    const mine = events.get(e.id);
    if (!mine) {
      events.set(e.id, e);
      if (!e.deleted) added++;
    } else if (e.updatedAt > mine.updatedAt) {
      events.set(e.id, e);
      updated++;
    }
  }
  return { events: [...events.values()].sort((a, b) => a.at - b.at), added, updated };
}

/** When an event ends: ongoing ones run until `now`; one logged with a length runs that long. */
export function spanEnd(e: LogEvent, now: number): number {
  if (e.endAt !== undefined) return e.endAt;
  if (isOngoing(e)) return Math.max(now, e.at);
  return e.at + (e.detail?.min ?? 0) * 60_000;
}

/** Minutes on the mat for a session (rolls inside sessions aren't counted twice). */
export const minutesOf = (e: LogEvent, now: number) => Math.max(0, Math.round((spanEnd(e, now) - e.at) / 60_000));
