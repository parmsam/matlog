import { isSession } from './events';
import type { LogEvent, SessionKind } from './types';

export type KindId = SessionKind | 'roll' | 'study';

/** A home-screen card: one tappable thing to log. All of them are timed (tap to start, tap to stop). */
export interface KindDef {
  id: KindId;
  label: string;
  emoji: string;
  /** Keyboard shortcut. */
  key: string;
  /** Length when logged after the fact without a start/stop, unless settings say otherwise. */
  defaultMin: number;
}

export const KINDS: readonly KindDef[] = [
  { id: 'class', label: 'Class', emoji: '🥋', key: 'c', defaultMin: 60 },
  { id: 'open-mat', label: 'Open mat', emoji: '🤼', key: 'o', defaultMin: 60 },
  { id: 'drilling', label: 'Drilling', emoji: '🔁', key: 'd', defaultMin: 45 },
  { id: 'comp', label: 'Comp', emoji: '🏆', key: 'p', defaultMin: 120 },
  { id: 'roll', label: 'Round', emoji: '⏱️', key: 'r', defaultMin: 6 },
  /** Study time (instructionals, notes): logged like the rest, but not mat time. Hidden by default. */
  { id: 'study', label: 'Study', emoji: '📖', key: 's', defaultMin: 10 },
];

export const kindById = (id: KindId) => KINDS.find((k) => k.id === id)!;
export const kindFor = (e: LogEvent): KindDef | undefined => KINDS.find((k) => k.id === e.type);

/** The running session (class, open mat…), if any. Only one runs at a time. */
export const ongoingSession = (events: LogEvent[]) => events.find((e) => !e.deleted && isSession(e) && e.endAt === undefined && !e.detail?.min);
/** The running round, if any. */
export const ongoingRoll = (events: LogEvent[]) => events.find((e) => !e.deleted && e.type === 'roll' && e.endAt === undefined && !e.detail?.min);

export function ongoingFor(events: LogEvent[], id: KindId): LogEvent | undefined {
  if (id === 'roll') return ongoingRoll(events);
  if (id === 'study') return events.find((e) => !e.deleted && e.type === 'study' && e.endAt === undefined && !e.detail?.min);
  const s = ongoingSession(events);
  return s?.type === id ? s : undefined;
}

/** Most recent event of a kind that has started by `now`. */
export function lastOf(events: LogEvent[], id: KindId, now: number): LogEvent | undefined {
  let best: LogEvent | undefined;
  for (const e of events) {
    if (e.deleted || e.type !== id || e.at > now) continue;
    if (!best || e.at > best.at) best = e;
  }
  return best;
}
