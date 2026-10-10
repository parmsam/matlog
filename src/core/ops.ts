import { createEvent } from './events';
import { kindById, ongoingFor, ongoingRoll, ongoingSession, type KindId } from './kinds';
import { addEvent, app, settings, updateEvent } from './log';
import type { Detail, LogEvent } from './types';

/**
 * What logging means, in one place: a card tap, a link action (`?do=`), a pasted Markdown note and
 * `window.matlog` all call these, so they behave the same. No UI here; callers decide how to show it.
 */
export type OpResult =
  | { kind: 'logged' | 'started'; what: KindId; event: LogEvent }
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

/** Log a finished entry: it ended at `at` and lasted `detail.min` (or the default length). */
export function logKind(what: KindId, { at = Date.now(), detail }: OpOptions = {}): OpResult {
  const def = kindById(what);
  const min = detail?.min ?? (what === 'roll' ? def.defaultMin : settings.get().defaultMin || def.defaultMin);
  const event = addEvent(createEvent(what, at - min * MIN, { ...detail, min }, Date.now()));
  return { kind: 'logged', what, event };
}

export function startKind(what: KindId, { at = Date.now(), detail }: OpOptions = {}): OpResult {
  const { events } = app.get();
  const label = kindById(what).label;
  if (ongoingFor(events, what)) return { kind: 'noop', what, reason: `${label} is already going` };
  if (what !== 'roll') {
    const other = ongoingSession(events);
    if (other) {
      const event = updateEvent(other.id, { type: what, detail: { ...other.detail, ...detail } })!;
      return { kind: 'switched', what, event, prev: other };
    }
  }
  const event = addEvent(createEvent(what, Math.min(at, Date.now()), detail, Date.now()));
  return { kind: 'started', what, event };
}

export function stopKind(what: KindId, { at = Date.now(), detail }: OpOptions = {}): OpResult {
  const { events } = app.get();
  const on = ongoingFor(events, what);
  if (!on) return { kind: 'noop', what, reason: `No ${kindById(what).label.toLowerCase()} is going` };
  // Ending a session ends the round inside it too.
  let alsoStopped: { event: LogEvent; prev: LogEvent } | undefined;
  const roll = what !== 'roll' ? ongoingRoll(events) : undefined;
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
