import { positionLabel, resolvePosition, resolveSub, resolveTechnique, subLabel, techniqueLabel } from './catalog';
import { dayDate, dayKey } from './days';
import { createEvent, isSession, minutesOf } from './events';
import { duration, dayTitle } from './format';
import { injuryTitle, newInjury, parseArea } from './injuries';
import { kindById, type KindId } from './kinds';
import { newTechNote, techNotes } from './library';
import { newProblem, problemsFor } from './notebook';
import { rollsIn } from './stats';
import { BELTS, type Belt, type Detail, type LogEvent, type ProblemSource, type Role, type SessionKind, type Size, type TechNoteKind } from './types';

/**
 * Markdown in and out: the class note format (v2). Export writes it; import reads it back, along
 * with older and looser notes (comma lists, one-line rounds, plain text). The spec lives in
 * NOTE_FORMAT below, which the Paste dialog, llms.txt and the AI prompt all show.
 */

const MIN = 60_000;

/** The format, as people (and language models) should write it. */
export const NOTE_FORMAT = `## Class
- Date: 2026-10-08 18:00
- Length: 90m
- Gi: no-gi
- Topic: Half guard passing

### Techniques
- Knee cut pass
  - Key detail: underhook the far arm first
- Shoulder post wrist grab arm drag

### Rounds
- Sam (purple, bigger)
  - Started from: half guard bottom
  - Goal: sweep or come up
  - Got it: 2
  - They got it: 1
  - How it went: came up twice once I got the underhook
  - Hit: armbar
  - Tapped to: triangle
  - Landed: knee cut
  - Stuck: half guard

### Problems
- Got flattened in half guard
  - Idea: knee shield first

### Injuries
- Left knee (minor)
  - How: heel hook
  - Training around it: no leg locks

### Notes
Anything else, as free text.`;

/** What each part of the format means, for the Paste dialog and llms.txt. */
export const NOTE_RULES = [
  '`## Class` starts a session: Class, Open mat, Drilling, Comp or Study. Several sessions can follow each other.',
  'Session details are bullets: Date (YYYY-MM-DD HH:MM), Length (90m, 1h30), Gi (gi or no-gi), Topic, Enjoyed (1–5), Followed my plan (yes, partly, no). Study also takes Source.',
  '`### Techniques`: one technique per bullet. Sub-bullets add notes to it: Key detail, Observation, Question, Source (a link in brackets works).',
  '`### Rounds` (or Rolls, Matches): one partner per bullet, with belt, size and length in brackets. Sub-bullets: Started from (a position, then top or bottom), Hit, Tapped to, Landed, Went for, Stuck, Result (win, draw, loss), Note. Lists are comma-separated.',
  'Situational rounds add Goal (the rule, e.g. sweep or come up), Got it and They got it (how many times each side got their goal; the round can reset and go again), and How it went (a sentence or two).',
  '`### Problems`: one problem per bullet, `(solved)` at the end if it is. Sub-bullet: Idea.',
  '`### Injuries`: one per bullet, like `Left knee (minor)`. Sub-bullets: How, Training around it.',
  '`### Notes`: free text. Anything matlog doesn’t recognise also ends up in the note.',
];

// ---------- Export ----------

