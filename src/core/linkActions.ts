import { BELTS, type Belt, type Detail, type Outcome, type Size } from './types';
import { resolvePosition, resolveSub, resolveTechnique } from './catalog';
import type { KindId } from './kinds';

/**
 * Link actions: open the app with `?do=…` to log something, e.g. from an iOS Shortcut ("Hey Siri,
 * log open mat"), an Android home-screen shortcut, or a bookmark.
 *
 *   ?do=log&type=open-mat&min=60        a finished 60-minute open mat, ending now
 *   ?do=toggle&type=class               start or stop class      ?do=start&type=roll
 *   &ago=15  it ended (log) or started (start) 15 minutes ago
 *   &gi=nogi  &tech=knee cut,armbar  &note=…
 *   rolls: &partner=Sam&belt=purple&size=bigger&sub=armbar&tapped=triangle&stuck=half guard&outcome=win
 *          &landed=knee cut&tried=berimbolo  (moves you landed / went for)
 *          &from=side control&role=bottom  (a positional round)
 *          &goal=escape or sweep&got=2&theygot=1&went=…  (a situational round: its goal, the count each way, how it went)
 *   sessions: &enjoy=1..5&plan=yes|partly|no     study: &source=…
 *
 * Settings never travel in the URL. Parameters are removed once the action has run.
 */

export type LinkVerb = 'log' | 'start' | 'stop' | 'toggle';

export type LinkAction = { kind: LinkVerb; what: KindId; detail: Detail; minutesAgo: number } | { kind: 'invalid'; reason: string };

/** Query parameters that belong to an action (removed after it runs). */
export const LINK_PARAMS = ['do', 'type', 'what', 'min', 'ago', 'gi', 'attire', 'tech', 'partner', 'belt', 'size', 'sub', 'tapped', 'stuck', 'landed', 'tried', 'outcome', 'from', 'role', 'goal', 'got', 'theygot', 'went', 'enjoy', 'plan', 'source', 'topic', 'note'] as const;

/** What people (and Siri) actually say. */
const WHAT: Record<string, KindId> = {
  class: 'class',
  lesson: 'class',
  'open-mat': 'open-mat',
  openmat: 'open-mat',
  open: 'open-mat',
  'open-mat-session': 'open-mat',
  drilling: 'drilling',
  drill: 'drilling',
  drills: 'drilling',
  comp: 'comp',
  competition: 'comp',
  tournament: 'comp',
  roll: 'roll',
  round: 'roll',
  spar: 'roll',
  sparring: 'roll',
  match: 'roll',
  study: 'study',
  studying: 'study',
  instructional: 'study',
  video: 'study',
};

const SIZES: Record<string, Size> = { smaller: 'smaller', small: 'smaller', lighter: 'smaller', similar: 'similar', same: 'similar', even: 'similar', bigger: 'bigger', big: 'bigger', heavier: 'bigger', larger: 'bigger' };
const OUTCOMES: Record<string, Outcome> = { win: 'win', won: 'win', w: 'win', loss: 'loss', lost: 'loss', lose: 'loss', l: 'loss', draw: 'draw', d: 'draw', tie: 'draw' };
const MAX_NOTE = 500;

const list = (raw: string | null, resolve: (s: string) => string) =>
  (raw ?? '')
    .split(/[,;|]/)
    .map((s) => resolve(s.trim()))
    .filter(Boolean)
    .slice(0, 30);

