import { techniqueById, visibleTechniques, POSITIONS, positionLabel, resolvePosition, resolveSub, resolveTechnique, subLabel, SUBMISSIONS, techniqueLabel } from '../core/catalog';
import { createEvent, isSession, isTimedType, SESSION_KINDS } from '../core/events';
import { fromLocalInput, toLocalInput } from '../core/format';
import { kindById, ongoingRoll, ongoingSession, type KindId } from '../core/kinds';
import { classStart } from '../core/ops';
import { addEvent, app, deleteEvent, getEvent, revertTo, settings, updateEvent } from '../core/log';
import { nextRoundSetup, rollsIn, rollStats, techniqueUses } from '../core/stats';
import { BELTS, type Attire, type Belt, type Detail, type EventType, type LogEvent, type Outcome, type PlanFollowed, type Role, type Size } from '../core/types';
import { companionReact } from './companion';
import { BELT_LABEL, esc, openDialog, sheetHead } from './dom';
import { requestPersistence } from './persist';
import { toast, type ToastAction } from './toast';
import { openReflect } from './reflectView';
import { openInjuries } from './injuriesView';

export interface SheetOpts {
  /** Edit this event. */
  event?: LogEvent;
  /** Or start a new one of this type. */
  type?: EventType;
  /** Start time for a new entry. */
  at?: number;
  /** New entry that's still going. */
  running?: boolean;
  detail?: Detail;
  /** Shown above the form (e.g. "Round over. How did it go?"). */
  intro?: string;
}

interface Draft {
  type: EventType;
  at: string;
  len: string;
  running: boolean;
  detail: Detail;
}

const MIN = 60_000;
const dialog = () => document.getElementById('sheet') as HTMLDialogElement;

let draft: Draft;
let existing: LogEvent | undefined;
let intro = '';
let error = '';
/** True while the sheet's HTML is being replaced: removing a focused input fires blur/change, which must not render again. */
let rendering = false;

const isTimed = isTimedType;
const sessionLike = (t: EventType) => (SESSION_KINDS as readonly string[]).includes(t);

function picks<T extends string>(field: string, options: [T, string][], value: T | undefined, legend: string, extra = ''): string {
  return `<fieldset class="field"><legend>${legend}</legend><div class="picks" role="group">${options
    .map(([v, label]) => `<button type="button" class="pick ${extra}" data-pick="${field}" data-value="${esc(v)}" aria-pressed="${v === value}">${label}</button>`)
    .join('')}</div></fieldset>`;
}

/** A tag list: chips you can remove, a text box (Enter or comma adds), and quick suggestions. */
function tags(field: 'techniques' | 'subsFor' | 'subsAgainst' | 'stuck' | 'landed' | 'tried', legend: string, label: (id: string) => string, suggestions: [string, string][], placeholder: string, listId?: string): string {
  const list = draft.detail[field] ?? [];
  const chips = list.map((id) => `<button type="button" class="tag-chip" data-untag="${field}" data-value="${esc(id)}" aria-label="Remove ${esc(label(id))}">${esc(label(id))}</button>`).join('');
  const sug = suggestions
    // Techniques you've hidden stay out of every suggestion list, recent ones included.
    .filter(([id]) => !list.includes(id) && !techniqueById(id)?.hidden)
    .slice(0, 6)
    .map(([id, l]) => `<button type="button" class="pick" data-tag="${field}" data-value="${esc(id)}">+ ${esc(l)}</button>`)
    .join('');
  return `<div class="field"><span class="field-label" id="lbl-${field}">${legend}</span>
    <div class="tags-input">${chips}<input type="text" data-tags="${field}" aria-labelledby="lbl-${field}" placeholder="${placeholder}" ${listId ? `list="${listId}"` : ''} autocomplete="off" enterkeyhint="done" /></div>
    ${sug ? `<div class="suggest">${sug}</div>` : ''}</div>`;
}

