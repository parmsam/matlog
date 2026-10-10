import { positionLabel, subLabel, techniqueLabel } from '../core/catalog';
import { addDays, dayKey, dayStart } from '../core/days';
import { isNotebook, isSession, minutesOf } from '../core/events';
import { KINDS, ongoingFor, type KindId } from '../core/kinds';
import { parseLinkAction } from '../core/linkActions';
import { app, settings } from '../core/log';
import { parseMarkdown, toMarkdown } from '../core/markdown';
import { logKind, startKind, stopKind, toggleKind, type OpResult } from '../core/ops';
import { currentRank, matMinutes, patterns, rankTimeline, rollsIn, rollStats, techniqueUses, weekRecap } from '../core/stats';
import type { LogEvent } from '../core/types';
import { logMarkdown } from './pasteView';
import { newTechNote, techNotes } from '../core/library';
import { resolveTechnique } from '../core/catalog';
import { focuses, focusProgress, matchFocus, newFocus, roleLabel } from '../core/focus';
import { newProblem, problems } from '../core/notebook';
import { injuries, injuryDays, injuryTitle, newInjury, parseArea } from '../core/injuries';
import { addEvent, updateEvent } from '../core/log';
import type { FocusRole, ProblemSource } from '../core/types';
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
  /** Positional round: where it started, and your side. */
  from?: string;
  role?: 'top' | 'bottom';
  /** Session check-in: enjoyment 1–5, and whether you followed your plan. */
  enjoy?: number;
  plan?: 'yes' | 'partly' | 'no';
  /** Study: what you studied. */
  source?: string;
  note?: string;
}

const MIN = 60_000;
const iso = (ts: number) => new Date(ts).toISOString();
const joined = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join(',') : v);

function toEntry(e: LogEvent, now = Date.now()) {
  const d = e.detail ?? {};
  const base = { id: e.id, type: e.type, start: iso(e.at), minutes: e.type === 'promotion' ? null : minutesOf(e, now), ongoing: e.type !== 'promotion' && e.endAt === undefined && !d.min, note: d.note ?? null };
  if (e.type === 'promotion') return { ...base, belt: d.belt ?? null, stripes: d.stripes ?? 0 };
  if (e.type === 'study') return { ...base, source: d.source ?? null, url: d.url ?? null, techniques: (d.techniques ?? []).map(techniqueLabel) };
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
      from: d.start ? positionLabel(d.start) : null,
      role: d.role ?? null,
      landed: (d.landed ?? []).map(techniqueLabel),
      tried: (d.tried ?? []).map(techniqueLabel),
    };
  return { ...base, gi: d.attire ?? null, techniques: (d.techniques ?? []).map(techniqueLabel), rounds: rollsIn(e, app.get().events, now).length, enjoy: d.enjoy ?? null, plan: d.plan ?? null };
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
    from: opts.from,
    role: opts.role,
    enjoy: opts.enjoy,
    plan: opts.plan,
    source: opts.source,
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
  { ask: 'Log a round: tapped Sam (purple) with an armbar, got stuck in half guard', code: "matlog.log('roll', { partner: 'Sam', belt: 'purple', subs: 'armbar', stuck: 'half guard' })", note: 'tapped: what you tapped to. Rounds default to 5 minutes (the round length in the round clock); pass min.' },
  { ask: 'At open mat I landed a knee cut twice and went for a berimbolo', code: "matlog.log('roll', { landed: 'knee cut', tried: 'berimbolo' })", note: 'One call per round. techniques() then shows each move as landed X of Y attempts.' },
  { ask: 'How many mat hours do I have?', code: 'matlog.state().matHours', note: 'state() also has rank, what is running, and the last 7 days.' },
  { ask: 'What do I get stuck in, and what do I tap to?', code: 'matlog.stats()', note: 'Counts and ratios. patterns() has plain sentences with what each is based on. Descriptive, never advice.' },
  { ask: "I'm working on my knee cut for the next two weeks", code: "matlog.focus('knee cut', { role: 'main', blockDays: 14 })", note: 'Shown on the home screen. matlog.focus() reports each focus and what happened this block. Never add one the person did not ask for.' },
  { ask: 'I keep getting flattened in half guard', code: "matlog.problems('getting flattened in half guard', { source: 'internal' })", note: 'matlog.problems() lists open and solved ones; matlog.solve(id) marks one solved.' },
  { ask: 'I tweaked my left knee at open mat, no leg locks for a while', code: "matlog.injuries('left knee', { severity: 'minor', how: 'open mat', around: 'no leg locks' })", note: 'matlog.heal(id) when it has healed. Report what was logged; never give medical advice.' },
  { ask: 'Log this class note', code: 'matlog.importMarkdown(text)', note: 'Same format as the Paste dialog and markdown() output.' },
];