const stamp = (ts: number) => {
  const d = new Date(ts);
  return `${dayKey(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const sentence = (s: string) => s.replace(/\s+/g, ' ').trim();

const NOTE_KIND_LABEL: Record<TechNoteKind, string> = { detail: 'Key detail', observation: 'Observation', question: 'Question', source: 'Source' };

function roundMarkdown(r: LogEvent, now: number): string[] {
  const d = r.detail ?? {};
  const tags = [d.belt, d.size, `${minutesOf(r, now)}m`].filter(Boolean);
  const out = [`- ${d.partner ?? 'Round'} (${tags.join(', ')})`];
  const sub = (k: string, v: string | undefined) => {
    if (v) out.push(`  - ${k}: ${v}`);
  };
  sub('Started from', d.start ? `${positionLabel(d.start).toLowerCase()}${d.role ? ` ${d.role}` : ''}` : undefined);
  sub('Goal', d.goal ? sentence(d.goal) : undefined);
  sub('Got it', d.goalsFor !== undefined || d.goalsAgainst !== undefined ? String(d.goalsFor ?? 0) : undefined);
  sub('They got it', d.goalsFor !== undefined || d.goalsAgainst !== undefined ? String(d.goalsAgainst ?? 0) : undefined);
  sub('How it went', d.goalNote ? sentence(d.goalNote) : undefined);
  sub('Hit', d.subsFor?.map(subLabel).join(', '));
  sub('Tapped to', d.subsAgainst?.map(subLabel).join(', '));
  sub('Landed', d.landed?.map(techniqueLabel).join(', '));
  sub('Went for', d.tried?.map(techniqueLabel).join(', '));
  sub('Stuck', d.stuck?.map(positionLabel).join(', '));
  sub('Result', d.outcome);
  sub('Note', d.note ? sentence(d.note) : undefined);
  return out;
}

export function sessionMarkdown(s: LogEvent, events: LogEvent[], now: number): string {
  const kind = kindById(s.type as KindId);
  const d = s.detail ?? {};
  const out = [`## ${kind.label}`, '', `- Date: ${stamp(s.at)}`, `- Length: ${duration(minutesOf(s, now) * MIN)}`];
  if (d.attire) out.push(`- Gi: ${d.attire === 'gi' ? 'gi' : 'no-gi'}`);
  if (d.topic) out.push(`- Topic: ${d.topic}`);
  if (d.source) out.push(`- Source: ${d.source}${d.url ? ` (${d.url})` : ''}`);
  if (d.enjoy) out.push(`- Enjoyed: ${d.enjoy}`);
  if (d.plan) out.push(`- Followed my plan: ${d.plan}`);
  if (d.techniques?.length) out.push('', '### Techniques', ...d.techniques.map((t) => `- ${techniqueLabel(t)}`));
  const rs = s.type === 'study' ? [] : rollsIn(s, events, now);
  if (rs.length) out.push('', s.type === 'comp' ? '### Matches' : '### Rounds', ...rs.flatMap((r) => roundMarkdown(r, now)));
  const probs = problemsFor(s.id, events);
  if (probs.length)
    out.push(
      '',
      '### Problems',
      ...probs.flatMap((p) => {
        const pr = p.detail!.problem!;
        return [`- ${sentence(pr.text)}${pr.solvedAt ? ' (solved)' : ''}`, ...(pr.idea ? [`  - Idea: ${sentence(pr.idea)}`] : [])];
      }),
    );
  const injs = events.filter((e) => !e.deleted && e.type === 'injury' && e.detail?.injury?.sessionId === s.id);
  if (injs.length)
    out.push(
      '',
      '### Injuries',
      ...injs.flatMap((i) => {
        const x = i.detail!.injury!;
        return [`- ${injuryTitle(x)}${x.severity ? ` (${x.severity})` : ''}`, ...(x.how ? [`  - How: ${sentence(x.how)}`] : []), ...(x.around ? [`  - Training around it: ${sentence(x.around)}`] : [])];
      }),
    );
  if (d.note?.trim()) out.push('', '### Notes', d.note.trim());
  return out.join('\n');
}