/** A count you tap up and down: how many times you (or they) got the goal in a situational round. */
function counter(field: 'goalsFor' | 'goalsAgainst', legend: string): string {
  const v = draft.detail[field] ?? 0;
  return `<div class="field"><span class="field-label" id="lbl-${field}">${legend}</span><div class="stepper" role="group" aria-labelledby="lbl-${field}">
    <button type="button" class="pick" data-step="${field}" data-value="-1" aria-label="One fewer" ${v ? '' : 'disabled'}>−</button>
    <output aria-live="polite">${v}</output>
    <button type="button" class="pick" data-step="${field}" data-value="1" aria-label="One more">+</button></div></div>`;
}

function datalists(): string {
  const partners = rollStats(app.get().events).partners.map((p) => p.label);
  const goals = [...new Set(app.get().events.filter((e) => !e.deleted && e.type === 'roll' && e.detail?.goal?.trim()).sort((a, b) => b.at - a.at).map((e) => e.detail!.goal!.trim()))].slice(0, 30);
  return `<datalist id="dl-tech">${visibleTechniques().map((t) => `<option value="${esc(t.label)}"></option>`).join('')}</datalist>
    <datalist id="dl-subs">${SUBMISSIONS.map((s) => `<option value="${esc(s.label)}"></option>`).join('')}</datalist>
    <datalist id="dl-pos">${POSITIONS.filter((p) => p.id !== 'submission').map((p) => `<option value="${esc(p.label)}"></option>`).join('')}</datalist>
    <datalist id="dl-topics">${[...new Set([...app.get().events.filter((e) => !e.deleted && e.detail?.topic).sort((a, b) => b.at - a.at).map((e) => e.detail!.topic!), ...POSITIONS.filter((p) => p.id !== 'submission').map((p) => p.label), ...visibleTechniques().map((t) => t.label)])].slice(0, 120).map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
    <datalist id="dl-partners">${partners.map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>
    <datalist id="dl-goals">${goals.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>`;
}

/** Is this round a match in a comp? Then its result matters more than usual. */
const inCompSession = (r: LogEvent) => app.get().events.some((s) => s.type === 'comp' && !s.deleted && rollsIn(s, app.get().events, Date.now()).some((x) => x.id === r.id));

/** Folded sections remember being opened while the sheet is open (it re-renders on every pick). */
const openSections = new Set<string>();

/** A folded group of optional fields: "Check-in · 2" says what's filled in without opening it. */
function section(id: string, title: string, filled: number, body: string): string {
  if (!body.trim()) return '';
  return `<details class="fold" data-section="${id}" ${openSections.has(id) ? 'open' : ''}><summary><span>${title}</span>${filled ? `<span class="fold-count">${filled}</span>` : ''}</summary><div class="fold-body">${body}</div></details>`;
}

const n = (...xs: unknown[]) => xs.filter((x) => (Array.isArray(x) ? x.length : !!x)).length;

function noteField(): string {
  return `<label class="field"><span class="field-label">Note</span><textarea data-f="note" rows="3" placeholder="anything worth remembering">${esc(draft.detail.note ?? '')}</textarea></label>`;
}

function sessionFields(): string {
  const d = draft.detail;
  const kinds = SESSION_KINDS.map((k) => [k, `${kindById(k).emoji} ${kindById(k).label}`] as [string, string]);
  const recent = techniqueUses(app.get().events).map((u) => [u.id, u.label] as [string, string]);
  const sug = recent.length ? recent : visibleTechniques().slice(0, 8).map((t) => [t.id, t.label] as [string, string]);
  const rounds = existing && sessionLike(existing.type) ? rollsIn(existing, app.get().events, Date.now()).length : 0;
  return [
    picks('type', kinds, draft.type, 'Session'),
    picks<Attire>('attire', [['gi', 'Gi'], ['nogi', 'No-gi']], d.attire, 'Gi or no-gi'),
    `<label class="field"><span class="field-label">Topic (optional)</span><input type="text" data-f="topic" value="${esc(d.topic ?? '')}" list="dl-topics" maxlength="120" autocomplete="off" placeholder="what the class was about, e.g. half guard passing" /></label>`,
    tags('techniques', 'Techniques', techniqueLabel, sug, 'Search or add a technique…', 'dl-tech'),
    timeFields(),
    section('note', 'Note', n(d.note?.trim()), noteField()),
    section('checkin', 'Check-in: enjoyed it, followed my plan', n(d.enjoy, d.plan), checkIn()),
    existing && sessionLike(existing.type) ? section('rounds', existing.type === 'comp' ? 'Matches' : 'Rounds', rounds, roundsList()) : '',
  ].join('');
}

