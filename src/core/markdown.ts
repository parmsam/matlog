import { positionLabel, resolvePosition, resolveSub, resolveTechnique, subLabel, techniqueLabel } from './catalog';
import { dayDate, dayKey } from './days';
import { createEvent, isSession, minutesOf } from './events';
import { duration, dayTitle } from './format';
import { kindById, type KindId } from './kinds';
import { newProblem, problemsFor } from './notebook';
import { injuryTitle, newInjury, parseArea } from './injuries';
import { rollsIn } from './stats';
import { BELTS, type Belt, type Detail, type LogEvent, type ProblemSource, type Role, type SessionKind, type Size } from './types';

/**
 * Markdown in and out. Export writes each session as a small note; import reads the same format
 * back, and is forgiving about anything a person (or a dictation app) would type:
 *
 *   ## Class · Wed, Oct 8
 *   - Date: 2026-10-08 18:00
 *   - Length: 90m
 *   - Gi: no-gi
 *   - Techniques: knee cut, armbar from guard
 *   - Note: good rounds
 *
 *   ### Rolls
 *   - Sam (purple, bigger, 6m): hit armbar; tapped to triangle; landed knee cut; tried berimbolo; stuck in half guard
 */

const MIN = 60_000;

// ---------- Export ----------

function rollLine(r: LogEvent, now: number): string {
  const d = r.detail ?? {};
  const from = d.start ? `from ${positionLabel(d.start).toLowerCase()}${d.role ? ` ${d.role}` : ''}` : '';
  const tags = [d.belt, d.size, d.outcome, from, `${minutesOf(r, now)}m`].filter(Boolean);
  const who = `${d.partner ?? 'Round'} (${tags.join(', ')})`;
  const bits: string[] = [];
  if (d.subsFor?.length) bits.push(`hit ${d.subsFor.map(subLabel).join(', ')}`);
  if (d.subsAgainst?.length) bits.push(`tapped to ${d.subsAgainst.map(subLabel).join(', ')}`);
  if (d.landed?.length) bits.push(`landed ${d.landed.map(techniqueLabel).join(', ')}`);
  if (d.tried?.length) bits.push(`tried ${d.tried.map(techniqueLabel).join(', ')}`);
  if (d.stuck?.length) bits.push(`stuck in ${d.stuck.map(positionLabel).join(', ')}`);
  if (d.note) bits.push(`note ${d.note.replace(/\s+/g, ' ')}`);
  return `- ${who}${bits.length ? `: ${bits.join('; ')}` : ''}`;
}

const stamp = (ts: number) => {
  const d = new Date(ts);
  return `${dayKey(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function sessionMarkdown(s: LogEvent, events: LogEvent[], now: number): string {
  const kind = kindById(s.type as KindId);
  const d = s.detail ?? {};
  const out = [`## ${kind.label} · ${dayTitle(dayDate(dayKey(s.at)))}`, '', `- Date: ${stamp(s.at)}`, `- Length: ${duration(minutesOf(s, now) * MIN)}`];
  if (d.attire) out.push(`- Gi: ${d.attire === 'gi' ? 'gi' : 'no-gi'}`);
  if (d.techniques?.length) out.push(`- Techniques: ${d.techniques.map(techniqueLabel).join(', ')}`);
  if (d.source) out.push(`- Source: ${d.source}${d.url ? ` (${d.url})` : ''}`);
  if (d.enjoy) out.push(`- Enjoyed: ${d.enjoy}/5`);
  if (d.plan) out.push(`- Followed my plan: ${d.plan}`);
  if (d.note) out.push(`- Note: ${d.note.replace(/\s+/g, ' ')}`);
  for (const i of events.filter((e) => !e.deleted && e.type === 'injury' && e.detail?.injury?.sessionId === s.id)) {
    const d = i.detail!.injury!;
    out.push(`- Injury: ${injuryTitle(d)}${d.severity ? ` (${d.severity})` : ''}${d.how ? `: ${d.how}` : ''}`);
  }
  for (const p of problemsFor(s.id, events)) {
    const pr = p.detail!.problem!;
    out.push(`- Problem: ${pr.text}${pr.solvedAt ? ' (solved)' : ''}`);
    if (pr.idea) out.push(`- Idea: ${pr.idea}`);
  }
  const rs = s.type === 'study' ? [] : rollsIn(s, events, now);
  if (rs.length) out.push('', '### Rolls', ...rs.map((r) => rollLine(r, now)));
  return out.join('\n');
}

