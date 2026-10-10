import { positionById, resolvePosition, resolveSub, resolveTechnique, SUBMISSIONS, techniqueById } from './catalog';
import { dayKey, dayStart } from './days';
import { createEvent, isSession, spanEnd } from './events';
import type { FocusBlock, FocusDetail, FocusRole, LogEvent, Settings } from './types';

/**
 * Focuses: what you're working on, in blocks ("about 2 weeks on, a break, then come back"). Each is
 * an event in the log, so it backs up and merges like everything else. You write them; matlog
 * never picks one. When a focus names a technique, position or submission matlog knows, it counts
 * what happened during each block. It describes; it never says whether it's going well.
 */

const DAY = 86_400_000;

export const FOCUS_ROLES: { id: FocusRole; label: string; hint: string }[] = [
  { id: 'main', label: 'Main skill', hint: 'the one you are building now' },
  { id: 'complement', label: 'Complementary', hint: 'connects to the main skill' },
  { id: 'habit', label: 'Habit', hint: 'a small change that makes what you do work better' },
  { id: 'experiment', label: 'Experiment', hint: 'trying something out' },
  { id: 'side', label: 'Side project', hint: 'just because it interests you' },
];
export const roleLabel = (r: FocusRole) => FOCUS_ROLES.find((x) => x.id === r)?.label ?? r;

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
  /** Rounds you noted getting stuck there (positions), and rounds that started there. */
  stuck: number;
  started: number;
  /** Rounds you finished it, and tapped to it (submissions). */
  hit: number;
  tapped: number;
}

/** What happened between `from` and `to`: anything that ended after `from` (a round you just finished counts). */
export function focusProgress(events: LogEvent[], match: FocusMatch, from: number, to: number): FocusProgress {
  const live = events.filter((e) => !e.deleted && spanEnd(e, to) >= from && e.at <= to);
  const out: FocusProgress = { sessions: live.filter(isSession).length, drilled: 0, attempts: 0, landed: 0, stuck: 0, started: 0, hit: 0, tapped: 0 };
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
    if (match.kind === 'position') {
      if (d.stuck?.includes(match.id)) out.stuck++;
      if (d.start === match.id) out.started++;
    }
    if (match.kind === 'sub') {
      if (d.subsFor?.includes(match.id)) out.hit++;
      if (d.subsAgainst?.includes(match.id)) out.tapped++;
    }
  }
  return out;
}

/** Reps today: rounds today where you landed it (technique) or finished it (submission). */
export function repsToday(events: LogEvent[], match: FocusMatch, now: number): number {
  if (!match || match.kind === 'position') return 0;
  const p = focusProgress(events, match, dayStart(dayKey(now)), now);
  return match.kind === 'sub' ? p.hit : p.landed;
}

// ---------- Blocks ----------

export type FocusState = 'active' | 'over' | 'resting' | 'done';

export interface FocusView {
  event: LogEvent;
  f: FocusDetail;
  state: FocusState;
  /** The block running now (active or over), or the last one. */
  block: FocusBlock;
  /** Week of the current block, 1-based, and how many weeks a block has. */
  week: number;
  weeks: number;
  /** When the current block is planned to end. */
  ends: number;
  /** Resting: since when. */
  restingSince?: number;
}

export function focusView(e: LogEvent, now: number): FocusView | null {
  const f = e.detail?.focus;
  if (!f || !f.blocks.length) return null;
  const block = f.blocks[f.blocks.length - 1];
  const ends = block.from + f.blockDays * DAY;
  const weeks = Math.max(1, Math.round(f.blockDays / 7));
  const week = Math.max(1, Math.floor((Math.min(now, block.to ?? now) - block.from) / (7 * DAY)) + 1);
  let state: FocusState;
  if (f.doneAt) state = 'done';
  else if (block.to !== undefined) state = 'resting';
  else state = now >= ends ? 'over' : 'active';
  return { event: e, f, state, block, week, weeks, ends, restingSince: state === 'resting' ? block.to : undefined };
}

const ORDER: Record<FocusState, number> = { over: 0, active: 1, resting: 2, done: 3 };
const ROLE_ORDER: Record<FocusRole, number> = { main: 0, complement: 1, habit: 2, experiment: 3, side: 4 };

/** All focuses: running ones first (main skill first), then resting, then done. */
export function focuses(events: LogEvent[], now: number): FocusView[] {
  return events
    .filter((e) => !e.deleted && e.type === 'focus')
    .map((e) => focusView(e, now))
    .filter((v): v is FocusView => !!v)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || ROLE_ORDER[a.f.role] - ROLE_ORDER[b.f.role] || b.block.from - a.block.from);
}

export const runningFocuses = (events: LogEvent[], now: number) => focuses(events, now).filter((v) => v.state === 'active' || v.state === 'over');

export function newFocus(text: string, now: number, opts: Partial<Omit<FocusDetail, 'text' | 'blocks'>> = {}): LogEvent {
  const focus: FocusDetail = {
    text: text.trim().slice(0, 140),
    role: opts.role ?? 'main',
    blockDays: opts.blockDays === 7 ? 7 : 14,
    blocks: [{ from: now }],
    ...(opts.ifWorks?.trim() ? { ifWorks: opts.ifWorks.trim().slice(0, 140) } : {}),
    ...(opts.ifFails?.trim() ? { ifFails: opts.ifFails.trim().slice(0, 140) } : {}),
    ...(opts.target && opts.target > 0 ? { target: Math.min(20, Math.round(opts.target)) } : {}),
  };
  return createEvent('focus', now, { focus }, now);
}

/** Ends the current block and rests the focus. */
export function restFocus(f: FocusDetail, now: number): FocusDetail {
  const blocks = f.blocks.map((b, i) => (i === f.blocks.length - 1 && b.to === undefined ? { ...b, to: Math.min(now, b.from + f.blockDays * DAY) } : b));
  return { ...f, blocks };
}

/** Starts another block: right away after a block that's over, or coming back after a rest. */
export function nextBlock(f: FocusDetail, now: number): FocusDetail {
  const rested = restFocus(f, now);
  const { doneAt: _done, ...rest } = rested;
  void _done;
  return { ...rest, blocks: [...rested.blocks, { from: now }] };
}

export function finishFocus(f: FocusDetail, now: number): FocusDetail {
  return { ...restFocus(f, now), doneAt: now };
}

/** Each block's numbers, oldest first: comparing them shows what was kept over a break. */
export function blockProgress(events: LogEvent[], f: FocusDetail, used: string[], now: number): (FocusProgress & FocusBlock)[] {
  const m = matchFocus(f.text, used);
  return f.blocks.map((b) => ({ ...b, ...focusProgress(events, m, b.from, b.to ?? now) }));
}

/** v0.2 kept one "Working on" line (and its history) in settings: it becomes focus events. */
export function migrateFocus(s: Pick<Settings, 'focus' | 'focusSince' | 'focusHistory'>, events: LogEvent[], now: number): LogEvent[] {
  if (events.some((e) => e.type === 'focus')) return [];
  const out: LogEvent[] = [];
  for (const h of s.focusHistory) {
    const e = newFocus(h.text, h.from);
    e.detail!.focus = { ...e.detail!.focus!, blocks: [{ from: h.from, to: h.to }], doneAt: h.to };
    out.push(e);
  }
  if (s.focus.trim()) out.push(newFocus(s.focus, s.focusSince ?? now));
  return out;
}