/** Sessions between two days (inclusive), newest first, as Markdown. */
export function toMarkdown(events: LogEvent[], fromDay: string, toDay: string, now: number, name = ''): string {
  const list = events.filter((e) => !e.deleted && (isSession(e) || e.type === 'study') && dayKey(e.at) >= fromDay && dayKey(e.at) <= toDay).sort((a, b) => b.at - a.at);
  const range = fromDay === toDay ? dayTitle(dayDate(toDay)) : `${dayTitle(dayDate(fromDay))} to ${dayTitle(dayDate(toDay))}`;
  const out = [`# ${name.trim() ? `${name.trim()}'s training` : 'Training log'}: ${range}`, ''];
  if (!list.length) out.push('_Nothing logged._', '');
  for (const s of list) out.push(sessionMarkdown(s, events, now), '');
  out.push('_Exported from matlog._', '');
  return out.join('\n');
}

/** A technique's notes as Markdown (for copying out of the library). */
export function techniqueMarkdown(id: string, events: LogEvent[]): string {
  const notes = techNotes(events, id).map((e) => {
    const n = e.detail!.techNote!;
    return `- ${NOTE_KIND_LABEL[n.kind]}: ${sentence(n.text)}${n.url ? ` (${n.url})` : ''}`;
  });
  return [`## ${techniqueLabel(id)}`, '', ...notes].join('\n');
}

// ---------- Import ----------

export interface ParsedRoll {
  detail: Detail;
}

export interface ParsedProblem {
  text: string;
  idea?: string;
  solved?: boolean;
  source?: ProblemSource;
}

export interface ParsedInjury {
  area: string;
  side?: 'left' | 'right' | 'both';
  severity?: 'minor' | 'moderate' | 'serious';
  how?: string;
  around?: string;
}

export interface ParsedTechNote {
  technique: string;
  kind: TechNoteKind;
  text: string;
  url?: string;
}

export interface ParsedSession {
  type: SessionKind | 'study';
  problems: ParsedProblem[];
  injuries?: ParsedInjury[];
  techNotes?: ParsedTechNote[];
  /** Start time; null when the note didn't say (the caller picks one). */
  at: number | null;
  detail: Detail;
  rolls: ParsedRoll[];
}

const KIND_WORDS: [RegExp, SessionKind | 'study'][] = [
  [/\bopen[\s-]?mat\b/i, 'open-mat'],
  [/\bdrill(ing|s)?\b/i, 'drilling'],
  [/\b(comp|competition|tournament)\b/i, 'comp'],
  [/\b(class|lesson|training|fundamentals|advanced)\b/i, 'class'],
  [/\b(study|studied|instructional)\b/i, 'study'],
];

function kindIn(text: string): SessionKind | 'study' | null {
  for (const [re, k] of KIND_WORDS) if (re.test(text)) return k;
  return null;
}

type Section = 'meta' | 'techniques' | 'rounds' | 'problems' | 'injuries' | 'notes';

/** "### Rounds" and friends. Null when a heading isn't a section. */
function sectionIn(h: string): Section | null {
  const t = h.toLowerCase();
  if (/^(rolls?|rounds?|sparring|spar|matches|match)\b/.test(t)) return 'rounds';
  if (/^(techniques?|drilled|covered|taught|moves)\b/.test(t)) return 'techniques';
  if (/^problems?\b/.test(t)) return 'problems';
  if (/^(injuries|injury|hurt)\b/.test(t)) return 'injuries';
  if (/^notes?\b/.test(t)) return 'notes';
  return null;
}

/** "90m", "90 min", "1h30", "1h 30m", "1.5h", "1:30" → minutes. */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase();
  let m = /^(\d+):(\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)\s*(?:(\d+)\s*(m|min|mins|minutes?)?)?$/.exec(s);
  if (m) return Math.round(Number(m[1]) * 60 + (m[3] ? Number(m[3]) : 0));
  m = /^(\d+)\s*(m|min|mins|minutes?)?$/.exec(s);
  if (m) return Number(m[1]);
  return null;
}

