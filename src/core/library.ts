import { positionById, TECHNIQUES } from './catalog';
import type { Technique } from './catalog';
import { createEvent } from './events';
import type { CustomTechnique, LogEvent, TechNote, TechNoteKind } from './types';
import { isSession } from './events';
import { techniqueById, techniqueLabel } from './catalog';
import { matchFocus } from './focus';

/**
 * Your library from the log: your own techniques, and your changes to built-in ones (an event whose
 * id is a built-in's). The latest version of each wins; deleted ones are left out.
 */
export function libraryFromLog(events: LogEvent[]): { custom: Technique[]; overrides: Map<string, Partial<Technique>> } {
  const byId = new Map<string, { t: CustomTechnique; at: number }>();
  for (const e of events) {
    const t = e.type === 'technique' && !e.deleted ? e.detail?.technique : undefined;
    if (!t) continue;
    const cur = byId.get(t.id);
    if (!cur || e.updatedAt > cur.at) byId.set(t.id, { t, at: e.updatedAt });
  }
  const custom: Technique[] = [];
  const overrides = new Map<string, Partial<Technique>>();
  for (const { t } of byId.values()) {
    const clean: Technique = { id: t.id, label: t.label, kind: t.kind, from: t.from, to: t.to, ...(t.aka?.length ? { aka: t.aka } : {}), ...(t.parent ? { parent: t.parent } : {}), ...(t.hidden ? { hidden: true } : {}) };
    if (TECHNIQUES.some((x) => x.id === t.id)) overrides.set(t.id, clean);
    else custom.push(clean);
  }
  return { custom, overrides };
}

/** Your own techniques only (kept for callers that don't care about changes to built-ins). */
export const customFromLog = (events: LogEvent[]) => libraryFromLog(events).custom;

export class LibraryError extends Error {}

/**
 * Saves a technique: a new one of your own, an edit to one of yours, or your version of a built-in
 * (same id). Positions must be known ones, and a new name can't take a built-in's.
 */
export function defineTechnique(t: CustomTechnique, now: number): LogEvent {
  const label = t.label.trim().slice(0, 80);
  if (!label) throw new LibraryError('Give it a name.');
  if (!positionById(t.from) || !positionById(t.to)) throw new LibraryError('Pick where it starts and where it ends.');
  if (t.from === t.to) throw new LibraryError('It starts and ends in the same position.');
  const id = (t.id || label).trim();
  const builtIn = TECHNIQUES.some((x) => x.id === id);
  if (!builtIn && TECHNIQUES.some((x) => x.id === id || x.label.toLowerCase() === label.toLowerCase())) throw new LibraryError(`“${label}” is already in the list.`);
  if (t.parent && t.parent === id) throw new LibraryError('A technique can’t be a variation of itself.');
  const aka = [...new Set((t.aka ?? []).map((a) => a.trim()).filter(Boolean))].slice(0, 10);
  const technique: CustomTechnique = { id, label, kind: t.kind, from: t.from, to: t.to, ...(aka.length ? { aka } : {}), ...(t.parent ? { parent: t.parent } : {}), ...(t.hidden && builtIn ? { hidden: true } : {}) };
  return createEvent('technique', now, { technique }, now);
}

// ---------- Notes on techniques ----------

export const NOTE_KINDS: { id: TechNoteKind; label: string; hint: string }[] = [
  { id: 'detail', label: 'Key detail', hint: 'the thing that makes it work; pinned to the top' },
  { id: 'observation', label: 'Observation', hint: 'what you noticed in rounds or drilling' },
  { id: 'question', label: 'Question', hint: 'something to ask or figure out' },
  { id: 'source', label: 'Source', hint: 'an instructional, a video, a coach' },
];

export function newTechNote(technique: string, text: string, now: number, opts: { kind?: TechNoteKind; url?: string } = {}): LogEvent {
  const note: TechNote = { technique, text: text.trim().slice(0, 1000), kind: opts.kind ?? 'observation' };
  const url = opts.url?.trim();
  if (url && /^https?:\/\//i.test(url)) note.url = url.slice(0, 500);
  return createEvent('technote', now, { techNote: note }, now);
}

/** Notes on a technique: key details first, then newest first. */
export function techNotes(events: LogEvent[], technique: string): LogEvent[] {
  return events
    .filter((e) => !e.deleted && e.type === 'technote' && e.detail?.techNote?.technique === technique)
    .sort((a, b) => Number(b.detail!.techNote!.kind === 'detail') - Number(a.detail!.techNote!.kind === 'detail') || b.at - a.at);
}

/** How many notes each technique has. */
export function techNoteCounts(events: LogEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) if (!e.deleted && e.type === 'technote' && e.detail?.techNote) m.set(e.detail.techNote.technique, (m.get(e.detail.techNote.technique) ?? 0) + 1);
  return m;
}

/**
 * What else your log says about a technique: notes from sessions it was tagged in, and problems
 * that name it. Newest first, up to `limit` of each.
 */
export function mentions(events: LogEvent[], technique: string, limit = 5): { sessions: LogEvent[]; problems: LogEvent[]; topic: LogEvent[] } {
  // Its name, its id as words ("knee-cut" → "knee cut") and its other names.
  const t = techniqueById(technique);
  const names = [techniqueLabel(technique), technique.replace(/-/g, ' '), ...(t?.aka ?? [])].map((x) => x.toLowerCase()).filter((x, i, a) => x.length > 2 && a.indexOf(x) === i);
  const live = events.filter((e) => !e.deleted);
  return {
    sessions: live
      .filter((e) => (isSession(e) || e.type === 'study') && e.detail?.note?.trim() && e.detail.techniques?.includes(technique))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit),
    // Sessions whose topic names this technique ("Topic: Knee cut variations").
    topic: live
      .filter((e) => (isSession(e) || e.type === 'study') && e.detail?.topic && matchFocus(e.detail.topic)?.id === technique)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit),
    problems: live
      .filter((e) => e.type === 'problem' && e.detail?.problem && names.some((n) => `${e.detail!.problem!.text} ${e.detail!.problem!.idea ?? ''}`.toLowerCase().includes(n)))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit),
  };
}
