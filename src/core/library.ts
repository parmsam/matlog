import { positionById, TECHNIQUES } from './catalog';
import type { Technique } from './catalog';
import { createEvent } from './events';
import type { CustomTechnique, LogEvent } from './types';

/** Your own techniques from the log: the latest version of each, deleted ones left out. */
export function customFromLog(events: LogEvent[]): Technique[] {
  const byId = new Map<string, { t: CustomTechnique; at: number }>();
  for (const e of events) {
    const t = e.type === 'technique' && !e.deleted ? e.detail?.technique : undefined;
    if (!t || TECHNIQUES.some((x) => x.id === t.id)) continue;
    const cur = byId.get(t.id);
    if (!cur || e.updatedAt > cur.at) byId.set(t.id, { t, at: e.updatedAt });
  }
  return [...byId.values()].map(({ t }) => ({ id: t.id, label: t.label, kind: t.kind, from: t.from, to: t.to, aka: t.aka }));
}

export class LibraryError extends Error {}

/** A new technique of your own, or the same id redefined. Positions must be known ones. */
export function defineTechnique(t: CustomTechnique, now: number): LogEvent {
  const label = t.label.trim().slice(0, 80);
  if (!label) throw new LibraryError('Give it a name.');
  if (!positionById(t.from) || !positionById(t.to)) throw new LibraryError('Pick where it starts and where it ends.');
  if (t.from === t.to) throw new LibraryError('It starts and ends in the same position.');
  const id = (t.id || label).trim();
  if (TECHNIQUES.some((x) => x.id === id || x.label.toLowerCase() === label.toLowerCase())) throw new LibraryError(`“${label}” is already in the list.`);
  return createEvent('technique', now, { technique: { id, label, kind: t.kind, from: t.from, to: t.to } }, now);
}