/** "2026-10-08 18:00", "2026-10-08T6:30pm", "2026-10-08" → epoch ms (local). */
export function parseDate(text: string): number | null {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i.exec(text);
  if (!m) return null;
  let h = m[4] ? Number(m[4]) : 12;
  const min = m[5] ? Number(m[5]) : 0;
  const ap = m[6]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

const splitList = (v: string) =>
  v
    .split(/,|;|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

const SIZE_WORDS: Record<string, Size> = { smaller: 'smaller', lighter: 'smaller', small: 'smaller', similar: 'similar', same: 'similar', even: 'similar', bigger: 'bigger', heavier: 'bigger', big: 'bigger', larger: 'bigger' };

/** "half guard bottom" → position and side. */
function startOf(v: string): { start: string; role?: Role } {
  const m = /^(.+?)(?:[\s,(]+(top|bottom)\)?)?$/i.exec(v.trim())!;
  return { start: resolvePosition(m[1]), ...(m[2] ? { role: m[2].toLowerCase() as Role } : {}) };
}

function outcomeOf(v: string): Detail['outcome'] | undefined {
  const t = v.trim().toLowerCase();
  if (/^(win|won|w)\b/.test(t)) return 'win';
  if (/^(loss|lost|l)\b/.test(t)) return 'loss';
  if (/^(draw|tie|d)\b/.test(t)) return 'draw';
  return undefined;
}

/** "2", "twice", "none": how many times a side got its goal. */
function countOf(v: string): number | undefined {
  const t = v.trim().toLowerCase();
  const words: Record<string, number> = { none: 0, never: 0, zero: 0, no: 0, once: 1, one: 1, twice: 2, two: 2, three: 3, four: 4, five: 5 };
  const m = /^(\d{1,2})\b/.exec(t);
  if (m) return Number(m[1]);
  const w = /^[a-z]+/.exec(t)?.[0];
  return w !== undefined && w in words ? words[w] : undefined;
}

/** Applies one round detail ("Hit: armbar, kimura") to a round. Returns false for a key it doesn't know. */
function roundKey(d: Detail, key: string, v: string): boolean {
  const add = (field: 'subsFor' | 'subsAgainst' | 'landed' | 'tried' | 'stuck', resolve: (s: string) => string) => {
    d[field] = [...new Set([...(d[field] ?? []), ...splitList(v).map(resolve).filter(Boolean)])];
  };
  if (/^(hit|subs?|finished|submitted|got|tapped them with)$/.test(key)) add('subsFor', resolveSub);
  else if (/^(tapped to|tapped|tapped by|caught (in|by)|lost to)$/.test(key)) add('subsAgainst', resolveSub);
  else if (/^(landed|pulled off|completed)$/.test(key)) add('landed', resolveTechnique);
  else if (/^(went for|tried|attempted|missed|didnt land)$/.test(key)) add('tried', resolveTechnique);
  else if (/^(stuck|stuck in|got stuck|pinned)$/.test(key)) add('stuck', resolvePosition);
  else if (/^(started from|start|from|position|starting position)$/.test(key)) Object.assign(d, startOf(v));
  else if (/^(result|outcome)$/.test(key)) d.outcome = outcomeOf(v) ?? d.outcome;
  else if (/^(goal|goals|rules?|task|game)$/.test(key)) d.goal = v.trim().slice(0, 120) || d.goal;
  else if (/^(got it|got mine|got my goal|i got it|you got it|scored)$/.test(key)) d.goalsFor = countOf(v) ?? d.goalsFor;
  else if (/^(they got it|they got theirs|partner got it|they scored|conceded)$/.test(key)) d.goalsAgainst = countOf(v) ?? d.goalsAgainst;
  else if (/^(how it went|went)$/.test(key)) d.goalNote = [d.goalNote, v.trim()].filter(Boolean).join('; ').slice(0, 500) || undefined;
  else if (key === 'partner') d.partner = v.slice(0, 60);
  else if (key === 'belt' && BELTS.includes(v.toLowerCase().replace(/\s*belt$/, '') as Belt)) d.belt = v.toLowerCase().replace(/\s*belt$/, '') as Belt;
  else if (key === 'size' && SIZE_WORDS[v.toLowerCase()]) d.size = SIZE_WORDS[v.toLowerCase()];
  else if (/^(length|duration|time)$/.test(key) && parseDuration(v)) d.min = parseDuration(v)!;
  else if (/^notes?$/.test(key)) d.note = [d.note, v].filter(Boolean).join('; ').slice(0, 500);
  else return false;
  return true;
}

/**
 * One round's first line: "Sam (purple, bigger, 6m)". The older one-line form also works:
 * "Sam (purple, bigger, 6m): hit armbar; tapped to triangle; stuck in half guard".
 */
export function parseRollLine(line: string): Detail {
  const d: Detail = {};
  const text = line.replace(/^\s*[-*+]\s*/, '').replace(/\*\*/g, '').trim();
  const colon = text.indexOf(':');
  let head = colon >= 0 ? text.slice(0, colon) : text;
  let body = colon >= 0 ? text.slice(colon + 1) : '';
  // "- tapped to heel hook": a round without a name, just what happened.
  if (colon < 0 && /^(hit|got|finished|tapped|caught|stuck|won|lost|draw|landed|tried|attempted|went for|missed)\b/i.test(text)) {
    head = '';
    body = text;
  }
  const tags = /\(([^)]*)\)/.exec(head);
  const name = head
    .replace(/\(([^)]*)\)/, '')
    .replace(/^\s*(vs\.?|with|w\/)\s*/i, '')
    .trim();
  if (name && !/^(round|roll|rolls|match)$/i.test(name)) d.partner = name.slice(0, 60);
  for (const tag of tags ? tags[1].split(/[,/]/) : []) {
    const t = tag.trim().toLowerCase().replace(/\s*belt$/, '');
    if (BELTS.includes(t as Belt)) d.belt = t as Belt;
    else if (SIZE_WORDS[t]) d.size = SIZE_WORDS[t];
    else if (/^(win|won|w|loss|lost|l|draw|tie)$/.test(t)) d.outcome = outcomeOf(t);
    else if (/^from\s+/.test(t)) Object.assign(d, startOf(t.replace(/^from\s+/, '')));
    else if (parseDuration(t)) d.min = parseDuration(t)!;
  }
  const notes: string[] = [];
  for (const clause of body.split(/;|\.\s/).map((c) => c.trim()).filter(Boolean)) {
    const m = /^(tapped to|tapped by|got tapped (?:by|with)|caught (?:in|with|by)|lost to|went for|got stuck(?: in| under)?|stuck(?: in| at| under)?|pinned (?:in|under)|hit|got|finished|subbed(?: with)?|submitted(?: with)?|landed|pulled off|completed|tried|attempted|missed|note|tapped)\s*:?\s*(.+)$/i.exec(clause);
    if (m) {
      const key = m[1]
        .toLowerCase()
        .replace(/^got tapped.*|^caught.*/, 'tapped to')
        .replace(/^(got stuck|stuck|pinned).*/, 'stuck')
        .replace(/^(subbed|submitted).*/, 'hit');
      if (roundKey(d, key, m[2])) continue;
    }
    const o = outcomeOf(clause);
    if (o && clause.split(/\s+/).length <= 2) d.outcome = o;
    else notes.push(clause);
  }
  if (notes.length) d.note = [d.note, ...notes].filter(Boolean).join('; ').slice(0, 500);
  return d;
}

