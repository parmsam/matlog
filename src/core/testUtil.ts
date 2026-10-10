import type { Detail, EventType, LogEvent } from './types';

let n = 0;
/** A test event; ids are unique per call. */
export function ev(type: EventType, at: number, detail?: Detail, extra: Partial<LogEvent> = {}): LogEvent {
  return { id: `t${++n}`, type, at, createdAt: at, updatedAt: at, ...(detail ? { detail } : {}), ...extra };
}
export const MIN = 60_000;
export const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
