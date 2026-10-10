import { createEvent, isSession, spanEnd } from './events';
import type { LogEvent, ProblemDetail, Settings } from './types';

/**
 * Problems and reflection: "find problems, solve them", written down later, not straight after
 * training. A problem is an event with an idea to try and, eventually, when it was solved. The
 * reflection prompt asks about a session a while after it ends; it never asks twice.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const PROBLEM_SOURCES = [
  { id: 'internal', label: 'I noticed it', hint: 'reflecting on rolls, your own footage' },
  { id: 'external', label: 'Someone told me', hint: 'a coach, a partner, someone reviewing footage' },
  { id: 'predictive', label: 'I see it coming', hint: 'what your game will run into next' },
] as const;

export function newProblem(text: string, now: number, p: Partial<Omit<ProblemDetail, 'text'>> = {}): LogEvent {
  const problem: ProblemDetail = { text: text.trim().slice(0, 300) };
  if (p.source) problem.source = p.source;
  if (p.idea?.trim()) problem.idea = p.idea.trim().slice(0, 300);
  if (p.tinkered) problem.tinkered = true;
  if (p.sessionId) problem.sessionId = p.sessionId;
  if (p.solvedAt) problem.solvedAt = p.solvedAt;
  return createEvent('problem', now, { problem }, now);
}

export interface Problems {
  open: LogEvent[];
  solved: LogEvent[];
}

/** Open problems (newest first) and solved ones (most recently solved first). */
export function problems(events: LogEvent[]): Problems {
  const all = events.filter((e) => !e.deleted && e.type === 'problem' && e.detail?.problem);
  return {
    open: all.filter((e) => !e.detail!.problem!.solvedAt).sort((a, b) => b.at - a.at),
    solved: all.filter((e) => e.detail!.problem!.solvedAt).sort((a, b) => b.detail!.problem!.solvedAt! - a.detail!.problem!.solvedAt!),
  };
}

/** Problems that came up in a session. */
export const problemsFor = (sessionId: string, events: LogEvent[]) => events.filter((e) => !e.deleted && e.type === 'problem' && e.detail?.problem?.sessionId === sessionId);

/**
 * The session to reflect on now, if any: the most recent finished session that ended at least
 * `reflectAfter` minutes ago and within the last 36 hours, hasn't been reflected on, and wasn't put off.
 */
export function reflectionDue(events: LogEvent[], s: Pick<Settings, 'reflectAfter' | 'reflectSkipped'>, now: number): LogEvent | null {
  if (s.reflectAfter < 0) return null;
  let best: LogEvent | null = null;
  for (const e of events) {
    if (e.deleted || !isSession(e) || e.detail?.reflectedAt) continue;
    const running = e.endAt === undefined && !e.detail?.min;
    if (running) continue;
    const end = spanEnd(e, now);
    if (now - end < s.reflectAfter * MIN || now - end > 36 * HOUR) continue;
    if (s.reflectSkipped.includes(e.id)) continue;
    if (!best || end > spanEnd(best, now)) best = e;
  }
  return best;
}

export interface ProcessStats {
  sessions: number;
  reflected: number;
  /** Sessions with an enjoyment rating, and its average (null without any). */
  rated: number;
  enjoyAvg: number | null;
  plan: { yes: number; partly: number; no: number };
  /** Average enjoyment per month (YYYY-MM), oldest first, months with ratings only. */
  enjoyByMonth: { month: string; avg: number; n: number }[];
  problemsOpen: number;
  problemsSolved: number;
  /** Solved problems where you tinkered before looking it up. */
  tinkered: number;
}

/** "Am I enjoying this? Am I following my plan?": how sessions felt, from your own check-ins. */
export function processStats(events: LogEvent[]): ProcessStats {
  const ss = events.filter((e) => !e.deleted && isSession(e));
  const rated = ss.filter((e) => e.detail?.enjoy);
  const months = new Map<string, { sum: number; n: number }>();
  for (const e of rated) {
    const d = new Date(e.at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = months.get(k) ?? { sum: 0, n: 0 };
    cur.sum += e.detail!.enjoy!;
    cur.n++;
    months.set(k, cur);
  }
  const plan = { yes: 0, partly: 0, no: 0 };
  for (const e of ss) if (e.detail?.plan) plan[e.detail.plan]++;
  const pr = problems(events);
  return {
    sessions: ss.length,
    reflected: ss.filter((e) => e.detail?.reflectedAt).length,
    rated: rated.length,
    enjoyAvg: rated.length ? rated.reduce((s, e) => s + e.detail!.enjoy!, 0) / rated.length : null,
    plan,
    enjoyByMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, avg: v.sum / v.n, n: v.n })),
    problemsOpen: pr.open.length,
    problemsSolved: pr.solved.length,
    tinkered: pr.solved.filter((e) => e.detail!.problem!.tinkered).length,
  };
}