/** Sessions between two days (inclusive), newest first, as Markdown. */
export function toMarkdown(events: LogEvent[], fromDay: string, toDay: string, now: number, name = ''): string {
  const list = events.filter((e) => !e.deleted && (isSession(e) || e.type === 'study') && dayKey(e.at) >= fromDay && dayKey(e.at) <= toDay).sort((a, b) => b.at - a.at);
  const range = fromDay === toDay ? dayTitle(dayDate(toDay)) : `${dayTitle(dayDate(fromDay))} – ${dayTitle(dayDate(toDay))}`;
  const out = [`# ${name.trim() ? `${name.trim()}'s training` : 'Training log'} · ${range}`, ''];
  if (!list.length) out.push('_Nothing logged._', '');
  for (const s of list) out.push(sessionMarkdown(s, events, now), '');
  out.push('_Exported from matlog._', '');
  return out.join('\n');
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
}

export interface ParsedSession {
  type: SessionKind | 'study';
  problems: ParsedProblem[];
  injuries?: ParsedInjury[];
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

/** One roll bullet: "Sam (purple, bigger, 6m): hit armbar; tapped to triangle; stuck in half guard". */
export function parseRollLine(line: string): Detail {
  const d: Detail = {};
  let text = line.replace(/^\s*[-*+]\s*/, '').replace(/\*\*/g, '').trim();
  // Who and tags before the colon.
  const colon = text.indexOf(':');
  let head = colon >= 0 ? text.slice(0, colon) : '';
  let body = colon >= 0 ? text.slice(colon + 1) : text;
  if (colon < 0 && !/\b(hit|got|finished|tapped|caught|stuck|won|lost|draw|sub|landed|tried|attempted|went for|missed)/i.test(text)) {
    head = text;
    body = '';
  }
  const tags = /\(([^)]*)\)/.exec(head);
  const name = head
    .replace(/\(([^)]*)\)/, '')
    .replace(/^\s*(vs\.?|with|w\/)\s*/i, '')
    .trim();
  if (name && !/^(round|roll|rolls)$/i.test(name)) d.partner = name.slice(0, 60);
  for (const tag of tags ? tags[1].split(/[,/]/) : []) {
    const t = tag.trim().toLowerCase().replace(/\s*belt$/, '');
    if (BELTS.includes(t as Belt)) d.belt = t as Belt;
    else if (SIZE_WORDS[t]) d.size = SIZE_WORDS[t];
    else if (/^(win|won|w)$/.test(t)) d.outcome = 'win';
    else if (/^(loss|lost|l)$/.test(t)) d.outcome = 'loss';
    else if (/^(draw|tie)$/.test(t)) d.outcome = 'draw';
    else if (/^from\s+/.test(t)) {
      const m = /^from\s+(.+?)(?:\s+(top|bottom))?$/.exec(t)!;
      d.start = resolvePosition(m[1]);
      if (m[2]) d.role = m[2] as Role;
    }
    else if (parseDuration(t)) d.min = parseDuration(t)!;
  }
  text = body;
  const subsFor: string[] = [];
  const subsAgainst: string[] = [];
  const stuck: string[] = [];
  const landed: string[] = [];
  const tried: string[] = [];
  const notes: string[] = [];
  for (const clause of text.split(/;|\.\s/).map((c) => c.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^(?:landed|pulled off|completed)\s*:?\s*(.+)$/i.exec(clause))) landed.push(...splitList(m[1]).map(resolveTechnique));
    else if ((m = /^(?:tried|attempted|went for|missed|failed)\s*:?\s*(.+)$/i.exec(clause))) tried.push(...splitList(m[1]).map(resolveTechnique));
    else if ((m = /^(?:tapped to|tapped by|got tapped (?:by|with)|caught (?:in|with|by)|tapped|lost to)\s*:?\s*(.+)$/i.exec(clause))) subsAgainst.push(...splitList(m[1]).map(resolveSub));
    else if ((m = /^(?:hit|got|finished|subbed (?:with|them with)?|sub(?:mitted)?(?: with)?|caught them (?:in|with))\s*:?\s*(.+)$/i.exec(clause))) subsFor.push(...splitList(m[1]).map(resolveSub));
    else if ((m = /^(?:stuck(?: in| at| under)?|got stuck(?: in| under)?|pinned (?:in|under))\s*:?\s*(.+)$/i.exec(clause))) stuck.push(...splitList(m[1]).map(resolvePosition));
    else if ((m = /^note\s*:?\s*(.+)$/i.exec(clause))) notes.push(m[1]);
    else if (/^(won|win)\b/i.test(clause)) d.outcome = 'win';
    else if (/^(lost|loss)\b/i.test(clause)) d.outcome = 'loss';
    else if (/^draw\b/i.test(clause)) d.outcome = 'draw';
    else notes.push(clause);
  }
  if (subsFor.length) d.subsFor = subsFor.filter(Boolean);
  if (subsAgainst.length) d.subsAgainst = subsAgainst.filter(Boolean);
  if (stuck.length) d.stuck = stuck.filter(Boolean);
  if (landed.length) d.landed = landed.filter(Boolean);
  if (tried.length) d.tried = tried.filter(Boolean);
  if (notes.length) d.note = notes.join('; ').slice(0, 500);
  return d;
}

/**
 * Reads one or more class notes. A heading that names a kind of session (class, open mat,
 * drilling, comp) starts a session; a heading with "roll", "round" or "sparring" starts its rolls.
 * Text with no heading at all is one session.
 */