export function parseLinkAction(search: string): LinkAction | null {
  const q = new URLSearchParams(search);
  const verb = q.get('do')?.trim().toLowerCase();
  if (!verb) return null;
  if (!['log', 'start', 'stop', 'toggle', 'add'].includes(verb)) return { kind: 'invalid', reason: `unknown action “${verb}” (use log, start, stop or toggle)` };
  const kind: LinkVerb = verb === 'add' ? 'log' : (verb as LinkVerb);

  const whatRaw = (q.get('type') ?? q.get('what'))?.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!whatRaw) return { kind: 'invalid', reason: 'say what to log, e.g. &type=class' };
  const what = WHAT[whatRaw];
  if (!what) return { kind: 'invalid', reason: `don't know “${whatRaw}” (try class, open-mat, drilling, comp, roll or study)` };

  const agoRaw = q.get('ago');
  const minutesAgo = agoRaw === null ? 0 : Math.round(Number(agoRaw));
  if (!Number.isFinite(minutesAgo) || minutesAgo < 0 || minutesAgo > 366 * 24 * 60) return { kind: 'invalid', reason: '“ago” is minutes ago, 0–527040 (a year)' };

  const detail: Detail = {};
  const minRaw = q.get('min');
  if (minRaw !== null) {
    const v = Math.round(Number(minRaw));
    if (!(v >= 1 && v <= 600)) return { kind: 'invalid', reason: 'min is minutes, 1–600' };
    detail.min = v;
  }
  // A length makes "toggle" a finished entry: there's nothing to start.
  const verbOut: LinkVerb = detail.min && (kind === 'toggle' || kind === 'start') ? 'log' : kind;

  const attire = (q.get('gi') ?? q.get('attire'))?.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (attire) {
    if (['gi', 'yes', 'true', '1'].includes(attire)) detail.attire = 'gi';
    else if (['nogi', 'no', 'false', '0'].includes(attire)) detail.attire = 'nogi';
    else return { kind: 'invalid', reason: 'gi is gi or nogi' };
  }

  const tech = list(q.get('tech'), resolveTechnique);
  if (tech.length) detail.techniques = tech;

  const partner = q.get('partner')?.trim().slice(0, 60);
  if (partner) detail.partner = partner;
  const belt = q.get('belt')?.trim().toLowerCase();
  if (belt) {
    if (!BELTS.includes(belt as Belt)) return { kind: 'invalid', reason: 'belt is white, blue, purple, brown or black' };
    detail.belt = belt as Belt;
  }
  const size = q.get('size')?.trim().toLowerCase();
  if (size) {
    if (!SIZES[size]) return { kind: 'invalid', reason: 'size is smaller, similar or bigger' };
    detail.size = SIZES[size];
  }
  const subsFor = list(q.get('sub'), resolveSub);
  if (subsFor.length) detail.subsFor = subsFor;
  const subsAgainst = list(q.get('tapped'), resolveSub);
  if (subsAgainst.length) detail.subsAgainst = subsAgainst;
  const stuck = list(q.get('stuck'), resolvePosition);
  if (stuck.length) detail.stuck = stuck;
  const landed = list(q.get('landed'), resolveTechnique);
  if (landed.length) detail.landed = landed;
  const tried = list(q.get('tried'), resolveTechnique);
  if (tried.length) detail.tried = tried;
  const outcome = q.get('outcome')?.trim().toLowerCase();
  if (outcome) {
    if (!OUTCOMES[outcome]) return { kind: 'invalid', reason: 'outcome is win, loss or draw' };
    detail.outcome = OUTCOMES[outcome];
  }
  const from = q.get('from')?.trim();
  if (from) detail.start = resolvePosition(from);
  const role = q.get('role')?.trim().toLowerCase();
  if (role) {
    if (role !== 'top' && role !== 'bottom') return { kind: 'invalid', reason: 'role is top or bottom' };
    detail.role = role;
  }
  if (what !== 'roll' && (detail.start || detail.role)) return { kind: 'invalid', reason: 'from and role are for type=roll' };
  const goal = q.get('goal')?.trim().slice(0, 120);
  if (goal) detail.goal = goal;
  for (const [param, field] of [['got', 'goalsFor'], ['theygot', 'goalsAgainst']] as const) {
    const raw = q.get(param);
    if (raw === null || raw.trim() === '') continue;
    const v = Number(raw);
    if (!(Number.isInteger(v) && v >= 0 && v <= 99)) return { kind: 'invalid', reason: `${param} is a count, 0–99` };
    detail[field] = v;
  }
  const went = q.get('went')?.trim().slice(0, 500);
  if (went) detail.goalNote = went;
  if (what !== 'roll' && (detail.goal || detail.goalsFor !== undefined || detail.goalsAgainst !== undefined || detail.goalNote)) return { kind: 'invalid', reason: 'goal, got, theygot and went are for type=roll' };
  const enjoy = q.get('enjoy');
  if (enjoy !== null) {
    const v = Math.round(Number(enjoy));
    if (!(v >= 1 && v <= 5)) return { kind: 'invalid', reason: 'enjoy is 1–5' };
    detail.enjoy = v;
  }
  const plan = q.get('plan')?.trim().toLowerCase();
  if (plan) {
    if (!['yes', 'partly', 'no'].includes(plan)) return { kind: 'invalid', reason: 'plan is yes, partly or no' };
    detail.plan = plan as Detail['plan'];
  }
  if ((detail.enjoy || detail.plan) && (what === 'roll' || what === 'study')) return { kind: 'invalid', reason: 'enjoy and plan are for sessions' };
  const topic = q.get('topic')?.trim().slice(0, 120);
  if (topic) {
    if (what === 'roll' || what === 'study') return { kind: 'invalid', reason: 'topic is for sessions' };
    detail.topic = topic;
  }
  const source = q.get('source')?.trim().slice(0, 200);
  if (source) {
    if (what !== 'study') return { kind: 'invalid', reason: 'source is for type=study' };
    detail.source = source;
  }
  if (what !== 'roll' && (detail.partner || detail.belt || detail.size || subsFor.length || subsAgainst.length || stuck.length || landed.length || tried.length || detail.outcome))
    return { kind: 'invalid', reason: 'partner, belt, size, sub, tapped, stuck, landed, tried and outcome are for type=roll' };

  const note = q.get('note')?.trim().slice(0, MAX_NOTE);
  if (note) detail.note = note;

  return { kind: verbOut, what, detail, minutesAgo };
}

/** The same URL without the action's parameters, so a reload doesn't run it again. */
export function stripLinkAction(href: string): string {
  const url = new URL(href);
  LINK_PARAMS.forEach((p) => url.searchParams.delete(p));
  return url.pathname + url.search + url.hash;
}
