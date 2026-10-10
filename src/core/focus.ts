import { positionById, resolvePosition, resolveSub, resolveTechnique, SUBMISSIONS, techniqueById } from './catalog';
import { isSession, spanEnd } from './events';
import type { FocusEntry, LogEvent, Settings } from './types';

/**
 * "Working on": a line you write for yourself. When it names a technique, position or submission
 * matlog knows, it counts what happened since you set it. It only ever describes; it never picks a
 * focus for you or says whether it's going well.
 */

export type FocusMatch = { kind: 'technique' | 'position' | 'sub'; id: string } | null;

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Finds the technique, position or submission a focus names ("knee cut", "escaping half guard", "triangle defense"). */
export function matchFocus(text: string, used: string[] = []): FocusMatch {
  const n = norm(text);
  if (!n) return null;
  // Your own free-text techniques first (exact), then the catalog, trying longer phrases before shorter ones.
  const own = used.find((u) => !techniqueById(u) && norm(u) === n);
  if (own) return { kind: 'technique', id: own };
  const words = n.split(' ');
  for (let len = Math.min(words.length, 5); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      // A submission ("triangle") counts both finishes and taps, so it wins over the technique of the same name.
      const s = resolveSub(phrase);
      if (SUBMISSIONS.some((x) => x.id === s)) return { kind: 'sub', id: s };
      const t = resolveTechnique(phrase);
      if (techniqueById(t)) return { kind: 'technique', id: t };
      const p = resolvePosition(phrase);
      if (positionById(p) && p !== 'submission') return { kind: 'position', id: p };
    }
  }
  return null;
}

export interface FocusProgress {
  sessions: number;
  /** Sessions it was tagged in (techniques). */
  drilled: number;
  /** Rounds you went for it, and landed it (techniques). */
  attempts: number;
  landed: number;
  /** Rounds you noted getting stuck there (positions). */
  stuck: number;
  /** Rounds you finished it, and tapped to it (submissions). */
  hit: number;
  tapped: number;
}

/** What happened since the focus was set: anything that ended after it (a round you just finished counts). */
export function focusProgress(events: LogEvent[], match: FocusMatch, since: number, now: number): FocusProgress {
  const live = events.filter((e) => !e.deleted && spanEnd(e, now) >= since && e.at <= now);
  const out: FocusProgress = { sessions: live.filter(isSession).length, drilled: 0, attempts: 0, landed: 0, stuck: 0, hit: 0, tapped: 0 };
  if (!match) return out;
  for (const e of live) {
    const d = e.detail ?? {};
    if (isSession(e) && match.kind === 'technique' && d.techniques?.includes(match.id)) out.drilled++;
    if (e.type !== 'roll') continue;
    if (match.kind === 'technique') {
      const landed = !!d.landed?.includes(match.id);
      if (landed) out.landed++;
      if (landed || d.tried?.includes(match.id)) out.attempts++;
    }
    if (match.kind === 'position' && d.stuck?.includes(match.id)) out.stuck++;
    if (match.kind === 'sub') {
      if (d.subsFor?.includes(match.id)) out.hit++;
      if (d.subsAgainst?.includes(match.id)) out.tapped++;
    }
  }
  return out;
}

/** Setting a new focus files the old one in history. */
export function setFocus(s: Pick<Settings, 'focus' | 'focusSince' | 'focusHistory'>, text: string, now: number): Pick<Settings, 'focus' | 'focusSince' | 'focusHistory'> {
  const next = text.trim().slice(0, 140);
  if (next === s.focus.trim()) return { focus: s.focus, focusSince: s.focusSince, focusHistory: s.focusHistory };
  let history: FocusEntry[] = s.focusHistory;
  if (s.focus.trim()) history = [{ text: s.focus.trim(), from: s.focusSince ?? now, to: now }, ...history];
  history = history.filter((h, i) => i === 0 || norm(h.text) !== norm(next)).filter((h) => norm(h.text) !== norm(next) || !next).slice(0, 12);
  return { focus: next, focusSince: next ? now : null, focusHistory: history };
}
