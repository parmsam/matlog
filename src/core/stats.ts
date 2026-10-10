import { POSITIONS, positionLabel, resolveSub, SUBMISSIONS, subLabel, techniqueById, techniqueLabel } from './catalog';
import { addDays, dayDate, dayKey, dayStart, weekOf } from './days';
import { isSession, minutesOf, spanEnd } from './events';
import { plural } from './format';
import { BELTS, type Belt, type LogEvent, type PatchId, type Role, type Settings, type Size } from './types';

/**
 * Descriptive numbers from the log. Nothing here is advice: patterns say what happened and what
 * they're based on, and stay hidden until there's enough to say anything.
 */

const live = (events: LogEvent[]) => events.filter((e) => !e.deleted);
export const sessions = (events: LogEvent[]) => live(events).filter(isSession);
export const rolls = (events: LogEvent[]) => live(events).filter((e) => e.type === 'roll');

/** Total minutes of sessions (rolls happen inside sessions, so they aren't added again). */
export function matMinutes(events: LogEvent[], now: number, from = -Infinity, to = Infinity): number {
  let total = 0;
  for (const e of sessions(events)) {
    if (e.at < from || e.at >= to || e.at > now) continue;
    total += minutesOf(e, now);
  }
  return total;
}

/** Rolls that happened during a session. */
export function rollsIn(session: LogEvent, events: LogEvent[], now: number): LogEvent[] {
  const end = spanEnd(session, now);
  return rolls(events)
    .filter((r) => r.at >= session.at - 60_000 && r.at <= end)
    .sort((a, b) => a.at - b.at);
}

// ---------- Week-by-week heatmap ----------

export interface HeatDay {
  day: string;
  minutes: number;
  sessions: number;
  /** 0 = nothing, 1–4 = quartile of active days. */
  level: number;
  future: boolean;
}

export interface WeekHeatmap {
  /** Week start days, oldest first. */
  weeks: string[];
  /** cells[week][weekday], weekday 0 = the first day of the week. */
  cells: HeatDay[][];
  weekMinutes: number[];
}

