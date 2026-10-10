import { positionLabel, subLabel, techniqueLabel } from '../core/catalog';
import { addDays, dayKey, dayStart } from '../core/days';
import { isSession, minutesOf } from '../core/events';
import { KINDS, ongoingFor, type KindId } from '../core/kinds';
import { parseLinkAction } from '../core/linkActions';
import { app, settings } from '../core/log';
import { parseMarkdown, toMarkdown } from '../core/markdown';
import { logKind, startKind, stopKind, toggleKind, type OpResult } from '../core/ops';
import { currentRank, matMinutes, patterns, rankTimeline, rollsIn, rollStats, techniqueUses, weekRecap } from '../core/stats';
import type { LogEvent } from '../core/types';
import { logMarkdown } from './pasteView';
import { matchFocus, focusProgress, setFocus } from '../core/focus';
import { undoLast } from './toast';

/**
 * `window.matlog`: a small scripting API for AI agents and automation driving the page
 * (Playwright `page.evaluate`, DevTools, browser agents). It uses the same names and rules as link
 * actions, returns plain JSON-safe data, and throws an Error with a readable message on bad input.
 * Data stays in this browser: an outside agent can only reach it by driving a browser with the app open.
 */
export interface ActOptions {
  /** log: it ended this long ago. start/stop/toggle: it started/ended this long ago. */
  minutesAgo?: number;
  /** Length in minutes (log). */
  min?: number;
  gi?: 'gi' | 'nogi';
  techniques?: string[] | string;
  partner?: string;
  belt?: 'white' | 'blue' | 'purple' | 'brown' | 'black';
  size?: 'smaller' | 'similar' | 'bigger';
  /** Submissions you hit. */
  subs?: string[] | string;
  /** Submissions you tapped to. */
  tapped?: string[] | string;
  stuck?: string[] | string;
  /** Moves (sweeps, passes, takedowns…) you landed in the round. */
  landed?: string[] | string;
  /** Moves you went for but didn't land. */
  tried?: string[] | string;
  outcome?: 'win' | 'loss' | 'draw';
  note?: string;
}

const MIN = 60_000;
const iso = (ts: number) => new Date(ts).toISOString();
const joined = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join(',') : v);

function toEntry(e: LogEvent, now = Date.now()) {
  const d = e.detail ?? {};
  const base = { id: e.id, type: e.type, start: iso(e.at), minutes: e.type === 'promotion' ? null : minutesOf(e, now), ongoing: e.type !== 'promotion' && e.endAt === undefined && !d.min, note: d.note ?? null };
  if (e.type === 'promotion') return { ...base, belt: d.belt ?? null, stripes: d.stripes ?? 0 };
  if (e.type === 'roll')
    return {
      ...base,
      partner: d.partner ?? null,
      belt: d.belt ?? null,
      size: d.size ?? null,
      outcome: d.outcome ?? null,
      subsFor: (d.subsFor ?? []).map(subLabel),
      subsAgainst: (d.subsAgainst ?? []).map(subLabel),
      stuck: (d.stuck ?? []).map(positionLabel),
      landed: (d.landed ?? []).map(techniqueLabel),
      tried: (d.tried ?? []).map(techniqueLabel),
    };
  return { ...base, gi: d.attire ?? null, techniques: (d.techniques ?? []).map(techniqueLabel), rounds: rollsIn(e, app.get().events, now).length };
}