const HELP = `matlog: BJJ training journal scripting API (window.matlog). Data stays in this browser.
All calls are synchronous. Types: class, open-mat, drilling, comp, roll, study (study isn't mat time).

matlog.state()                 rank, mat hours, what's running, the last 7 days
matlog.log(type, opts?)        log a finished one, ending now (or minutesAgo); opts:
                               { min, minutesAgo, gi: 'gi'|'nogi', techniques, note,
                                 partner, belt, size: 'smaller'|'similar'|'bigger',     (rolls)
                                 subs, tapped, landed, tried, stuck,                    (rolls; lists: array or comma text)
                                 outcome: 'win'|'loss'|'draw', from, role: 'top'|'bottom',
                                 enjoy: 1-5, plan: 'yes'|'partly'|'no',               (sessions)
                                 source }                                              (study)
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
matlog.focus(text?, opts?)     focuses (blocks, what happened this block); with text, adds one:
                               { role: 'main'|'complement'|'habit'|'experiment'|'side', blockDays: 7|14, ifWorks, ifFails, target }
matlog.problems(text?, opts?)  open and solved problems; with text, logs one { source: 'internal'|'external'|'predictive', idea }
matlog.solve(id)               mark a problem solved
matlog.injuries(area?, opts?)  active and healed injuries; with an area ("left knee"), logs one:
                               { severity: 'minor'|'moderate'|'serious', how, around, daysAgo }  (a record, not medical advice)
matlog.heal(id)                mark an injury healed
matlog.techniqueNotes(t, text?, opts?)  notes on a technique; with text, adds one { kind: 'detail'|'observation'|'question'|'source', url }

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
        workingOn: focuses(events, now)
          .filter((v) => v.state === 'active' || v.state === 'over')
          .map((v) => ({ text: v.f.text, role: roleLabel(v.f.role), week: v.week, weeks: v.weeks, blockOver: v.state === 'over' })),
        openProblems: problems(events).open.length,
        activeInjuries: injuries(events, now).active.map((e) => ({ what: injuryTitle(e.detail!.injury!), days: injuryDays(e, now) })),
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
        .events.filter((e) => !e.deleted && !isNotebook(e) && e.at >= from)
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
    /** Running and resting focuses with what happened in the current block. With text, adds a focus (only when the person asks). */
    focus(text?: string, opts: { role?: FocusRole; blockDays?: 7 | 14; ifWorks?: string; ifFails?: string; target?: number } = {}) {
      const now = Date.now();
      if (text !== undefined) {
        if (typeof text !== 'string' || !text.trim()) throw new Error('matlog: focus text is a non-empty string');
        if (opts.role && !['main', 'complement', 'habit', 'experiment', 'side'].includes(opts.role)) throw new Error('matlog: role is main, complement, habit, experiment or side');
        addEvent(newFocus(text, now, opts));
      }
      const used = techniqueUses(app.get().events).map((u) => u.id);
      return focuses(app.get().events, now).map((v) => ({
        text: v.f.text,
        role: roleLabel(v.f.role),
        state: v.state,
        week: v.state === 'active' ? v.week : null,
        weeks: v.weeks,
        blocks: v.f.blocks.map((b) => ({ from: iso(b.from), to: b.to ? iso(b.to) : null })),
        ifWorks: v.f.ifWorks ?? null,
        ifFails: v.f.ifFails ?? null,
        tracking: matchFocus(v.f.text, used),
        thisBlock: focusProgress(app.get().events, matchFocus(v.f.text, used), v.block.from, v.block.to ?? now),
      }));
    },
    /** Open and solved problems. With text, logs a problem (and an idea to try). */
    problems(text?: string, opts: { source?: ProblemSource; idea?: string } = {}) {
      const now = Date.now();
      if (text !== undefined) {
        if (typeof text !== 'string' || !text.trim()) throw new Error('matlog: problem text is a non-empty string');
        if (opts.source && !['internal', 'external', 'predictive'].includes(opts.source)) throw new Error('matlog: source is internal, external or predictive');
        addEvent(newProblem(text, now, opts));
      }
      const p = problems(app.get().events);
      const row = (e: LogEvent) => ({ id: e.id, text: e.detail!.problem!.text, idea: e.detail!.problem!.idea ?? null, source: e.detail!.problem!.source ?? null, logged: iso(e.at), solved: e.detail!.problem!.solvedAt ? iso(e.detail!.problem!.solvedAt) : null });
      return { open: p.open.map(row), solved: p.solved.map(row) };
    },
    /** Active and healed injuries. With an area ("left knee"), logs one. A record, never medical advice. */
    injuries(area?: string, opts: { severity?: 'minor' | 'moderate' | 'serious'; how?: string; around?: string; daysAgo?: number } = {}) {
      const now = Date.now();
      if (area !== undefined) {
        if (typeof area !== 'string' || !area.trim()) throw new Error('matlog: area is text, e.g. "left knee"');
        if (opts.severity && !['minor', 'moderate', 'serious'].includes(opts.severity)) throw new Error('matlog: severity is minor, moderate or serious');
        const days = Math.max(0, Math.round(opts.daysAgo ?? 0));
        addEvent(newInjury(now - days * 86_400_000, { ...parseArea(area), severity: opts.severity, how: opts.how, around: opts.around }, now));
      }
      const { active, healed } = injuries(app.get().events, now);
      const row = (e: LogEvent) => {
        const d = e.detail!.injury!;
        return { id: e.id, what: injuryTitle(d), severity: d.severity ?? null, since: iso(e.at), days: injuryDays(e, now), how: d.how ?? null, trainingAround: d.around ?? null, updates: (d.updates ?? []).map((u) => ({ at: iso(u.at), text: u.text })), healed: d.healedAt ? iso(d.healedAt) : null };
      };
      return { active: active.map(row), healed: healed.map(row), note: 'A record of what was logged; not medical advice.' };
    },
    /** Marks an injury healed (by id from injuries()). */
    heal(id: string) {
      const e = app.get().events.find((x) => x.id === id && x.type === 'injury' && !x.deleted);
      if (!e) throw new Error('matlog: no injury with that id (see matlog.injuries())');
      updateEvent(id, { detail: { ...e.detail, injury: { ...e.detail!.injury!, healedAt: Date.now() } } });
      return this.injuries();
    },
    /** Your notes on a technique (key details first). With text, adds one. */
    techniqueNotes(technique: string, text?: string, opts: { kind?: 'detail' | 'observation' | 'question' | 'source'; url?: string } = {}) {
      if (typeof technique !== 'string' || !technique.trim()) throw new Error('matlog: name a technique, e.g. "knee cut"');
      const id = resolveTechnique(technique);
      if (text !== undefined) {
        if (typeof text !== 'string' || !text.trim()) throw new Error('matlog: note text is a non-empty string');
        if (opts.kind && !['detail', 'observation', 'question', 'source'].includes(opts.kind)) throw new Error('matlog: kind is detail, observation, question or source');
        addEvent(newTechNote(id, text, Date.now(), opts));
      }
      return {
        technique: techniqueLabel(id),
        notes: techNotes(app.get().events, id).map((e) => ({ id: e.id, kind: e.detail!.techNote!.kind, text: e.detail!.techNote!.text, url: e.detail!.techNote!.url ?? null, at: iso(e.at) })),
      };
    },
    /** Marks a problem solved (by id from problems()). */
    solve(id: string) {
      const e = app.get().events.find((x) => x.id === id && x.type === 'problem' && !x.deleted);
      if (!e) throw new Error('matlog: no problem with that id (see matlog.problems())');
      updateEvent(id, { detail: { ...e.detail, problem: { ...e.detail!.problem!, solvedAt: Date.now() } } });
      return this.problems();
    },
  };
}

export type MatlogApi = ReturnType<typeof createAgentApi>;

declare global {
  interface Window {
    matlog: MatlogApi;
  }
}