const KV = /^\**([A-Za-z][A-Za-z /'’-]{0,30}?)\**\s*:\s*\**\s*(.*)$/;
const keyOf = (k: string) => k.trim().toLowerCase().replace(/[’']/g, '').replace(/\s*\/\s*/g, ' ');

/** "Left knee (moderate)", or the older "Left knee (moderate): heel hook in round 3". */
function injuryLine(v: string): ParsedInjury {
  const m = /^([^():]+?)\s*(?:\((minor|moderate|serious)\))?\s*(?::\s*(.+))?$/i.exec(v.trim());
  if (!m) return { area: v.trim().slice(0, 60) };
  return { ...parseArea(m[1]), ...(m[2] ? { severity: m[2].toLowerCase() as ParsedInjury['severity'] } : {}), ...(m[3] ? { how: m[3].trim() } : {}) };
}

/**
 * Reads one or more class notes (see NOTE_FORMAT). A heading that names a kind of session starts
 * a session; `### Techniques`, `### Rounds`, `### Problems`, `### Injuries` and `### Notes` start
 * sections; sub-bullets add detail to the bullet above them. Text with no heading at all is one class.
 */
export function parseMarkdown(text: string): ParsedSession[] {
  const out: ParsedSession[] = [];
  let cur: ParsedSession | null = null;
  let section: Section = 'meta';
  const notes = new Map<ParsedSession, string[]>();
  const start = (type: SessionKind | 'study', at: number | null): ParsedSession => {
    const s: ParsedSession = { type, at, detail: {}, rolls: [], problems: [] };
    cur = s;
    out.push(s);
    notes.set(s, []);
    section = 'meta';
    return s;
  };
  const ensure = (): ParsedSession => cur ?? start('class', null);
  const lastTech = (s: ParsedSession) => s.detail.techniques?.[s.detail.techniques.length - 1];

  for (const raw of text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n')) {
    const line = raw.trim();
    if (!line || /^_?exported from matlog/i.test(line.replace(/_/g, ''))) continue;
    const indent = raw.length - raw.trimStart().length;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      const h = heading[1].trim();
      const sec = sectionIn(h);
      if (sec) {
        ensure();
        section = sec;
        continue;
      }
      const k = kindIn(h);
      // An export's title ("# Training log: …") isn't a session.
      if (k && !(/^#\s/.test(line) && /training log|'s training/i.test(h))) start(k, parseDate(h));
      continue;
    }
    const s = ensure();
    const bullet = /^[-*+]\s+/.test(line);
    const body = line.replace(/^[-*+]\s+/, '').replace(/^\[[ x]\]\s*/i, '');
    const sub = bullet && indent >= 2;
    const kv = KV.exec(body);
    const key = kv ? keyOf(kv[1]) : '';
    const v = kv ? kv[2].trim() : '';

    if (section === 'notes') {
      notes.get(s)!.push(raw.replace(/\s+$/, '').replace(/^ {0,3}/, ''));
      continue;
    }
    if (section === 'techniques') {
      if (sub) {
        const t = lastTech(s);
        if (!t) continue;
        const kind: TechNoteKind = /^(key detail|detail|key)$/.test(key) ? 'detail' : key === 'question' ? 'question' : /^(source|link|video|instructional)$/.test(key) ? 'source' : 'observation';
        const value = kv && /^(key detail|detail|key|question|source|link|video|instructional|observation|note|noticed)$/.test(key) ? v : body;
        const url = /\(?(https?:\/\/[^\s)]+)\)?\s*$/.exec(value);
        const textOnly = url ? value.replace(url[0], '').trim() : value;
        if (textOnly || url) (s.techNotes ??= []).push({ technique: t, kind, text: textOnly || url![1], ...(url ? { url: url[1] } : {}) });
        continue;
      }
      const name = body.replace(/:\s*$/, '').trim();
      if (name) s.detail.techniques = [...new Set([...(s.detail.techniques ?? []), resolveTechnique(name)])];
      continue;
    }
    if (section === 'rounds') {
      if (sub && s.rolls.length) {
        const d = s.rolls[s.rolls.length - 1].detail;
        if (!(kv && roundKey(d, key, v))) d.note = [d.note, body].filter(Boolean).join('; ').slice(0, 500);
        continue;
      }
      s.rolls.push({ detail: parseRollLine(body) });
      continue;
    }
    if (section === 'problems') {
      if (sub && s.problems.length) {
        const p = s.problems[s.problems.length - 1];
        if (kv && /^(idea|idea to try|solution|fix|try)$/.test(key)) p.idea = v;
        else if (kv && key === 'source') p.source = /told|coach|partner|external/i.test(v) ? 'external' : /coming|predict/i.test(v) ? 'predictive' : 'internal';
        else p.idea = [p.idea, body].filter(Boolean).join('; ');
        continue;
      }
      s.problems.push({ text: body.replace(/\s*\(solved\)\s*$/i, ''), solved: /\(solved\)\s*$/i.test(body), source: 'internal' });
      continue;
    }
    if (section === 'injuries') {
      const list = (s.injuries ??= []);
      if (sub && list.length) {
        const i = list[list.length - 1];
        if (kv && /^(how|what happened)$/.test(key)) i.how = v;
        else if (kv && /^(training around it|around|avoiding|modifications?)$/.test(key)) i.around = v;
        else if (kv && key === 'severity' && /^(minor|moderate|serious)$/i.test(v)) i.severity = v.toLowerCase() as ParsedInjury['severity'];
        else i.how = [i.how, body].filter(Boolean).join('; ');
        continue;
      }
      list.push(injuryLine(body));
      continue;
    }

    // Session details (and the older one-line forms).
    if (kv) {
      if (/^(type|kind|session)$/.test(key)) {
        const k = kindIn(v);
        if (k) s.type = k;
        continue;
      }
      if (/^(date|when|time|start|started)$/.test(key)) {
        const t = parseDate(v);
        if (t) s.at = t;
        continue;
      }
      if (/^(length|duration|min|minutes|time on mat)$/.test(key)) {
        const m = parseDuration(v);
        if (m) s.detail.min = m;
        continue;
      }
      if (/^(gi|attire|uniform|no-gi|nogi)$/.test(key)) {
        const no = /^no[\s-]?gi$/.test(key) ? !/^(no|false)$/i.test(v) : /no[\s-]?gi|^no$|^false$/i.test(v);
        s.detail.attire = no ? 'nogi' : 'gi';
        continue;
      }
      if (/^(topic|theme|class topic)$/.test(key)) {
        if (v) s.detail.topic = v.slice(0, 120);
        continue;
      }
      if (/^(techniques?|tech|drilled|covered|moves?|taught)$/.test(key)) {
        if (v) s.detail.techniques = [...new Set([...(s.detail.techniques ?? []), ...splitList(v).map(resolveTechnique)])];
        else section = 'techniques';
        continue;
      }
      if (/^(enjoy|enjoyed|enjoyment|fun)$/.test(key)) {
        const m = /^(\d)/.exec(v);
        if (m && Number(m[1]) >= 1 && Number(m[1]) <= 5) s.detail.enjoy = Number(m[1]);
        continue;
      }
      if (/^(plan|followed (my )?plan|followed the plan|on plan)$/.test(key)) {
        const p = v.toLowerCase();
        if (/^(yes|y|mostly)/.test(p)) s.detail.plan = 'yes';
        else if (/^(partly|partially|some|kind of|half)/.test(p)) s.detail.plan = 'partly';
        else if (/^(no|n|not)/.test(p)) s.detail.plan = 'no';
        continue;
      }
      if (/^(problem|problem i hit|problem i hit today|problems)$/.test(key)) {
        if (v) s.problems.push({ text: v.replace(/\s*\(solved\)\s*$/i, ''), solved: /\(solved\)\s*$/i.test(v), source: 'internal' });
        else section = 'problems';
        continue;
      }
      if (/^(injury|injuries|injured|hurt|tweaked)$/.test(key)) {
        if (v) (s.injuries ??= []).push(injuryLine(v));
        else section = 'injuries';
        continue;
      }
      if (/^(idea|idea to try|idea to try solution|solution|fix)$/.test(key)) {
        const last = s.problems[s.problems.length - 1];
        if (last && !last.idea) last.idea = v;
        else if (v) notes.get(s)!.push(`Idea: ${v}`);
        continue;
      }
      if (/^(source|instructional|video)$/.test(key) && s.type === 'study') {
        const url = /\((https?:[^)]+)\)\s*$/.exec(v) ?? /^(https?:\S+)$/.exec(v);
        s.detail.source = v.replace(/\s*\((https?:[^)]+)\)\s*$/, '').slice(0, 200);
        if (url) s.detail.url = url[1];
        continue;
      }
      if (/^(notes?)$/.test(key)) {
        if (v) notes.get(s)!.push(v);
        else section = 'notes';
        continue;
      }
      if (/^(rolls?|rounds?|matches)$/.test(key)) {
        section = 'rounds';
        if (v) s.rolls.push({ detail: parseRollLine(v) });
        continue;
      }
    }
    notes.get(s)!.push(body);
  }
  for (const s of out) {
    const n = notes.get(s)!.join('\n').trim();
    if (n) s.detail.note = n.slice(0, 2000);
  }
  return out.filter((s) => s.at !== null || Object.keys(s.detail).length || s.rolls.length || s.problems.length || s.injuries?.length || s.techNotes?.length);
}

/**
 * Turns parsed notes into events. A session without a date ended at `now`; rounds are laid out
 * one after another inside it (their own length, or `roundMin`, 5 by default) and linked to it.
 */
export function notesToEvents(parsed: ParsedSession[], now: number, defaultMin = 60, roundMin = kindById('roll').defaultMin): LogEvent[] {
  const out: LogEvent[] = [];
  for (const p of parsed) {
    const min = p.detail.min ?? (p.type === 'study' ? 10 : defaultMin);
    const at = p.at ?? now - min * MIN;
    const session = createEvent(p.type, at, { ...p.detail, min }, now);
    out.push(session);
    for (const n of p.techNotes ?? []) out.push(newTechNote(n.technique, n.text, now, { kind: n.kind, url: n.url }));
    for (const inj of p.injuries ?? []) out.push(newInjury(Math.min(at + min * MIN, now), { ...inj, sessionId: session.id }, now));
    for (const pr of p.problems) out.push(newProblem(pr.text, now, { idea: pr.idea, source: pr.source, sessionId: session.id, solvedAt: pr.solved ? now : undefined }));
    let t = at + 60_000;
    for (const r of p.rolls) {
      const rmin = r.detail.min ?? roundMin;
      out.push(createEvent('roll', Math.min(t, at + min * MIN), { ...r.detail, min: rmin, sessionId: session.id }, now));
      t += (rmin + 1) * MIN;
    }
  }
  return out;
}