/** Runs a verb through the link-action parser, so names, aliases and validation match `?do=` links. */
function act(verb: 'log' | 'start' | 'stop' | 'toggle', what: string, opts: ActOptions = {}) {
  const q = new URLSearchParams({ do: verb, type: String(what) });
  const map: Record<string, string | number | undefined> = {
    ago: opts.minutesAgo,
    min: opts.min,
    gi: opts.gi,
    tech: joined(opts.techniques),
    partner: opts.partner,
    belt: opts.belt,
    size: opts.size,
    sub: joined(opts.subs),
    tapped: joined(opts.tapped),
    stuck: joined(opts.stuck),
    landed: joined(opts.landed),
    tried: joined(opts.tried),
    outcome: opts.outcome,
    note: opts.note,
  };
  for (const [k, v] of Object.entries(map)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const a = parseLinkAction(`?${q}`);
  if (!a || a.kind === 'invalid') throw new Error(`matlog: ${a?.kind === 'invalid' ? a.reason : 'nothing to do'}`);
  const now = Date.now();
  const op = { log: logKind, start: startKind, stop: stopKind, toggle: toggleKind }[a.kind];
  const r: OpResult = op(a.what, { at: now - a.minutesAgo * MIN, detail: Object.keys(a.detail).length ? a.detail : undefined });
  if (r.kind === 'noop') return { result: 'nothing-to-do' as const, reason: r.reason };
  return { result: r.kind, entry: toEntry(r.event) };
}

/** Common requests and the calls that answer them, shown in `matlog.help()` and `llms.txt`. */
export const RECIPES: { ask: string; code: string; note: string }[] = [
  { ask: 'Log a 60 minute open mat I just finished', code: "matlog.log('open-mat', { min: 60 })", note: 'Also class, drilling, comp. minutesAgo moves the end back; gi: "nogi" and techniques: ["knee cut"] add detail.' },
  { ask: 'I just bowed in to class', code: "matlog.start('class')", note: 'stop() ends it (and any round running inside it). toggle() does whichever applies.' },
  { ask: 'Log a round: tapped Sam (purple) with an armbar, got stuck in half guard', code: "matlog.log('roll', { partner: 'Sam', belt: 'purple', subs: 'armbar', stuck: 'half guard' })", note: 'tapped: what you tapped to. Rounds default to 6 minutes; pass min.' },
  { ask: 'At open mat I landed a knee cut twice and went for a berimbolo', code: "matlog.log('roll', { landed: 'knee cut', tried: 'berimbolo' })", note: 'One call per round. techniques() then shows each move as landed X of Y attempts.' },
  { ask: 'How many mat hours do I have?', code: 'matlog.state().matHours', note: 'state() also has rank, what is running, and the last 7 days.' },
  { ask: 'What do I get stuck in, and what do I tap to?', code: 'matlog.stats()', note: 'Counts and ratios. patterns() has plain sentences with what each is based on. Descriptive, never advice.' },
  { ask: "I'm working on my knee cut", code: "matlog.focus('knee cut')", note: 'Shown on the home screen. matlog.focus() later reports sessions since, and rounds you went for or landed it. Never set one the person did not ask for.' },
  { ask: 'Log this class note', code: 'matlog.importMarkdown(text)', note: 'Same format as the Paste dialog and markdown() output.' },
];

const HELP = `matlog: BJJ training journal scripting API (window.matlog). Data stays in this browser.
All calls are synchronous. Types: class, open-mat, drilling, comp, roll.

matlog.state()                 rank, mat hours, what's running, the last 7 days
matlog.log(type, opts?)        log a finished one, ending now (or minutesAgo); opts:
                               { min, minutesAgo, gi: 'gi'|'nogi', techniques, note,
                                 partner, belt, size: 'smaller'|'similar'|'bigger',     (rolls)
                                 subs, tapped, landed, tried, stuck,                    (rolls; lists: array or comma text)
                                 outcome: 'win'|'loss'|'draw' }
matlog.start(type, opts?)      start the timer (one session at a time; a round can run inside it)
matlog.stop(type, opts?)       stop it
matlog.toggle(type, opts?)     start or stop
matlog.entries(days = 7)       sessions, rounds and promotions from the last N days
matlog.undo()                  undo the last change made in the app (within 5 minutes)
matlog.markdown(days = 7)      the last N days as Markdown
matlog.importMarkdown(text)    log a pasted class note; returns what was added
matlog.parseMarkdown(text)     preview what importMarkdown would log, without logging
matlog.stats()                 subs for/against, stuck positions, partners, by belt
matlog.techniques()            drilled in sessions, landed/tried in rounds, from → to positions
matlog.patterns()              plain descriptions, each with what it's based on (not advice)
matlog.focus(text?)            read or set "Working on" ("" clears); counts what happened since it was set

Common requests:
${RECIPES.map((r) => `- ${r.ask}\n    ${r.code}\n    ${r.note}`).join('\n')}`;

export function createAgentApi() {
  return {
    version: __APP_VERSION__,
    help: () => HELP,
    state() {
      const now = Date.now();
      const { events } = app.get();
      const prefs = settings.get();
      const running = KINDS.map((k) => ongoingFor(events, k.id as KindId))
        .filter((e): e is LogEvent => !!e)
        .map((e) => ({ type: e.type, since: iso(e.at), minutes: Math.round((now - e.at) / MIN) }));
      const r = weekRecap(events, dayKey(now), now);
      return {
        name: prefs.name || null,
        now: iso(now),
        rank: currentRank(events, prefs, now),
        promotions: rankTimeline(events, prefs, now).filter((s) => s.at).map((s) => ({ belt: s.belt, stripes: s.stripes, at: iso(s.at!) })),
        matHours: Math.round(matMinutes(events, now) / 6) / 10,
        sessions: events.filter((e) => !e.deleted && isSession(e)).length,
        running,
        workingOn: prefs.focus ? { text: prefs.focus, since: prefs.focusSince ? iso(prefs.focusSince) : null } : null,
        last7Days: { sessions: r.sessions, minutes: r.minutes, rounds: r.rolls, subsFor: r.subsFor, subsAgainst: r.subsAgainst, techniques: r.techniques },
      };
    },
    log: (type: string, opts?: ActOptions) => act('log', type, opts),
    start: (type: string, opts?: ActOptions) => act('start', type, opts),
    stop: (type: string, opts?: ActOptions) => act('stop', type, opts),
    toggle: (type: string, opts?: ActOptions) => act('toggle', type, opts),
    entries(days = 7) {
      const now = Date.now();
      const from = dayStart(addDays(dayKey(now), -(Math.max(1, Math.round(days)) - 1)));
      return app
        .get()
        .events.filter((e) => !e.deleted && e.at >= from)
        .sort((a, b) => a.at - b.at)
        .map((e) => toEntry(e, now));
    },
    undo: () => undoLast(),
    markdown(days = 7) {
      const now = Date.now();
      const today = dayKey(now);
      return toMarkdown(app.get().events, addDays(today, -(Math.max(1, Math.round(days)) - 1)), today, now, settings.get().name);
    },
    importMarkdown(text: string) {
      if (typeof text !== 'string' || !text.trim()) throw new Error('matlog: pass the note as text');
      const r = logMarkdown(text);
      return { sessions: r.sessions, rounds: r.rolls, ids: r.ids };
    },
    parseMarkdown(text: string) {
      return parseMarkdown(String(text ?? '')).map((s) => ({ type: s.type, start: s.at ? iso(s.at) : null, ...s.detail, rounds: s.rolls.map((r) => r.detail) }));
    },
    stats() {
      const s = rollStats(app.get().events);
      return {
        rounds: s.rolls,
        subsFor: s.subsFor,
        subsAgainst: s.subsAgainst,
        ratio: s.ratio === null ? null : Math.round(s.ratio * 100) / 100,
        finished: s.forBy.map(({ label, n }) => ({ sub: label, n })),
        tappedTo: s.againstBy.map(({ label, n }) => ({ sub: label, n })),
        stuck: s.stuck.map(({ label, n }) => ({ position: label, n })),
        roundsWithStuck: s.stuckRolls,
        partners: s.partners.map(({ label, n }) => ({ partner: label, n })),
        byBelt: s.byBelt,
      };
    },
    techniques() {
      return techniqueUses(app.get().events).map((u) => ({ technique: u.label, sessions: u.sessions, landed: u.landed, attempts: u.attempts, last: iso(u.lastAt), from: u.from ? positionLabel(u.from) : null, to: u.to ? positionLabel(u.to) : null }));
    },
    patterns: () => patterns(app.get().events, Date.now()),
    focus(text?: string) {
      const now = Date.now();
      if (text !== undefined) {
        if (typeof text !== 'string') throw new Error('matlog: focus text is a string ("" clears it)');
        settings.set(setFocus(settings.get(), text, now));
      }
      const s = settings.get();
      if (!s.focus) return { text: null, history: s.focusHistory.map((h) => ({ text: h.text, from: iso(h.from), to: iso(h.to) })) };
      const match = matchFocus(s.focus, techniqueUses(app.get().events).map((u) => u.id));
      return {
        text: s.focus,
        since: s.focusSince ? iso(s.focusSince) : null,
        tracking: match,
        sinceThen: focusProgress(app.get().events, match, s.focusSince ?? now, now),
        history: s.focusHistory.map((h) => ({ text: h.text, from: iso(h.from), to: iso(h.to) })),
      };
    },
  };
}

export type MatlogApi = ReturnType<typeof createAgentApi>;

declare global {
  interface Window {
    matlog: MatlogApi;
  }
}
