import { POSITIONS, positionLabel, resolvePosition, resolveSub, resolveTechnique, subLabel, SUBMISSIONS, techniqueLabel, TECHNIQUES } from '../core/catalog';
import { createEvent, isSession, SESSION_KINDS } from '../core/events';
import { fromLocalInput, toLocalInput } from '../core/format';
import { kindById, ongoingSession, type KindId } from '../core/kinds';
import { addEvent, app, deleteEvent, getEvent, revertTo, settings, updateEvent } from '../core/log';
import { rollStats, techniqueUses } from '../core/stats';
import { BELTS, type Attire, type Belt, type Detail, type EventType, type LogEvent, type Outcome, type Size } from '../core/types';
import { companionReact } from './companion';
import { BELT_LABEL, esc, openDialog, sheetHead } from './dom';
import { requestPersistence } from './persist';
import { toast } from './toast';

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

const isTimed = (t: EventType) => t !== 'promotion';
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
    .filter(([id]) => !list.includes(id))
    .slice(0, 10)
    .map(([id, l]) => `<button type="button" class="pick" data-tag="${field}" data-value="${esc(id)}">+ ${esc(l)}</button>`)
    .join('');
  return `<div class="field"><span class="field-label" id="lbl-${field}">${legend}</span>
    <div class="tags-input">${chips}<input type="text" data-tags="${field}" aria-labelledby="lbl-${field}" placeholder="${placeholder}" ${listId ? `list="${listId}"` : ''} autocomplete="off" enterkeyhint="done" /></div>
    ${sug ? `<div class="suggest">${sug}</div>` : ''}</div>`;
}

function datalists(): string {
  const partners = rollStats(app.get().events).partners.map((p) => p.label);
  return `<datalist id="dl-tech">${TECHNIQUES.map((t) => `<option value="${esc(t.label)}"></option>`).join('')}</datalist>
    <datalist id="dl-subs">${SUBMISSIONS.map((s) => `<option value="${esc(s.label)}"></option>`).join('')}</datalist>
    <datalist id="dl-pos">${POSITIONS.filter((p) => p.id !== 'submission').map((p) => `<option value="${esc(p.label)}"></option>`).join('')}</datalist>
    <datalist id="dl-partners">${partners.map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>`;
}

function sessionFields(): string {
  const d = draft.detail;
  const kinds = SESSION_KINDS.map((k) => [k, `${kindById(k).emoji} ${kindById(k).label}`] as [string, string]);
  const recent = techniqueUses(app.get().events).map((u) => [u.id, u.label] as [string, string]);
  const sug = recent.length ? recent : TECHNIQUES.slice(0, 8).map((t) => [t.id, t.label] as [string, string]);
  return [
    picks('type', kinds, draft.type, 'Session'),
    picks<Attire>('attire', [['gi', 'Gi'], ['nogi', 'No-gi']], d.attire, 'Gi or no-gi'),
    tags('techniques', 'Techniques', techniqueLabel, sug, 'Add a technique…', 'dl-tech'),
  ].join('');
}

function rollFields(): string {
  const d = draft.detail;
  const st = rollStats(app.get().events);
  const subSug = (mine: { id: string; label: string }[]) =>
    [...mine.map((c) => [c.id, c.label] as [string, string]), ...SUBMISSIONS.map((s) => [s.id, s.label] as [string, string])].filter(([id], i, a) => a.findIndex(([x]) => x === id) === i);
  // Moves: what you drill and try most, then the catalog's sweeps, passes and takedowns.
  const moveSug = [
    ...techniqueUses(app.get().events).sort((a, b) => b.attempts + b.sessions - (a.attempts + a.sessions)).map((u) => [u.id, u.label] as [string, string]),
    ...TECHNIQUES.filter((t) => t.kind !== 'submission').map((t) => [t.id, t.label] as [string, string]),
  ].filter(([id], i, a) => a.findIndex(([x]) => x === id) === i);
  const stuckSug = [...st.stuck.map((c) => [c.id, c.label] as [string, string]), ...POSITIONS.filter((p) => p.id !== 'submission').map((p) => [p.id, p.label] as [string, string])].filter(([id], i, a) => a.findIndex(([x]) => x === id) === i);
  return `<label class="field"><span class="field-label">Partner</span>
      <input type="text" data-f="partner" value="${esc(d.partner ?? '')}" list="dl-partners" placeholder="optional" autocomplete="off" maxlength="60" /></label>
    ${picks<Belt>('belt', BELTS.map((b) => [b, `<span class="dot" style="--sw: var(--belt-${b})"></span>${BELT_LABEL[b]}`] as [Belt, string]), d.belt, 'Their belt', 'belt')}
    <div class="row stack-sm">
      ${picks<Size>('size', [['smaller', 'Smaller'], ['similar', 'Similar'], ['bigger', 'Bigger']], d.size, 'Their size')}
      ${picks<Outcome>('outcome', [['win', 'Win'], ['draw', 'Draw'], ['loss', 'Loss']], d.outcome, 'Match result (comps)')}
    </div>
    ${tags('subsFor', 'Subs you hit', subLabel, subSug(st.forBy), 'Add a submission…', 'dl-subs')}
    ${tags('subsAgainst', 'Tapped to', subLabel, subSug(st.againstBy), 'Add a submission…', 'dl-subs')}
    ${tags('landed', 'Moves you landed', techniqueLabel, moveSug, 'Add a sweep, pass, takedown…', 'dl-tech')}
    ${tags('tried', 'Moves you went for (didn’t land)', techniqueLabel, moveSug, 'Add a move…', 'dl-tech')}
    ${tags('stuck', 'Where you got stuck', positionLabel, stuckSug, 'Add a position…', 'dl-pos')}`;
}