export function weekHeatmap(events: LogEvent[], lastDay: string, nWeeks: number, weekStart: 0 | 1, now: number): WeekHeatmap {
  const byDay = new Map<string, { minutes: number; sessions: number }>();
  for (const e of sessions(events)) {
    const k = dayKey(e.at);
    const cur = byDay.get(k) ?? { minutes: 0, sessions: 0 };
    cur.minutes += minutesOf(e, now);
    cur.sessions++;
    byDay.set(k, cur);
  }
  const active = [...byDay.values()].map((v) => v.minutes).filter((m) => m > 0).sort((a, b) => a - b);
  const q = (p: number) => active[Math.min(active.length - 1, Math.floor(p * active.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (m: number) => (m <= 0 ? 0 : 1 + cuts.filter((c) => m > c).length);

  const lastWeek = weekOf(lastDay, weekStart);
  const today = dayKey(now);
  const weeks: string[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) weeks.push(addDays(lastWeek, -7 * i));
  const cells = weeks.map((w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(w, d);
      const v = byDay.get(day) ?? { minutes: 0, sessions: 0 };
      return { day, minutes: v.minutes, sessions: v.sessions, level: level(v.minutes), future: day > today };
    }),
  );
  return { weeks, cells, weekMinutes: cells.map((c) => c.reduce((s, d) => s + d.minutes, 0)) };
}

// ---------- Rolls: subs and where you got stuck ----------

export interface Count {
  id: string;
  label: string;
  n: number;
}

const tally = (lists: (string[] | undefined)[], label: (id: string) => string): Count[] => {
  const m = new Map<string, number>();
  for (const l of lists) for (const id of new Set(l ?? [])) m.set(id, (m.get(id) ?? 0) + 1);
  return [...m.entries()].map(([id, n]) => ({ id, label: label(id), n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
};

export interface RollStats {
  rolls: number;
  subsFor: number;
  subsAgainst: number;
  /** subsFor / subsAgainst, or null with no taps. */
  ratio: number | null;
  forBy: Count[];
  againstBy: Count[];
  stuck: Count[];
  /** Rolls that noted any stuck position. */
  stuckRolls: number;
  partners: Count[];
  byBelt: { belt: Belt; rolls: number; subsFor: number; subsAgainst: number }[];
}

export function rollStats(events: LogEvent[], from = -Infinity, to = Infinity): RollStats {
  const rs = rolls(events).filter((r) => r.at >= from && r.at < to);
  const forBy = tally(rs.map((r) => r.detail?.subsFor), subLabel);
  const againstBy = tally(rs.map((r) => r.detail?.subsAgainst), subLabel);
  const subsFor = rs.reduce((s, r) => s + (r.detail?.subsFor?.length ?? 0), 0);
  const subsAgainst = rs.reduce((s, r) => s + (r.detail?.subsAgainst?.length ?? 0), 0);
  const partners = tally(
    rs.map((r) => (r.detail?.partner ? [r.detail.partner.trim()] : [])),
    (id) => id,
  );
  const belts: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];
  return {
    rolls: rs.length,
    subsFor,
    subsAgainst,
    ratio: subsAgainst ? subsFor / subsAgainst : null,
    forBy,
    againstBy,
    stuck: tally(rs.map((r) => r.detail?.stuck), positionLabel),
    stuckRolls: rs.filter((r) => r.detail?.stuck?.length).length,
    partners,
    byBelt: belts
      .map((belt) => {
        const b = rs.filter((r) => r.detail?.belt === belt);
        return {
          belt,
          rolls: b.length,
          subsFor: b.reduce((s, r) => s + (r.detail?.subsFor?.length ?? 0), 0),
          subsAgainst: b.reduce((s, r) => s + (r.detail?.subsAgainst?.length ?? 0), 0),
        };
      })
      .filter((b) => b.rolls),
  };
}

// ---------- Technique library ----------

export interface TechUse {
  id: string;
  label: string;
  /** Sessions it was tagged in (drilled or taught). */
  sessions: number;
  /** Rounds you landed it in, and rounds you went for it (landed or not). */
  landed: number;
  attempts: number;
  /** Last time it was drilled or tried in a round. */
  lastAt: number;
  /** Catalog technique (with positions), or undefined for your own. */
  from?: string;
  to?: string;
}

/** Every technique you've drilled in a session or tried in a round, newest first. */
export function techniqueUses(events: LogEvent[]): TechUse[] {
  const m = new Map<string, TechUse>();
  const get = (id: string, at: number) => {
    let cur = m.get(id);
    if (!cur) {
      const t = techniqueById(id);
      cur = { id, label: techniqueLabel(id), sessions: 0, landed: 0, attempts: 0, lastAt: at, from: t?.from, to: t?.to };
      m.set(id, cur);
    }
    cur.lastAt = Math.max(cur.lastAt, at);
    return cur;
  };
  for (const e of sessions(events)) for (const id of new Set(e.detail?.techniques ?? [])) get(id, e.at).sessions++;
  for (const r of rolls(events)) {
    const landed = new Set(r.detail?.landed ?? []);
    for (const id of landed) {
      const u = get(id, r.at);
      u.landed++;
      u.attempts++;
    }
    for (const id of new Set(r.detail?.tried ?? [])) if (!landed.has(id)) get(id, r.at).attempts++;
  }
  return [...m.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/** Moves tried in rounds, most attempted first: "landed 4 of 7". */
export function moveStats(events: LogEvent[]): TechUse[] {
  return techniqueUses(events)
    .filter((u) => u.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || b.landed - a.landed || a.label.localeCompare(b.label));
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Times drilled, summed over techniques on this edge. */
  n: number;
  techniques: string[];
}

/** Position graph from your own logs: an edge for every catalog technique you've tagged. */
export function positionGraph(events: LogEvent[]): { edges: GraphEdge[]; nodes: Map<string, number> } {
  const edges = new Map<string, GraphEdge>();
  const nodes = new Map<string, number>();
  for (const u of techniqueUses(events)) {
    if (!u.from || !u.to) continue;
    const key = `${u.from}>${u.to}`;
    // Drilled in a session or landed in a round; a miss isn't a path you've taken.
    const n = u.sessions + u.landed;
    if (!n) continue;
    const e = edges.get(key) ?? { from: u.from, to: u.to, n: 0, techniques: [] };
    e.n += n;
    e.techniques.push(u.label);
    edges.set(key, e);
    nodes.set(u.from, (nodes.get(u.from) ?? 0) + n);
    nodes.set(u.to, (nodes.get(u.to) ?? 0) + n);
  }
  // Getting stuck counts toward a node too, so it shows up even without techniques from it.
  for (const r of rolls(events)) for (const p of r.detail?.stuck ?? []) if (POSITIONS.some((x) => x.id === p)) nodes.set(p, nodes.get(p) ?? 0);
  return { edges: [...edges.values()].sort((a, b) => b.n - a.n), nodes };
}

// ---------- Rank ----------

export interface Rank {
  belt: Belt;
  stripes: number;
}

export interface RankStep extends Rank {
  at: number | null;
  /** Mat minutes logged before reaching this rank (since the previous step). */
  minutesBefore: number;
  id?: string;
}

/** Your ranks over time: where you started, then each logged promotion. */
export function rankTimeline(events: LogEvent[], prefs: Pick<Settings, 'startBelt' | 'startStripes'>, now: number): RankStep[] {
  const promos = live(events)
    .filter((e) => e.type === 'promotion' && e.detail?.belt)
    .sort((a, b) => a.at - b.at);
  const steps: RankStep[] = [{ belt: prefs.startBelt, stripes: prefs.startStripes, at: null, minutesBefore: 0 }];
  let prevAt = -Infinity;
  for (const p of promos) {
    steps.push({ belt: p.detail!.belt!, stripes: p.detail?.stripes ?? 0, at: p.at, minutesBefore: matMinutes(events, now, prevAt, p.at), id: p.id });
    prevAt = p.at;
  }
  return steps;
}

export function currentRank(events: LogEvent[], prefs: Pick<Settings, 'startBelt' | 'startStripes'>, now: number): Rank {
  const steps = rankTimeline(events, prefs, now).filter((s) => s.at === null || s.at <= now);
  const last = steps[steps.length - 1];
  return { belt: last.belt, stripes: last.stripes };
}

// ---------- Patches (rewards) ----------

export const PATCHES: { id: PatchId; hours: number; label: string; color: string }[] = [
  { id: 'p10', hours: 10, label: '10 hours', color: '#e9e4d8' },
  { id: 'p25', hours: 25, label: '25 hours', color: '#3b7ddd' },
  { id: 'p50', hours: 50, label: '50 hours', color: '#7a4fd0' },
  { id: 'p100', hours: 100, label: '100 hours', color: '#8a5a2b' },
  { id: 'p250', hours: 250, label: '250 hours', color: '#1c1c1c' },
  { id: 'p500', hours: 500, label: '500 hours', color: '#c8312f' },
  { id: 'p1000', hours: 1000, label: '1,000 hours', color: '#d9a520' },
];

export const unlockedPatches = (minutes: number) => PATCHES.filter((p) => minutes >= p.hours * 60);
export const nextPatch = (minutes: number) => PATCHES.find((p) => minutes < p.hours * 60);

// ---------- Week recap and patterns ----------

export interface Recap {
  from: string;
  to: string;
  sessions: number;
  minutes: number;
  rolls: number;
  subsFor: number;
  subsAgainst: number;
  techniques: string[];
}

/** The 7 days ending `lastDay`. */
export function weekRecap(events: LogEvent[], lastDay: string, now: number): Recap {
  const from = addDays(lastDay, -6);
  const [a, b] = [dayStart(from), dayStart(addDays(lastDay, 1))];
  const ss = sessions(events).filter((e) => e.at >= a && e.at < b);
  const rs = rollStats(events, a, b);
  return {
    from,
    to: lastDay,
    sessions: ss.length,
    minutes: matMinutes(events, now, a, b),
    rolls: rs.rolls,
    subsFor: rs.subsFor,
    subsAgainst: rs.subsAgainst,
    techniques: [...new Set(ss.flatMap((s) => s.detail?.techniques ?? []))].map(techniqueLabel),
  };
}

export interface Pattern {
  id: string;
  text: string;
  /** What it's based on, e.g. "12 rolls". */
  basis: string;
}

const MIN_ROLLS = 5;
const MIN_SESSIONS = 4;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Plain descriptions of the log. Each needs enough data and says what it's based on. Never advice. */
export function patterns(events: LogEvent[], now: number): Pattern[] {
  const out: Pattern[] = [];
  const rs = rollStats(events);
  const ss = sessions(events).filter((e) => e.at <= now);

  if (rs.stuckRolls >= MIN_ROLLS && rs.stuck[0]) {
    const top = rs.stuck[0];
    out.push({ id: 'stuck', text: `You noted getting stuck in ${top.label.toLowerCase()} most: ${plural(top.n, 'roll')}.`, basis: `${plural(rs.stuckRolls, 'roll')} with a stuck position` });
  }
  if (rs.subsFor >= 3 && rs.forBy[0]) out.push({ id: 'sub-for', text: `Your most-finished submission is the ${rs.forBy[0].label.toLowerCase()} (${rs.forBy[0].n}).`, basis: plural(rs.subsFor, 'sub') });
  if (rs.subsAgainst >= 3 && rs.againstBy[0]) out.push({ id: 'sub-against', text: `You've tapped to the ${rs.againstBy[0].label.toLowerCase()} most (${rs.againstBy[0].n}).`, basis: plural(rs.subsAgainst, 'tap') });
  const moves = moveStats(events).filter((m) => m.landed > 0);
  const topMove = moves.sort((a, b) => b.landed - a.landed || b.attempts - a.attempts)[0];
  if (topMove && topMove.landed >= 3) out.push({ id: 'move', text: `Your most-landed move in rounds is the ${topMove.label.toLowerCase()}: ${topMove.landed} of ${plural(topMove.attempts, 'attempt')}.`, basis: plural(rolls(events).filter((r) => r.detail?.landed?.length || r.detail?.tried?.length).length, 'round') + ' with moves noted' });
  if (rs.rolls >= MIN_ROLLS && rs.partners[0] && rs.partners[0].n >= 2) out.push({ id: 'partner', text: `You've rolled with ${rs.partners[0].label} most (${rs.partners[0].n} rounds).`, basis: plural(rs.rolls, 'roll') });

  if (ss.length >= MIN_SESSIONS) {
    const byDow = new Array(7).fill(0);
    ss.forEach((s) => byDow[new Date(s.at).getDay()]++);
    const best = byDow.indexOf(Math.max(...byDow));
    out.push({ id: 'weekday', text: `${WEEKDAYS[best]} is your most-trained day (${plural(byDow[best], 'session')}).`, basis: plural(ss.length, 'session') });
    const mins = ss.map((s) => minutesOf(s, now)).sort((a, b) => a - b);
    out.push({ id: 'length', text: `A typical session runs ${mins[Math.floor(mins.length / 2)]} minutes.`, basis: `median of ${plural(ss.length, 'session')}` });
    const gi = ss.filter((s) => s.detail?.attire === 'gi').length;
    const nogi = ss.filter((s) => s.detail?.attire === 'nogi').length;
    if (gi + nogi >= MIN_SESSIONS) out.push({ id: 'attire', text: `${Math.round((gi / (gi + nogi)) * 100)}% gi, ${Math.round((nogi / (gi + nogi)) * 100)}% no-gi.`, basis: `${plural(gi + nogi, 'session')} marked gi or no-gi` });
  }
  return out;
}

/** "Mon, Oct 6" style title for a week starting `w`. */
export const weekLabel = (w: string) => dayDate(w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// ---------- Skill ladder ----------

export type Level = 'lower' | 'similar' | 'higher';
export const SIZES_ORDER: Size[] = ['smaller', 'similar', 'bigger'];
export const LEVELS: Level[] = ['lower', 'similar', 'higher'];

export interface LadderCell {
  attempts: number;
  landed: number;
}

/** Partner's belt against yours at the time of the round. */
export function relativeLevel(partner: Belt, mine: Belt): Level {
  const d = BELTS.indexOf(partner) - BELTS.indexOf(mine);
  return d < 0 ? 'lower' : d > 0 ? 'higher' : 'similar';
}

/**
 * A technique against partners by size (smaller / similar / bigger) × belt (lower / similar /
 * higher than yours then): rounds you went for it, and landed it. A submission counts finishes.
 * Rounds without the partner's belt or size are counted in `unknown`.
 */
export function skillLadder(events: LogEvent[], id: string, prefs: Pick<Settings, 'startBelt' | 'startStripes'>): { cells: Record<Size, Record<Level, LadderCell>>; unknown: LadderCell; total: LadderCell } {
  const blank = (): LadderCell => ({ attempts: 0, landed: 0 });
  const cells = Object.fromEntries(SIZES_ORDER.map((s) => [s, Object.fromEntries(LEVELS.map((l) => [l, blank()]))])) as Record<Size, Record<Level, LadderCell>>;
  const unknown = blank();
  const total = blank();
  const sub = resolveSub(techniqueById(id)?.label ?? id);
  const isSub = SUBMISSIONS.some((s) => s.id === sub) && (techniqueById(id)?.kind === 'submission' || SUBMISSIONS.some((s) => s.id === id));
  for (const r of rolls(events)) {
    const d = r.detail ?? {};
    const landed = !!d.landed?.includes(id) || (isSub && !!d.subsFor?.includes(sub));
    const tried = landed || !!d.tried?.includes(id);
    if (!tried) continue;
    const cell = d.belt && d.size ? cells[d.size][relativeLevel(d.belt, currentRank(events, prefs, r.at).belt)] : unknown;
    for (const c of [cell, total]) {
      c.attempts++;
      if (landed) c.landed++;
    }
  }
  return { cells, unknown, total };
}

// ---------- Positional rounds ----------

/** Bottom of a pin, or turtle: the "bad spots" people start from on purpose. */
const BAD_SPOTS = new Set(['side-control', 'mount', 'back', 'north-south', 'knee-on-belly', 'turtle']);
export const isBadSpot = (start: string, role?: Role) => (start === 'turtle' ? true : role === 'bottom' && BAD_SPOTS.has(start));

export interface PositionalStats {
  rolls: number;
  /** Rounds that started from a position. */
  positional: number;
  /** …of them, from a bad spot. */
  badSpots: number;
  byStart: Count[];
}

export function positionalStats(events: LogEvent[]): PositionalStats {
  const rs = rolls(events);
  const pos = rs.filter((r) => r.detail?.start);
  return {
    rolls: rs.length,
    positional: pos.length,
    badSpots: pos.filter((r) => isBadSpot(r.detail!.start!, r.detail?.role)).length,
    byStart: tally(
      pos.map((r) => [`${r.detail!.start}${r.detail?.role ? `:${r.detail.role}` : ''}`]),
      (k) => {
        const [p, role] = k.split(':');
        return `${positionLabel(p)}${role ? ` (${role})` : ''}`;
      },
    ),
  };
}