const FACES: [string, string][] = [
  ['1', '😩'],
  ['2', '🙁'],
  ['3', '😐'],
  ['4', '🙂'],
  ['5', '😄'],
];

/** "Am I still enjoying this? Did I follow my plan?": a quick check-in, usually filled in when reflecting. */
function checkIn(): string {
  const d = draft.detail;
  return `${picks('enjoy', FACES, d.enjoy ? String(d.enjoy) : undefined, 'Enjoyed it', 'face')}
    ${picks<PlanFollowed>('plan', [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']], d.plan, 'Followed my plan')}`;
}

/** The rounds inside a session you're editing, so a whole open mat can be filled in afterwards. */
function roundsList(): string {
  if (!existing || !sessionLike(existing.type)) return '';
  const now = Date.now();
  const rs = rollsIn(existing, app.get().events, now);
  const rows = rs
    .map((r) => {
      const d = r.detail ?? {};
      const score = d.goalsFor !== undefined || d.goalsAgainst !== undefined ? `goal ${d.goalsFor ?? 0}–${d.goalsAgainst ?? 0}` : '';
      const bits = [d.belt, d.subsFor?.length ? `✓ ${d.subsFor.map(subLabel).join(', ')}` : '', d.subsAgainst?.length ? `✗ ${d.subsAgainst.map(subLabel).join(', ')}` : '', score, d.outcome].filter(Boolean);
      return `<li><button type="button" class="chip" data-edit-round="${r.id}">${esc(d.partner ?? 'Round')}${bits.length ? ` · ${esc(bits.join(' · '))}` : ''}</button></li>`;
    })
    .join('');
  return `<ul class="round-list">${rows}<li><button type="button" class="chip primary" data-add-round>+ Add ${existing.type === 'comp' ? 'a match' : 'a round'}</button></li></ul>`;
}

function studyFields(): string {
  const d = draft.detail;
  const recent = techniqueUses(app.get().events).map((u) => [u.id, u.label] as [string, string]);
  return `<label class="field"><span class="field-label">What you studied</span>
      <input type="text" data-f="source" value="${esc(d.source ?? '')}" placeholder="an instructional, a coach's video, your notes" maxlength="200" autocomplete="off" /></label>
    <label class="field"><span class="field-label">Link (optional)</span>
      <input type="url" data-f="url" value="${esc(d.url ?? '')}" placeholder="https://" autocomplete="off" /></label>
    ${tags('techniques', 'Techniques', techniqueLabel, recent.length ? recent : visibleTechniques().slice(0, 8).map((t) => [t.id, t.label] as [string, string]), 'Search or add a technique…', 'dl-tech')}
    ${timeFields()}
    ${section('note', 'Note', n(d.note?.trim()), noteField())}`;
}

