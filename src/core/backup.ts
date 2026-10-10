import type { EventType, LogData, LogEvent } from './types';

const TYPES: ReadonlySet<EventType> = new Set(['class', 'open-mat', 'drilling', 'comp', 'roll', 'promotion']);

export interface Backup extends LogData {
  app: 'matlog';
  version: 1;
  exportedAt: number;
}

export const toBackup = (data: LogData, now: number): Backup => ({ app: 'matlog', version: 1, exportedAt: now, events: data.events });

export function backupFilename(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `matlog-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validEvent(e: unknown): e is LogEvent {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    !!x.id &&
    TYPES.has(x.type as EventType) &&
    isNum(x.at) &&
    (x.endAt === undefined || isNum(x.endAt)) &&
    isNum(x.createdAt) &&
    isNum(x.updatedAt) &&
    (x.detail === undefined || (typeof x.detail === 'object' && x.detail !== null))
  );
}

export class BackupError extends Error {}

/** Parses an export. Invalid entries are skipped (and counted) rather than failing the whole import. */
export function parseBackup(text: string): LogData & { skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't valid JSON.");
  }
  const b = data as Partial<Backup>;
  if (!b || typeof b !== 'object' || b.app !== 'matlog') throw new BackupError("That file isn't a matlog export.");
  if (typeof b.version !== 'number' || b.version > 1) throw new BackupError('That export is from a newer version of matlog. Update the app first.');
  const raw = Array.isArray(b.events) ? b.events : [];
  const events = raw.filter(validEvent);
  return { events, skipped: raw.length - events.length };
}