export function parseMarkdown(text: string): ParsedSession[] {
  const out: ParsedSession[] = [];
  let cur: ParsedSession | null = null;
  let inRolls = false;
  const notes = new Map<ParsedSession, string[]>();
  const ensure = (): ParsedSession => {
    if (!cur) {
      cur = { type: 'class', at: null, detail: {}, rolls: [], problems: [] };
      out.push(cur);
      notes.set(cur, []);
    }
    return cur;
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || /^_?exported from matlog/i.test(line.replace(/_/g, ''))) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      const h = heading[1];
      if (/\b(rolls?|rounds?|sparring|spar)\b/i.test(h) && !kindIn(h.replace(/\b(rolls?|rounds?|sparring|spar)\b/gi, ''))) {
        ensure();
        inRolls = true;
        continue;
      }
      const k = kindIn(h);
      // A top-level export title ("Training log · …") with sessions under it isn't a session.
      if (k && !(/^#\s/.test(line) && /training log|'s training/i.test(h))) {
        cur = { type: k, at: parseDate(h), detail: {}, rolls: [], problems: [] };
        out.push(cur);
        notes.set(cur, []);
        inRolls = false;
      }
      continue;
    }
    const s = ensure();
    const bullet = /^[-*+]\s+/.test(line);
    if (inRolls && bullet) {
      s.rolls.push({ detail: parseRollLine(line) });
      continue;
    }
    const kv = /^(?:[-*+]\s+)?\**([A-Za-z][A-Za-z /-]{0,30}?)\**\s*:\s*\**\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1].trim().toLowerCase().replace(/\s*\/\s*/g, ' ');
      const v = kv[2].trim();
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
      if (/^(techniques?|tech|drilled|covered|moves?|taught)$/.test(key)) {
        s.detail.techniques = [...(s.detail.techniques ?? []), ...splitList(v).map(resolveTechnique)];
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
      if (/^(problem|problem i hit|problem i hit today|problems?)$/.test(key)) {
        if (v) s.problems.push({ text: v.replace(/\s*\(solved\)\s*$/i, ''), solved: /\(solved\)\s*$/i.test(v), source: 'internal' });
        continue;
      }
      if (/^(injury|injured|hurt|tweaked)$/.test(key)) {
        // "Left knee (moderate): heel hook in round 3"
        const m = /^([^():]+?)\s*(?:\((minor|moderate|serious)\))?\s*(?::\s*(.+))?$/i.exec(v);
        if (m) (s.injuries ??= []).push({ ...parseArea(m[1]), ...(m[2] ? { severity: m[2].toLowerCase() as ParsedInjury['severity'] } : {}), ...(m[3] ? { how: m[3].trim() } : {}) });
        continue;
      }
      if (/^(idea|idea to try|idea to try solution|solution|fix)$/.test(key)) {
        const last = s.problems[s.problems.length - 1];
        if (last && !last.idea) last.idea = v;
        else if (v) notes.get(s)!.push(`Idea: ${v}`);
        continue;
      }
      if (/^(source|from|instructional|video)$/.test(key) && s.type === 'study') {
        const url = /\((https?:[^)]+)\)\s*$/.exec(v) ?? /^(https?:\S+)$/.exec(v);
        s.detail.source = v.replace(/\s*\((https?:[^)]+)\)\s*$/, '').slice(0, 200);
        if (url) s.detail.url = url[1];
        continue;
      }
      if (/^(notes?)$/.test(key)) {
        notes.get(s)!.push(v);
        continue;
      }
      if (/^(rolls?|rounds?)$/.test(key)) {
        inRolls = true;
        if (v) s.rolls.push({ detail: parseRollLine(v) });
        continue;
      }
    }
    notes.get(s)!.push(line.replace(/^[-*+>]\s+/, ''));
  }
  for (const s of out) {
    const n = notes.get(s)!.join('\n').trim();
    if (n) s.detail.note = n.slice(0, 2000);
    // A date heading without a "Date:" line ("## Class 2026-10-08 18:00") was read above.
  }
  return out.filter((s) => s.at !== null || Object.keys(s.detail).length || s.rolls.length || s.problems.length || s.injuries?.length);
}

/**
 * Turns parsed notes into events. A session without a date ended at `now`; rounds are laid out
 * one after another inside it (their own length, or `roundMin`, 5 by default), so they belong to it by time.
 */
export function notesToEvents(parsed: ParsedSession[], now: number, defaultMin = 60, roundMin = kindById('roll').defaultMin): LogEvent[] {
  const out: LogEvent[] = [];
  for (const p of parsed) {
    const min = p.detail.min ?? (p.type === 'study' ? 10 : defaultMin);
    const at = p.at ?? now - min * MIN;
    const session = createEvent(p.type, at, { ...p.detail, min }, now);
    out.push(session);
    for (const inj of p.injuries ?? []) out.push(newInjury(Math.min(at + min * MIN, now), { ...inj, sessionId: session.id }, now));
    for (const pr of p.problems) out.push(newProblem(pr.text, now, { idea: pr.idea, source: pr.source, sessionId: session.id, solvedAt: pr.solved ? now : undefined }));
    let t = at + 60_000;
    for (const r of p.rolls) {
      const rmin = r.detail.min ?? roundMin;
      out.push(createEvent('roll', Math.min(t, at + min * MIN), { ...r.detail, min: rmin }, now));
      t += (rmin + 1) * MIN;
    }
  }
  return out;
}