function rollFields(): string {
  const d = draft.detail;
  const st = rollStats(app.get().events);
  const subSug = (mine: { id: string; label: string }[]) =>
    [...mine.map((c) => [c.id, c.label] as [string, string]), ...SUBMISSIONS.map((s) => [s.id, s.label] as [string, string])].filter(([id], i, a) => a.findIndex(([x]) => x === id) === i);
  // Moves: what you drill and try most, then the catalog's sweeps, passes and takedowns.
  const moveSug = [
    ...techniqueUses(app.get().events).sort((a, b) => b.attempts + b.sessions - (a.attempts + a.sessions)).map((u) => [u.id, u.label] as [string, string]),
    ...visibleTechniques().filter((t) => t.kind !== 'submission').map((t) => [t.id, t.label] as [string, string]),
  ].filter(([id], i, a) => a.findIndex(([x]) => x === id) === i);
  const stuckSug = [...st.stuck.map((c) => [c.id, c.label] as [string, string]), ...POSITIONS.filter((p) => p.id !== 'submission').map((p) => [p.id, p.label] as [string, string])].filter(([id], i, a) => a.findIndex(([x]) => x === id) === i);
  const starts = POSITIONS.filter((p) => p.id !== 'submission');
  const inComp = !!existing && inCompSession(existing);
  const positions = `<div class="row stack-sm"><label class="field"><span class="field-label">Started from</span>
      <select data-f="start"><option value="">Standing / not positional</option>${starts.map((p) => `<option value="${p.id}" ${d.start === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      ${picks<Role>('role', [['bottom', 'Bottom'], ['top', 'Top']], d.role, 'You were')}</div>
    <label class="field"><span class="field-label">Goal or rules</span>
      <input type="text" data-f="goal" value="${esc(d.goal ?? '')}" list="dl-goals" maxlength="120" autocomplete="off" placeholder="e.g. bottom escapes or sweeps, top passes or subs" /></label>
    <div class="row">${counter('goalsFor', 'You got yours')}${counter('goalsAgainst', 'They got theirs')}</div>
    <label class="field"><span class="field-label">How it went</span><textarea data-f="goalNote" rows="2" maxlength="500" placeholder="e.g. got out twice once I framed early, got flattened when tired">${esc(d.goalNote ?? '')}</textarea></label>
    ${tags('stuck', 'Where you got stuck', positionLabel, stuckSug, 'Add a position…', 'dl-pos')}`;
  const moves = `${tags('landed', 'Landed', techniqueLabel, moveSug, 'A sweep, pass, takedown…', 'dl-tech')}
    ${tags('tried', 'Went for, didn’t land', techniqueLabel, moveSug, 'A move…', 'dl-tech')}`;
  const more = `${picks<Outcome>('outcome', [['win', 'Win'], ['draw', 'Draw'], ['loss', 'Loss']], d.outcome, 'Result (comp matches)')}
    ${timeFields()}
    ${noteField()}`;
  return `<label class="field"><span class="field-label">Partner</span>
      <input type="text" data-f="partner" value="${esc(d.partner ?? '')}" list="dl-partners" placeholder="optional" autocomplete="off" maxlength="60" /></label>
    ${picks<Belt>('belt', BELTS.map((b) => [b, `<span class="dot" style="--sw: var(--belt-${b})"></span>${BELT_LABEL[b]}`] as [Belt, string]), d.belt, 'Their belt', 'belt')}
    ${picks<Size>('size', [['smaller', 'Smaller'], ['similar', 'Similar'], ['bigger', 'Bigger']], d.size, 'Their size')}
    ${tags('subsFor', 'Subs you hit', subLabel, subSug(st.forBy), 'Add a submission…', 'dl-subs')}
    ${tags('subsAgainst', 'Tapped to', subLabel, subSug(st.againstBy), 'Add a submission…', 'dl-subs')}
    ${section('moves', 'Moves: landed, went for', n(d.landed, d.tried), moves)}
    ${section('positions', 'Situation: where it started, goal, how it went', n(d.start, d.goal?.trim(), d.goalsFor !== undefined || d.goalsAgainst !== undefined, d.goalNote?.trim(), d.stuck), positions)}
    ${section('more', inComp ? 'Result, time and note' : 'Time and note', n(d.outcome, d.note?.trim()), more)}`;
}

function promotionFields(): string {
  const d = draft.detail;
  return `${picks<Belt>('belt', BELTS.map((b) => [b, `<span class="dot" style="--sw: var(--belt-${b})"></span>${BELT_LABEL[b]}`] as [Belt, string]), d.belt, 'Belt', 'belt')}
    ${picks('stripes', [0, 1, 2, 3, 4].map((x) => [String(x), x ? `${x} stripe${x === 1 ? '' : 's'}` : 'No stripes'] as [string, string]), String(d.stripes ?? 0), 'Stripes')}
    ${timeFields()}
    ${noteField()}`;
}

function timeFields(): string {
  if (draft.type === 'promotion') {
    return `<label class="field"><span class="field-label">Date</span><input type="date" data-f="date" value="${draft.at.slice(0, 10)}" /></label>`;
  }
  const canRun = draft.running || !existing || existing.endAt === undefined;
  return `<div class="row stack-sm">
      <label class="field"><span class="field-label">Started</span><input type="datetime-local" data-f="at" value="${draft.at}" /></label>
      <label class="field"><span class="field-label">Length (min)</span><input type="number" data-f="len" inputmode="numeric" min="1" max="600" value="${draft.len}" ${draft.running ? 'disabled' : ''} /></label>
    </div>
    ${canRun ? `<label class="check"><input type="checkbox" data-f="running" ${draft.running ? 'checked' : ''} /> Still going (the timer keeps running)</label>` : ''}`;
}

function render(focusTags?: string) {
  const t = draft.type;
  const title = existing
    ? `${t === 'promotion' ? '🎖️ Promotion' : `${kindById(t as KindId).emoji} ${kindById(t as KindId).label}`}`
    : t === 'promotion'
      ? 'New promotion'
      : t === 'roll'
        ? 'New round'
        : t === 'study'
          ? 'New study session'
          : 'New session';
  // Which sections are open is read from the sheet itself just before redrawing: the toggle event
  // comes a moment later, and a quick Enter could redraw first and close the section again.
  dialog()
    .querySelectorAll<HTMLDetailsElement>('details[data-section]')
    .forEach((x) => (x.open ? openSections.add(x.dataset.section!) : openSections.delete(x.dataset.section!)));
  const fields = sessionLike(t) ? sessionFields() : t === 'roll' ? rollFields() : t === 'study' ? studyFields() : promotionFields();
  rendering = true;
  try {
    // Everything optional folds; Cancel and Save stay pinned to the bottom; the rarer actions are text links.
    const extras = [
      existing && sessionLike(existing.type) && !draft.running ? `<button type="button" class="link-btn" data-reflect-session>📓 ${existing.detail?.reflectedAt ? 'Reflect again' : 'Reflect'}</button>` : '',
      existing && (sessionLike(existing.type) || existing.type === 'roll') ? '<button type="button" class="link-btn" data-hurt>🩹 Got hurt?</button>' : '',
      existing ? '<button type="button" class="link-btn danger-link" data-delete>Delete</button>' : '',
    ].filter(Boolean);
    dialog().innerHTML = `<form novalidate class="sheet-form">${sheetHead('sheet-title', title)}<div class="sheet-body">
    ${intro ? `<p class="hint" style="margin-top:0">${esc(intro)}</p>` : ''}
    ${fields}
    ${extras.length ? `<p class="sheet-extras">${extras.join('')}</p>` : ''}
    </div>
    <div class="sheet-foot">
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
      <button type="button" class="btn" data-close>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>${datalists()}</form>`;
  } finally {
    rendering = false;
  }
  if (focusTags) dialog().querySelector<HTMLInputElement>(`[data-tags="${focusTags}"]`)?.focus();
}

const RESOLVE_LABEL: Partial<Record<keyof Detail, (id: string) => string>> = { techniques: techniqueLabel, landed: techniqueLabel, tried: techniqueLabel, subsFor: subLabel, subsAgainst: subLabel, stuck: positionLabel };
const RESOLVE: Record<string, (s: string) => string> = { techniques: resolveTechnique, landed: resolveTechnique, tried: resolveTechnique, subsFor: resolveSub, subsAgainst: resolveSub, stuck: resolvePosition };

function addTag(field: keyof Detail, text: string) {
  const parts = text
    .split(',')
    .map((s) => RESOLVE[field](s.trim()))
    .filter(Boolean);
  if (!parts.length) return false;
  const cur = (draft.detail[field] as string[] | undefined) ?? [];
  (draft.detail as Record<string, unknown>)[field] = [...new Set([...cur, ...parts])];
  return true;
}

/** Text typed in a tag box but not yet added still counts when saving. */
function flushTagInputs() {
  dialog()
    .querySelectorAll<HTMLInputElement>('[data-tags]')
    .forEach((i) => {
      if (i.value.trim()) addTag(i.dataset.tags as keyof Detail, i.value);
      i.value = '';
    });
}

function wire() {
  const d = dialog();
  if (d.dataset.sheetWired) return;
  d.dataset.sheetWired = '1';
  d.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick], [data-step], [data-tag], [data-untag], [data-delete], [data-add-round], [data-edit-round], [data-reflect-session], [data-hurt]');
    if (!el) return;
    if (el.dataset.hurt !== undefined) {
      // Opens on top of this sheet, prefilled with when and where; closing it comes back here.
      const ev = existing!;
      const session = ev.type === 'roll' ? app.get().events.find((s) => isSession(s) && !s.deleted && rollsIn(s, app.get().events, Date.now()).some((r) => r.id === ev.id)) : ev;
      const who = ev.type === 'roll' && draft.detail.partner ? `rolling with ${draft.detail.partner}` : '';
      return openInjuries({ log: { at: ev.at, sessionId: session?.id, rollId: ev.type === 'roll' ? ev.id : undefined, how: who } });
    }
    if (el.dataset.delete !== undefined) return remove();
    if (el.dataset.reflectSession !== undefined) {
      const id = existing!.id;
      if (!save({ quiet: true })) return;
      return openReflect(getEvent(id)!);
    }
    // Switching to a round saves the session first, so nothing typed here is lost.
    if (el.dataset.addRound !== undefined || el.dataset.editRound) {
      const session = existing!;
      const round = el.dataset.editRound;
      if (!save({ quiet: true })) return;
      const s = getEvent(session.id)!;
      if (round) return openSheet({ event: getEvent(round)! });
      const inside = rollsIn(s, app.get().events, Date.now());
      const last = inside[inside.length - 1];
      const start = last ? (last.endAt ?? last.at + (last.detail?.min ?? settings.get().roundMin) * MIN) + MIN : s.at + 5 * MIN;
      return openSheet({ type: 'roll', at: start, detail: { ...nextRoundSetup(s, app.get().events, Date.now()), sessionId: s.id }, intro: `${s.type === 'comp' ? 'A match' : 'A round'} in ${kindById(s.type as KindId).label.toLowerCase()}.` });
    }
    if (el.dataset.step) {
      const f = el.dataset.step as 'goalsFor' | 'goalsAgainst';
      draft.detail[f] = Math.min(99, Math.max(0, (draft.detail[f] ?? 0) + Number(el.dataset.value)));
      render();
      // Keep focus on the button, so tapping or pressing Space again keeps counting.
      const again = dialog().querySelector<HTMLButtonElement>(`[data-step="${f}"][data-value="${el.dataset.value}"]`);
      return (again && !again.disabled ? again : dialog().querySelector<HTMLButtonElement>(`[data-step="${f}"][data-value="1"]`))?.focus();
    }
    if (el.dataset.pick) {
      const field = el.dataset.pick;
      const v = el.dataset.value!;
      if (field === 'type') draft.type = v as EventType;
      else if (field === 'stripes') draft.detail.stripes = Number(v);
      else if (field === 'enjoy') draft.detail.enjoy = draft.detail.enjoy === Number(v) ? undefined : Number(v);
      else {
        const rec = draft.detail as Record<string, unknown>;
        rec[field] = rec[field] === v ? undefined : v;
      }
    } else if (el.dataset.tag) addTag(el.dataset.tag as keyof Detail, el.dataset.value!);
    else if (el.dataset.untag) {
      const f = el.dataset.untag as keyof Detail;
      (draft.detail as Record<string, unknown>)[f] = ((draft.detail[f] as string[]) ?? []).filter((x) => x !== el.dataset.value);
    }
    render();
  });
  d.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const f = el.dataset.f;
    if (f === 'partner') draft.detail.partner = el.value;
    else if (f === 'source') draft.detail.source = el.value;
    else if (f === 'topic') draft.detail.topic = el.value;
    else if (f === 'url') draft.detail.url = el.value;
    else if (f === 'start') draft.detail.start = el.value || undefined;
    else if (f === 'goal') draft.detail.goal = el.value;
    else if (f === 'goalNote') draft.detail.goalNote = el.value;
    else if (f === 'note') draft.detail.note = el.value;
    else if (f === 'at') draft.at = el.value;
    else if (f === 'date') draft.at = `${el.value}T12:00`;
    else if (f === 'len') draft.len = el.value;
    else if (f === 'running') {
      draft.running = el.checked;
      render();
    } else if (el.dataset.tags && /,$/.test(el.value)) {
      addTag(el.dataset.tags as keyof Detail, el.value);
      render(el.dataset.tags);
    }
  });
  // Change fires when a suggestion is picked from the list (the box keeps focus), and when the box
  // loses focus with text in it. Only the first re-renders: re-rendering on blur would swallow the
  // tap that caused it (typing a technique, then tapping Save, saved nothing). On blur the text is
  // goes into the draft and its chip is added in place, without rebuilding the sheet.
  d.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (rendering || !el.isConnected || !el.dataset.tags || !el.value.trim()) return;
    const field = el.dataset.tags as keyof Detail;
    const before = new Set((draft.detail[field] as string[] | undefined) ?? []);
    if (!addTag(field, el.value)) return;
    if (document.activeElement === el) return render(field);
    const label = RESOLVE_LABEL[field] ?? ((x: string) => x);
    for (const id of (draft.detail[field] as string[]).filter((x) => !before.has(x))) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.dataset.untag = field;
      chip.dataset.value = id;
      chip.textContent = label(id);
      chip.setAttribute('aria-label', `Remove ${label(id)}`);
      el.before(chip);
    }
    el.value = '';
  });
  d.addEventListener('keydown', (e) => {
    const el = e.target as HTMLInputElement;
    if (e.key === 'Enter' && el.dataset?.tags) {
      e.preventDefault();
      if (addTag(el.dataset.tags as keyof Detail, el.value)) render(el.dataset.tags);
    } else if (e.key === 'Backspace' && el.dataset?.tags && !el.value) {
      const f = el.dataset.tags as keyof Detail;
      const list = (draft.detail[f] as string[]) ?? [];
      if (list.length) {
        (draft.detail as Record<string, unknown>)[f] = list.slice(0, -1);
        render(f);
      }
    }
  });
  d.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
}

function remove() {
  if (!existing) return;
  const prev = existing;
  deleteEvent(prev.id);
  dialog().close();
  toast('Deleted', { actions: [{ label: 'Undo', primary: true, run: () => revertTo(prev) }] });
}

function save(opts: { quiet?: boolean } = {}): boolean {
  flushTagInputs();
  const at = fromLocalInput(draft.at);
  if (at === null) {
    error = 'Pick a start time.';
    openSections.add('more');
    {
      render();
      return false;
    }
  }
  const now = Date.now();
  const detail: Detail = { ...draft.detail };
  delete detail.min;
  for (const k of ['goal', 'goalNote'] as const) {
    detail[k] = detail[k]?.trim() || undefined;
    if (detail[k] === undefined) delete detail[k];
  }
  let endAt: number | undefined;
  if (isTimed(draft.type)) {
    if (draft.running) {
      if (at > now + MIN) {
        error = "A running session can't start in the future.";
        openSections.add('more');
        {
      render();
      return false;
    }
      }
      const other = ongoingSession(app.get().events);
      if (sessionLike(draft.type) && other && other.id !== existing?.id) {
        error = `${kindById(other.type as KindId).label} is already running. Stop it first, or untick "Still going".`;
        {
      render();
      return false;
    }
      }
    } else {
      const len = Math.round(Number(draft.len));
      if (!(len >= 1 && len <= 600)) {
        error = 'Length is 1–600 minutes.';
        openSections.add('more');
        {
      render();
      return false;
    }
      }
      endAt = at + len * MIN;
    }
  } else if (!detail.belt) {
    error = 'Pick a belt.';
    {
      render();
      return false;
    }
  }
  requestPersistence();
  if (existing) {
    const prev = existing;
    updateEvent(prev.id, { type: draft.type, at, endAt, detail });
    const next: ToastAction[] = prev.type === 'roll' && ongoingSession(app.get().events) && !ongoingRoll(app.get().events) ? [{ label: 'Next round', run: () => nextRound() }] : [];
    if (!opts.quiet) toast('Saved', { actions: [{ label: 'Undo', primary: true, run: () => revertTo(prev) }, ...next] });
  } else {
    const e = addEvent(createEvent(draft.type, at, detail, now, endAt));
    if (draft.type === 'promotion' || detail.landed?.length) companionReact('cheer');
    else if (detail.subsAgainst?.length) companionReact('tap');
    else if (detail.subsFor?.length || detail.goalsFor) companionReact('cheer');
    // During a session, the next round is one tap away.
    const next: ToastAction[] = draft.type === 'roll' && ongoingSession(app.get().events) && !ongoingRoll(app.get().events) ? [{ label: 'Next round', run: () => nextRound() }] : [];
    toast(`${draft.type === 'promotion' ? '🎖️ Promotion' : kindById(draft.type as KindId).label} saved`, { actions: [{ label: 'Undo', primary: true, run: () => deleteEvent(e.id) }, ...next] });
  }
  dialog().close();
  return true;
}

let nextRound = () => {};
/** Set by the app (ui/actions.ts) so the sheet can start a round without importing the action layer. */
export function onNextRound(fn: () => void) {
  nextRound = fn;
}

export function openSheet(opts: SheetOpts) {
  wire();
  error = '';
  openSections.clear();
  dialog().replaceChildren(); // a new sheet starts folded, whatever the last one had open
  intro = opts.intro ?? '';
  existing = opts.event ? getEvent(opts.event.id) ?? opts.event : undefined;
  if (existing?.type === 'roll' && inCompSession(existing)) openSections.add('more');
  // A situational round opens on its goal and counts: that's what there is to fill in.
  if (existing ? existing.type === 'roll' && existing.detail?.goal : opts.type === 'roll' && opts.detail?.goal) openSections.add('positions');
  const now = Date.now();
  if (existing) {
    const e = existing;
    const running = e.endAt === undefined && !e.detail?.min && isTimed(e.type);
    const end = e.endAt ?? e.at + (e.detail?.min ?? 0) * MIN;
    draft = {
      type: e.type,
      at: toLocalInput(e.at),
      len: running ? '' : String(Math.max(1, Math.round((end - e.at) / MIN))),
      running,
      detail: { ...e.detail },
    };
  } else {
    const type = opts.type ?? 'class';
    const def = type === 'promotion' ? 0 : type === 'roll' ? settings.get().roundMin : type === 'study' ? kindById(type).defaultMin : settings.get().defaultMin;
    let at = opts.at ?? (opts.running ? now : now - def * MIN);
    if (opts.at === undefined && type === 'class' && !opts.running && settings.get().classOnHour) at = classStart(at, false);
    draft = {
      type,
      at: toLocalInput(at),
      len: String(def),
      running: !!opts.running,
      detail: { ...(opts.detail ?? {}) },
    };
    if (type === 'promotion' && !draft.detail.belt) draft.detail.belt = 'white';
  }
  render();
  openDialog(dialog());
}

/** For sessions: the default attire is whatever you wore last time. */
export function lastAttire(): Attire | undefined {
  const s = app
    .get()
    .events.filter((e) => !e.deleted && isSession(e) && e.detail?.attire)
    .sort((a, b) => b.at - a.at)[0];
  return s?.detail?.attire;
}
