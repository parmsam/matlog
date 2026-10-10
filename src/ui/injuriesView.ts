import { dayDate, dayKey, dayStart } from '../core/days';
import { AREAS, injuries, injuryDays, injuryTitle, newInjury } from '../core/injuries';
import { plural } from '../core/format';
import { addEvent, app, deleteEvent, getEvent, revertTo, updateEvent } from '../core/log';
import type { InjuryDetail, InjurySeverity, InjurySide, LogEvent } from '../core/types';
import { esc } from './dom';
import { registerTab, showNotebook } from './notebook';
import { toast } from './toast';

/** The injury log: a record of what you logged, never medical advice. */

const dialog = () => document.getElementById('injuries') as HTMLElement;
const shortDate = (ts: number) => dayDate(dayKey(ts)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const SEVERITY: [InjurySeverity, string][] = [
  ['minor', 'Minor'],
  ['moderate', 'Moderate'],
  ['serious', 'Serious'],
];

interface Draft {
  id?: string;
  area: string;
  other: string;
  side?: InjurySide;
  severity?: InjurySeverity;
  date: string;
  how: string;
  around: string;
  sessionId?: string;
  rollId?: string;
}
let draft: Draft | null = null;
let updating: string | null = null;
let error = '';

function item(e: LogEvent, now: number): string {
  const d = e.detail!.injury!;
  const days = injuryDays(e, now);
  const when = d.healedAt ? `${shortDate(e.at)} – ${shortDate(d.healedAt)} (${plural(days, 'day')})` : `${plural(days, 'day')} · since ${shortDate(e.at)}`;
  const updates = (d.updates ?? []).map((u) => `<li><span class="entry-meta">${shortDate(u.at)}</span> ${esc(u.text)}</li>`).join('');
  return `<li class="injury ${d.healedAt ? 'healed' : ''}">
    <div class="focus-item-head"><b>🩹 ${esc(injuryTitle(d))}</b>${d.severity ? `<span class="tag">${d.severity}</span>` : ''}</div>
    <span class="entry-meta">${when}${d.how ? ` · ${esc(d.how)}` : ''}</span>
    ${d.around ? `<span>Training around it: ${esc(d.around)}</span>` : ''}
    ${updates ? `<ul class="updates">${updates}</ul>` : ''}
    ${
      updating === e.id
        ? `<div class="row-inline"><input type="text" data-update-text maxlength="300" placeholder="e.g. less swelling, rolled light" aria-label="Update" /><button type="button" class="chip primary" data-update-save="${e.id}">Add</button></div>`
        : ''
    }
    <div class="head-actions">${
      d.healedAt
        ? `<button type="button" class="chip" data-reopen="${e.id}">Not healed after all</button>`
        : `<button type="button" class="chip primary" data-healed="${e.id}">Healed</button><button type="button" class="chip" data-update="${e.id}">+ Update</button>`
    }<button type="button" class="chip" data-edit="${e.id}">Edit</button></div>
  </li>`;
}

function form(): string {
  const d = draft!;
  const area = AREAS.find((a) => a.id === d.area);
  const sided = area ? area.sided : !!d.other;
  return `<form data-injury-form novalidate class="focus-editor">
    <fieldset class="field"><legend>Where</legend><div class="picks">${AREAS.map((a) => `<button type="button" class="pick" data-area="${a.id}" aria-pressed="${a.id === d.area}">${esc(a.label)}</button>`).join('')}<button type="button" class="pick" data-area="other" aria-pressed="${d.area === 'other'}">Other</button></div></fieldset>
    ${d.area === 'other' ? `<label class="field"><span class="field-label">What</span><input type="text" data-other value="${esc(d.other)}" maxlength="60" placeholder="e.g. Achilles" autocomplete="off" /></label>` : ''}
    ${sided ? `<fieldset class="field"><legend>Side</legend><div class="picks">${(['left', 'right', 'both'] as InjurySide[]).map((s) => `<button type="button" class="pick" data-side="${s}" aria-pressed="${s === d.side}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div></fieldset>` : ''}
    <div class="row stack-sm">
      <fieldset class="field"><legend>How bad (your call)</legend><div class="picks">${SEVERITY.map(([v, l]) => `<button type="button" class="pick" data-severity="${v}" aria-pressed="${v === d.severity}">${l}</button>`).join('')}</div></fieldset>
      <label class="field"><span class="field-label">When</span><input type="date" data-date value="${d.date}" /></label>
    </div>
    <label class="field"><span class="field-label">How it happened</span><input type="text" data-how value="${esc(d.how)}" maxlength="300" placeholder="optional, e.g. heel hook in round 3" autocomplete="off" /></label>
    <label class="field"><span class="field-label">Training around it</span><input type="text" data-around value="${esc(d.around)}" maxlength="300" placeholder="optional, e.g. no leg locks, gi only" autocomplete="off" /></label>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <div class="actions">${d.id ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Save</button></div>
  </form>`;
}

function render() {
  const now = Date.now();
  const { active, healed } = injuries(app.get().events, now);
  dialog().innerHTML = `<div class="sheet-body">
    <p class="hint" style="margin-top:0">A record of what got hurt, how, and what you’re doing differently while it heals. matlog only keeps what you write: it isn’t medical advice, so see a professional about anything that worries you.</p>
    ${draft ? form() : '<p><button type="button" class="chip primary" data-new>+ Log an injury</button></p>'}
    <section class="block"><h3>Now (${active.length})</h3>${active.length ? `<ul class="focus-list">${active.map((e) => item(e, now)).join('')}</ul>` : '<p class="empty">Nothing logged as hurting right now.</p>'}</section>
    ${healed.length ? `<details class="block"><summary><b>Healed (${healed.length})</b></summary><ul class="focus-list">${healed.map((e) => item(e, now)).join('')}</ul></details>` : ''}
  </div>`;
  if (updating) dialog().querySelector<HTMLInputElement>('[data-update-text]')?.focus();
}

function read() {
  const d = dialog();
  if (!draft) return;
  draft.other = d.querySelector<HTMLInputElement>('[data-other]')?.value ?? draft.other;
  draft.date = d.querySelector<HTMLInputElement>('[data-date]')?.value ?? draft.date;
  draft.how = d.querySelector<HTMLInputElement>('[data-how]')?.value ?? draft.how;
  draft.around = d.querySelector<HTMLInputElement>('[data-around]')?.value ?? draft.around;
}

/** Noon on the chosen day (or now, if it's today), so "when" is a day, not a time. */
function dateTs(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const now = Date.now();
  return v === dayKey(now) ? now : dayStart(v) + 12 * 3_600_000;
}

function save() {
  read();
  const d = draft!;
  const area = d.area === 'other' ? d.other.trim() : d.area;
  if (!area) {
    error = 'Pick where it hurts.';
    return render();
  }
  const at = dateTs(d.date);
  if (at === null || at > Date.now()) {
    error = 'Pick a day, today or earlier.';
    return render();
  }
  const sided = AREAS.find((a) => a.id === area)?.sided ?? d.area === 'other';
  const detail: InjuryDetail = { area, side: sided ? d.side : undefined, severity: d.severity, how: d.how, around: d.around, sessionId: d.sessionId, rollId: d.rollId };
  if (d.id) {
    const prev = getEvent(d.id)!;
    const fresh = newInjury(at, { ...detail, healedAt: prev.detail!.injury!.healedAt }, Date.now()).detail!.injury!;
    updateEvent(d.id, { at, detail: { ...prev.detail, injury: { ...fresh, ...(prev.detail!.injury!.updates ? { updates: prev.detail!.injury!.updates } : {}) } } });
    toast('Saved', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
  } else {
    const e = addEvent(newInjury(at, detail, Date.now()));
    toast(`🩹 ${injuryTitle(e.detail!.injury!)} logged`, { actions: [{ label: 'Undo', primary: true, run: () => (deleteEvent(e.id), render()) }] });
  }
  draft = null;
  error = '';
  render();
}

function patch(id: string, fn: (d: InjuryDetail) => InjuryDetail, msg: string) {
  const prev = getEvent(id)!;
  const injury = fn({ ...prev.detail!.injury! });
  updateEvent(id, { detail: { ...prev.detail, injury } });
  render();
  toast(msg, { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
}

/** Opens the log; `log` starts a new entry (from a round or a session: it's prefilled with when and where). */
export function openInjuries(opts: { log?: { at?: number; sessionId?: string; rollId?: string; how?: string } } = {}) {
  updating = null;
  error = '';
  draft = opts.log ? { area: '', other: '', date: dayKey(opts.log.at ?? Date.now()), how: opts.log.how ?? '', around: '', sessionId: opts.log.sessionId, rollId: opts.log.rollId } : null;
  render();
  const d = dialog();
  if (!d.dataset.injuriesWired) {
    d.dataset.injuriesWired = '1';
    d.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
    d.addEventListener('keydown', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.updateText !== undefined && e.key === 'Enter') {
        e.preventDefault();
        d.querySelector<HTMLElement>('[data-update-save]')?.click();
      }
    });
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      const ds = b.dataset;
      if (ds.new !== undefined) draft = { area: '', other: '', date: dayKey(Date.now()), how: '', around: '' };
      else if (ds.area) {
        read();
        draft!.area = ds.area;
      } else if (ds.side) {
        read();
        draft!.side = draft!.side === ds.side ? undefined : (ds.side as InjurySide);
      } else if (ds.severity) {
        read();
        draft!.severity = draft!.severity === ds.severity ? undefined : (ds.severity as InjurySeverity);
      } else if (ds.cancel !== undefined) {
        draft = null;
        error = '';
      } else if (ds.delete !== undefined) {
        const prev = getEvent(draft!.id!)!;
        deleteEvent(prev.id);
        draft = null;
        toast('Injury deleted', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
      } else if (ds.edit) {
        const ev = getEvent(ds.edit)!;
        const x = ev.detail!.injury!;
        const known = AREAS.some((a) => a.id === x.area);
        draft = { id: ev.id, area: known ? x.area : 'other', other: known ? '' : x.area, side: x.side, severity: x.severity, date: dayKey(ev.at), how: x.how ?? '', around: x.around ?? '', sessionId: x.sessionId, rollId: x.rollId };
      } else if (ds.healed) return patch(ds.healed, (x) => ({ ...x, healedAt: Date.now() }), 'Marked healed');
      else if (ds.reopen)
        return patch(
          ds.reopen,
          (x) => {
            delete x.healedAt;
            return x;
          },
          'Back on the list',
        );
      else if (ds.update) updating = updating === ds.update ? null : ds.update;
      else if (ds.updateSave) {
        const text = d.querySelector<HTMLInputElement>('[data-update-text]')?.value.trim();
        if (!text) return;
        updating = null;
        return patch(ds.updateSave, (x) => ({ ...x, updates: [...(x.updates ?? []), { at: Date.now(), text: text.slice(0, 300) }] }), 'Update added');
      } else return;
      render();
    });
  }
  showNotebook('injuries');
}

registerTab('injuries', () => openInjuries());

/** "🩹 Left knee · 12 days" for the home screen, or '' with nothing active. */
export function injuryLine(now: number): string {
  const { active } = injuries(app.get().events, now);
  if (!active.length) return '';
  const first = active[0];
  return `🩹 ${injuryTitle(first.detail!.injury!)} · ${plural(injuryDays(first, now), 'day')}${active.length > 1 ? ` · +${active.length - 1} more` : ''}`;
}