function promotionFields(): string {
  const d = draft.detail;
  return `${picks<Belt>('belt', BELTS.map((b) => [b, `<span class="dot" style="--sw: var(--belt-${b})"></span>${BELT_LABEL[b]}`] as [Belt, string]), d.belt, 'Belt', 'belt')}
    ${picks('stripes', [0, 1, 2, 3, 4].map((n) => [String(n), n ? `${n} stripe${n === 1 ? '' : 's'}` : 'No stripes'] as [string, string]), String(d.stripes ?? 0), 'Stripes')}`;
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
  const title = existing ? `${t === 'promotion' ? '🎖️ Promotion' : `${kindById(t as KindId).emoji} ${kindById(t as KindId).label}`}` : t === 'promotion' ? 'New promotion' : t === 'roll' ? 'New round' : 'New session';
  const fields = sessionLike(t) ? sessionFields() : t === 'roll' ? rollFields() : promotionFields();
  rendering = true;
  try {
    dialog().innerHTML = `<form novalidate>${sheetHead('sheet-title', title)}<div class="sheet-body">
    ${intro ? `<p class="hint" style="margin-top:0">${esc(intro)}</p>` : ''}
    ${fields}
    ${timeFields()}
    <label class="field"><span class="field-label">Note</span>
      <textarea data-f="note" rows="2" placeholder="optional">${esc(draft.detail.note ?? '')}</textarea></label>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <div class="actions">
      ${existing ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div></div>${datalists()}</form>`;
  } finally {
    rendering = false;
  }
  if (focusTags) dialog().querySelector<HTMLInputElement>(`[data-tags="${focusTags}"]`)?.focus();
}

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
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick], [data-tag], [data-untag], [data-delete]');
    if (!el) return;
    if (el.dataset.delete !== undefined) return remove();
    if (el.dataset.pick) {
      const field = el.dataset.pick;
      const v = el.dataset.value!;
      if (field === 'type') draft.type = v as EventType;
      else if (field === 'stripes') draft.detail.stripes = Number(v);
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
  // Picking from the suggestion list (datalist) fires change.
  d.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (rendering || !el.isConnected) return;
    if (el.dataset.tags && el.value.trim() && addTag(el.dataset.tags as keyof Detail, el.value)) render(el.dataset.tags);
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

function save() {
  flushTagInputs();
  const at = fromLocalInput(draft.at);
  if (at === null) {
    error = 'Pick a start time.';
    return render();
  }
  const now = Date.now();
  const detail: Detail = { ...draft.detail };
  delete detail.min;
  let endAt: number | undefined;
  if (isTimed(draft.type)) {
    if (draft.running) {
      if (at > now + MIN) {
        error = "A running session can't start in the future.";
        return render();
      }
      const other = ongoingSession(app.get().events);
      if (sessionLike(draft.type) && other && other.id !== existing?.id) {
        error = `${kindById(other.type as KindId).label} is already running. Stop it first, or untick "Still going".`;
        return render();
      }
    } else {
      const len = Math.round(Number(draft.len));
      if (!(len >= 1 && len <= 600)) {
        error = 'Length is 1–600 minutes.';
        return render();
      }
      endAt = at + len * MIN;
    }
  } else if (!detail.belt) {
    error = 'Pick a belt.';
    return render();
  }
  requestPersistence();
  if (existing) {
    const prev = existing;
    updateEvent(prev.id, { type: draft.type, at, endAt, detail });
    toast('Saved', { actions: [{ label: 'Undo', primary: true, run: () => revertTo(prev) }] });
  } else {
    const e = addEvent(createEvent(draft.type, at, detail, now, endAt));
    if (draft.type === 'promotion' || detail.landed?.length) companionReact('cheer');
    else if (detail.subsAgainst?.length) companionReact('tap');
    else if (detail.subsFor?.length) companionReact('cheer');
    toast(`${draft.type === 'promotion' ? '🎖️ Promotion' : kindById(draft.type as KindId).label} saved`, { actions: [{ label: 'Undo', primary: true, run: () => deleteEvent(e.id) }] });
  }
  dialog().close();
}

export function openSheet(opts: SheetOpts) {
  wire();
  error = '';
  intro = opts.intro ?? '';
  existing = opts.event ? getEvent(opts.event.id) ?? opts.event : undefined;
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
    const def = type === 'promotion' ? 0 : type === 'roll' ? kindById('roll').defaultMin : settings.get().defaultMin;
    draft = {
      type,
      at: toLocalInput(opts.at ?? (opts.running ? now : now - def * MIN)),
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
