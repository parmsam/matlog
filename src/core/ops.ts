import { createEvent } from './events';
import { kindById, ongoingFor, ongoingRoll, ongoingSession, type KindId } from './kinds';
import { addEvent, app, settings, updateEvent } from './log';
import type { Detail, LogEvent } from './types';

/**
 * What logging means, in one place: a card tap, a link action (`?do=`), a pasted Markdown note and
 * `window.matlog` all call these, so they behave the same. No UI here; callers decide how to show it.
 */
export type OpResult =
  /** `snappedFrom`: the start before it was moved to the hour (classes), so the UI can offer the exact time. */
  | { kind: 'logged' | 'started'; what: KindId; event: LogEvent; snappedFrom?: number }
  | { kind: 'stopped'; what: KindId; event: LogEvent; prev: LogEvent; alsoStopped?: { event: LogEvent; prev: LogEvent } }
  /** A running session changed kind (class ran into open mat) instead of starting a second one. */
  | { kind: 'switched'; what: KindId; event: LogEvent; prev: LogEvent }
  | { kind: 'noop'; what: KindId; reason: string };

export interface OpOptions {
  /** When it happened: the start for start/toggle, the end for a finished entry. */
  at?: number;
  detail?: Detail;
}

const MIN = 60_000;
/** A tap this long after the hour still counts as starting on the hour. */
export const ON_HOUR_GRACE = 10 * MIN;

const floorHour = (ts: number) => {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/**
 * Classes start on the hour. A class you start live within 10 minutes after the hour starts on the
 * hour; one logged after the fact starts on the hour at or before when it would otherwise have
 * started (finished at 8:10 after an hour → 7:00). `live` is false for logged-after-the-fact.
 */
export function classStart(start: number, live: boolean): number {
  const h = floorHour(start);
  if (!live) return h;
  return start - h <= ON_HOUR_GRACE ? h : start;
}

/** Log a finished entry: it ended at `at` and lasted `detail.min` (or the default length). */
export function logKind(what: KindId, { at = Date.now(), detail }: OpOptions = {}): OpResult {
  const def = kindById(what);
  const min = detail?.min ?? (what === 'roll' ? settings.get().roundMin : what === 'study' ? def.defaultMin : settings.get().defaultMin || def.defaultMin);
  const exact = at - min * MIN;
  const start = what === 'class' && settings.get().classOnHour ? classStart(exact, false) : exact;
  const event = addEvent(createEvent(what, start, { ...detail, min }, Date.now()));
  return { kind: 'logged', what, event, ...(start !== exact ? { snappedFrom: exact } : {}) };
}

export function startKind(what: KindId, { at = Date.now(), detail }: OpOptions = {}): OpResult {
  const { events } = app.get();
  const label = kindById(what).label;
  if (ongoingFor(events, what)) return { kind: 'noop', what, reason: `${label} is already going` };
  if (what !== 'roll' && what !== 'study') {
    const other = ongoingSession(events);
    if (other) {
      const event = updateEvent(other.id, { type: what, detail: { ...other.detail, ...detail } })!;
      return { kind: 'switched', what, event, prev: other };
    }
  }
  const exact = Math.min(at, Date.now());
  const start = what === 'class' && settings.get().classOnHour ? classStart(exact, true) : exact;
  const event = addEvent(createEvent(what, start, detail, Date.now()));
  return { kind: 'started', what, event, ...(start !== exact ? { snappedFrom: exact } : {}) };
}

export function stopKind(what: KindId, { at = Date.now(), detail }: OpOptions = {}): OpResult {
  const { events } = app.get();
  const on = ongoingFor(events, what);
  if (!on) return { kind: 'noop', what, reason: `No ${kindById(what).label.toLowerCase()} is going` };
  // Ending a session ends the round inside it too.
  let alsoStopped: { event: LogEvent; prev: LogEvent } | undefined;
  const roll = what !== 'roll' && what !== 'study' ? ongoingRoll(events) : undefined;
  if (roll) alsoStopped = { prev: roll, event: updateEvent(roll.id, { endAt: Math.max(at, roll.at) })! };
  const patch = detail ? { endAt: Math.max(at, on.at), detail: { ...on.detail, ...detail } } : { endAt: Math.max(at, on.at) };
  const event = updateEvent(on.id, patch)!;
  return { kind: 'stopped', what, event, prev: on, alsoStopped };
}

export function toggleKind(what: KindId, opts: OpOptions = {}): OpResult {
  return ongoingFor(app.get().events, what) ? stopKind(what, opts) : startKind(what, opts);
}

/** Records a promotion (belt and stripes) on a day. */
export function promote(at: number, detail: Pick<Detail, 'belt' | 'stripes' | 'note'>): LogEvent {
  return addEvent(createEvent('promotion', at, detail, Date.now()));
}
