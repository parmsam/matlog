import { positionLabel, subLabel, techniqueById, techniqueLabel } from '../core/catalog';
import { dayDate, dayKey } from '../core/days';
import { blockProgress, FOCUS_ROLES, focuses, finishFocus, focusProgress, matchFocus, newFocus, nextBlock, repsToday, restFocus, roleLabel, runningFocuses, type FocusMatch, type FocusView } from '../core/focus';
import { plural } from '../core/format';
import { addEvent, app, deleteEvent, getEvent, revertTo, updateEvent } from '../core/log';
import { problems } from '../core/notebook';
import { rollStats, techniqueUses } from '../core/stats';
import type { FocusDetail, FocusRole, LogEvent } from '../core/types';
import { esc } from './dom';
import { closeNotebook, registerTab, showNotebook } from './notebook';
import { toast } from './toast';

const dialog = () => document.getElementById('focus-sheet') as HTMLElement;
const MAX = 140;
const DAY = 86_400_000;

const shortDate = (ts: number) => dayDate(dayKey(ts)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const usedIds = () => techniqueUses(app.get().events).map((u) => u.id);

function matchLabel(m: FocusMatch): string {
  if (!m) return '';
  if (m.kind === 'technique') return `Tracking the technique <b>${esc(techniqueLabel(m.id))}</b>: sessions you tag it in, and rounds you go for or land it.`;
  if (m.kind === 'position') return `Tracking the position <b>${esc(positionLabel(m.id))}</b>: rounds that start there, and rounds you note getting stuck there.`;
  return `Tracking the submission <b>${esc(subLabel(m.id))}</b>: rounds you finish it and rounds you tap to it.`;
}

/** "4 sessions · drilled 2× · landed 2 of 5 in rounds" for a window. */
function numbers(text: string, from: number, to: number): string {
  const m = matchFocus(text, usedIds());
  const p = focusProgress(app.get().events, m, from, to);
  const bits = p.sessions ? [plural(p.sessions, 'session')] : [];
  if (m?.kind === 'technique') {
    if (p.drilled) bits.push(`drilled ${p.drilled}×`);
    if (p.attempts) bits.push(`landed ${p.landed} of ${p.attempts} in rounds`);
  }
  if (m?.kind === 'position') {
    if (p.started) bits.push(`${plural(p.started, 'round')} started there`);
    if (p.stuck) bits.push(`noted stuck there in ${plural(p.stuck, 'round')}`);
  }
  if (m?.kind === 'sub' && (p.hit || p.tapped)) bits.push(`${p.hit} finished, ${p.tapped} tapped to`);
  return bits.join(' · ');
}

function blockLine(v: FocusView, now: number): string {
  if (v.state === 'over') return `Block over (${shortDate(v.ends)}): rest it, or go again`;
  if (v.state === 'resting') return `Resting since ${shortDate(v.restingSince!)} (${plural(Math.max(1, Math.round((now - v.restingSince!) / DAY)), 'day')})`;
  if (v.state === 'done') return `Done ${shortDate(v.f.doneAt!)}`;
  return `week ${v.week} of ${v.weeks}`;
}

function repsLine(v: FocusView, now: number): string {
  if (!v.f.target) return '';
  const m = matchFocus(v.f.text, usedIds());
  return `${repsToday(app.get().events, m, now)} of ${v.f.target} reps today`;
}

export function renderFocusCard(now: number) {
  const el = document.getElementById('focus')!;
  const running = runningFocuses(app.get().events, now).slice(0, 3);
  const open = problems(app.get().events).open.length;
  const head = `<span class="focus-k">Working on${running.length > 1 ? ` · ${running.length}` : ''}${open ? `<span class="focus-problems">${plural(open, 'open problem')}</span>` : ''}</span>`;
  const html = running.length
    ? head +
      running
        .map((v) => {
          const meta = [roleLabel(v.f.role), blockLine(v, now), repsLine(v, now), numbers(v.f.text, v.block.from, now)].filter(Boolean).join(' · ');
          return `<span class="focus-row ${v.state}"><span class="focus-text">${esc(v.f.text)}</span><span class="focus-meta">${esc(meta)}</span>${v.f.ifWorks || v.f.ifFails ? `<span class="focus-plan">${v.f.ifWorks ? `✓ → ${esc(v.f.ifWorks)}` : ''}${v.f.ifWorks && v.f.ifFails ? ' · ' : ''}${v.f.ifFails ? `✗ → ${esc(v.f.ifFails)}` : ''}</span>` : ''}</span>`;
        })
        .join('')
    : `${head}<span class="focus-text empty-focus">+ What are you working on? Set one thing for your next class.</span>`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.classList.toggle('set', running.length > 0);
  const label = running.length ? `Working on: ${running.map((v) => `${v.f.text}, ${blockLine(v, now)}`).join('; ')}. Tap to see or change.` : 'Set what you are working on';
  if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
}

/** Quick fills from your own log (last 30 days): never suggestions of what you should do. */
function fromLog(now: number): string[] {
  const events = app.get().events.filter((e) => e.at >= now - 30 * DAY);
  const tech = techniqueUses(events)
    .filter((u) => techniqueById(u.id)?.kind !== 'submission')
    .slice(0, 4)
    .map((u) => u.label);
  const st = rollStats(events);
  const stuck = st.stuck.slice(0, 2).map((c) => `${c.label} escapes`);
  const tapped = st.againstBy.slice(0, 2).map((c) => `${c.label} defense`);
  const open = problems(events).open.slice(0, 2).map((p) => p.detail!.problem!.text);
  return [...new Set([...tech, ...stuck, ...tapped, ...open])].slice(0, 8);
}

/** Questions from the "train with intention" approach. Prompts for you, never verdicts. */
const QUESTIONS = [
  'What am I working on in my next session?',
  'Does my complementary skill connect to my main one?',
  'Am I testing it against people near my level in it?',
  'Did I tinker in the position before looking it up?',
  'What problem will my game run into next?',
  'Am I still enjoying this?',
];

interface Draft {
  id?: string;
  text: string;
  role: FocusRole;
  blockDays: number;
  ifWorks: string;
  ifFails: string;
  target: number;
}
let draft: Draft | null = null;
let error = '';

function card(v: FocusView, now: number): string {
  const blocks = blockProgress(app.get().events, v.f, usedIds(), now);
  const compare =
    blocks.length > 1
      ? `<details class="text-alt"><summary>Block by block</summary><table class="data"><thead><tr><th>Block</th><th>Numbers</th></tr></thead><tbody>${blocks
          .map((b, i) => `<tr><td>${i + 1}: ${shortDate(b.from)} – ${b.to ? shortDate(b.to) : 'now'}</td><td>${esc(numbers(v.f.text, b.from, b.to ?? now))}</td></tr>`)
          .join('')}</tbody></table></details>`
      : '';
  const m = matchFocus(v.f.text, usedIds());
  const ladder = m?.kind === 'technique' || m?.kind === 'sub' ? `<button type="button" class="chip" data-ladder="${esc(m.id)}">Skill ladder</button>` : '';
  const actions =
    v.state === 'active'
      ? `<button type="button" class="chip" data-rest="${v.event.id}">Rest it</button><button type="button" class="chip" data-finish="${v.event.id}">Done</button>`
      : v.state === 'over'
        ? `<button type="button" class="chip primary" data-again="${v.event.id}">Another block</button><button type="button" class="chip" data-rest="${v.event.id}">Rest it</button><button type="button" class="chip" data-finish="${v.event.id}">Done</button>`
        : v.state === 'resting'
          ? `<button type="button" class="chip primary" data-again="${v.event.id}">Start a block</button><button type="button" class="chip" data-finish="${v.event.id}">Done</button>`
          : `<button type="button" class="chip" data-again="${v.event.id}">Start again</button>`;
  return `<li class="focus-item ${v.state}">
    <div class="focus-item-head"><b>${esc(v.f.text)}</b><span class="tag">${esc(roleLabel(v.f.role))}</span></div>
    <span class="entry-meta">${esc([blockLine(v, now), plural(v.f.blocks.length, 'block'), numbers(v.f.text, v.block.from, v.block.to ?? now)].filter(Boolean).join(' · '))}</span>
    ${v.f.ifWorks || v.f.ifFails ? `<span class="entry-meta">${v.f.ifWorks ? `If it works → ${esc(v.f.ifWorks)}` : ''}${v.f.ifWorks && v.f.ifFails ? ' · ' : ''}${v.f.ifFails ? `If it fails → ${esc(v.f.ifFails)}` : ''}</span>` : ''}
    ${compare}
    <div class="head-actions">${actions}<button type="button" class="chip" data-edit="${v.event.id}">Edit</button>${ladder}</div>
  </li>`;
}

function editor(now: number): string {
  const d = draft!;
  const m = matchFocus(d.text, usedIds());
  const chips = fromLog(now);
  return `<form data-focus-form novalidate class="focus-editor">
    <label class="field"><span class="field-label">${d.id ? 'Edit focus' : 'New focus'} <span data-count>${d.text.length}/${MAX}</span></span>
      <textarea data-focus rows="2" maxlength="${MAX}" placeholder="e.g. knee cut pass, framing from bottom side, circling off the underhook">${esc(d.text)}</textarea></label>
    <p class="hint" data-match ${m ? '' : 'hidden'}>${matchLabel(m)}</p>
    ${chips.length && !d.id ? `<div class="field"><span class="field-label">From your last 30 days</span><div class="suggest">${chips.map((c) => `<button type="button" class="pick" data-fill="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>` : ''}
    <fieldset class="field"><legend>What it is</legend><div class="picks">${FOCUS_ROLES.map((r) => `<button type="button" class="pick" data-role="${r.id}" aria-pressed="${r.id === d.role}" title="${esc(r.hint)}">${r.label}</button>`).join('')}</div></fieldset>
    <div class="row stack-sm">
      <fieldset class="field"><legend>Block</legend><div class="picks">${[
        [7, '1 week'],
        [14, '2 weeks'],
      ]
        .map(([n, l]) => `<button type="button" class="pick" data-days="${n}" aria-pressed="${n === d.blockDays}">${l}</button>`)
        .join('')}</div></fieldset>
      <fieldset class="field"><legend>A good session is</legend><div class="picks">${[0, 1, 2, 3]
        .map((n) => `<button type="button" class="pick" data-target="${n}" aria-pressed="${n === d.target}">${n ? `${n} rep${n === 1 ? '' : 's'}` : 'No target'}</button>`)
        .join('')}</div></fieldset>
    </div>
    <div class="row stack-sm">
      <label class="field"><span class="field-label">If it works → I go to</span><input type="text" data-works value="${esc(d.ifWorks)}" maxlength="140" placeholder="optional" autocomplete="off" /></label>
      <label class="field"><span class="field-label">If it fails → I go to</span><input type="text" data-fails value="${esc(d.ifFails)}" maxlength="140" placeholder="optional" autocomplete="off" /></label>
    </div>
    <details class="text-alt"><summary>Questions to ask yourself</summary><ul>${QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></details>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <div class="actions">
      ${d.id ? '<button type="button" class="btn danger" data-delete-focus>Delete</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel-edit>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>`;
}

function render() {
  const now = Date.now();
  const all = focuses(app.get().events, now);
  const running = all.filter((v) => v.state === 'active' || v.state === 'over');
  const resting = all.filter((v) => v.state === 'resting');
  const done = all.filter((v) => v.state === 'done');
  const list = (title: string, vs: FocusView[]) => (vs.length ? `<section class="block"><h3>${title}</h3><ul class="focus-list">${vs.map((v) => card(v, now)).join('')}</ul></section>` : '');
  dialog().innerHTML = `<div class="sheet-body">
    <p class="hint" style="margin-top:0">A few connected skills at a time, in blocks of a week or two: work one, rest it, come back and see what stuck. You pick them; matlog never will. It counts what happens with anything that names a technique, position or submission.</p>
    ${draft ? editor(now) : `<p><button type="button" class="chip primary" data-new>+ New focus</button></p>`}
    ${list('Now', running)}
    ${list('Resting', resting)}
    ${done.length ? `<details class="block"><summary><b>Done (${done.length})</b></summary><ul class="focus-list">${done.map((v) => card(v, now)).join('')}</ul></details>` : ''}
  </div>`;
  if (draft) dialog().querySelector<HTMLTextAreaElement>('[data-focus]')?.focus();
}

function readDraft() {
  const d = dialog();
  if (!draft) return;
  draft.text = d.querySelector<HTMLTextAreaElement>('[data-focus]')?.value ?? draft.text;
  draft.ifWorks = d.querySelector<HTMLInputElement>('[data-works]')?.value ?? draft.ifWorks;
  draft.ifFails = d.querySelector<HTMLInputElement>('[data-fails]')?.value ?? draft.ifFails;
}

function saveDraft() {
  readDraft();
  const d = draft!;
  if (!d.text.trim()) {
    error = 'Write what you are working on.';
    return render();
  }
  const now = Date.now();
  if (d.id) {
    const prev = getEvent(d.id)!;
    const f: FocusDetail = { ...prev.detail!.focus!, text: d.text.trim().slice(0, MAX), role: d.role, blockDays: d.blockDays };
    for (const [k, v] of [
      ['ifWorks', d.ifWorks.trim()],
      ['ifFails', d.ifFails.trim()],
    ] as const) {
      if (v) f[k] = v.slice(0, 140);
      else delete f[k];
    }
    if (d.target) f.target = d.target;
    else delete f.target;
    updateEvent(d.id, { detail: { ...prev.detail, focus: f } });
    toast('Saved', { actions: [{ label: 'Undo', primary: true, run: () => revertTo(prev) }] });
  } else {
    const e = addEvent(newFocus(d.text, now, { role: d.role, blockDays: d.blockDays, ifWorks: d.ifWorks, ifFails: d.ifFails, target: d.target }));
    toast(`Working on: ${e.detail!.focus!.text}`, { actions: [{ label: 'Undo', primary: true, run: () => deleteEvent(e.id) }] });
  }
  draft = null;
  error = '';
  render();
}

function change(id: string, fn: (f: FocusDetail, now: number) => FocusDetail, msg: string) {
  const prev = getEvent(id)!;
  updateEvent(id, { detail: { ...prev.detail, focus: fn(prev.detail!.focus!, Date.now()) } });
  render();
  toast(msg, { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
}

let openLadder: (id: string) => void = () => {};
/** The technique library registers how to show a technique's skill ladder. */
export function onLadder(fn: (id: string) => void) {
  openLadder = fn;
}

export function openFocus(opts: { new?: boolean } = {}) {
  const d = dialog();
  error = '';
  draft = opts.new || !focuses(app.get().events, Date.now()).length ? { text: '', role: 'main', blockDays: 14, ifWorks: '', ifFails: '', target: 0 } : null;
  render();
  if (!d.dataset.focusWired) {
    d.dataset.focusWired = '1';
    d.addEventListener('input', (e) => {
      const ta = e.target as HTMLTextAreaElement;
      if (ta.dataset.focus === undefined) return;
      d.querySelector('[data-count]')!.textContent = `${ta.value.length}/${MAX}`;
      const m = matchFocus(ta.value, usedIds());
      const hint = d.querySelector<HTMLElement>('[data-match]')!;
      hint.innerHTML = matchLabel(m);
      hint.hidden = !m;
    });
    d.addEventListener('keydown', (e) => {
      const ta = e.target as HTMLTextAreaElement;
      // Enter saves (it's one line); Shift+Enter still makes a new line.
      if (ta.dataset.focus !== undefined && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveDraft();
      }
    });
    d.addEventListener('submit', (e) => {
      e.preventDefault();
      saveDraft();
    });
    d.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!el) return;
      const ds = el.dataset;
      if (ds.new !== undefined) {
        draft = { text: '', role: runningFocuses(app.get().events, Date.now()).some((v) => v.f.role === 'main') ? 'complement' : 'main', blockDays: 14, ifWorks: '', ifFails: '', target: 0 };
        render();
      } else if (ds.fill !== undefined) {
        readDraft();
        draft!.text = ds.fill;
        render();
      } else if (ds.role) {
        readDraft();
        draft!.role = ds.role as FocusRole;
        render();
      } else if (ds.days) {
        readDraft();
        draft!.blockDays = Number(ds.days);
        render();
      } else if (ds.target !== undefined) {
        readDraft();
        draft!.target = Number(ds.target);
        render();
      } else if (ds.cancelEdit !== undefined) {
        draft = null;
        error = '';
        render();
      } else if (ds.deleteFocus !== undefined) {
        const prev = getEvent(draft!.id!)!;
        deleteEvent(prev.id);
        draft = null;
        render();
        toast('Focus deleted', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
      } else if (ds.edit) {
        const f = getEvent(ds.edit)!.detail!.focus!;
        draft = { id: ds.edit, text: f.text, role: f.role, blockDays: f.blockDays, ifWorks: f.ifWorks ?? '', ifFails: f.ifFails ?? '', target: f.target ?? 0 };
        render();
      } else if (ds.rest) change(ds.rest, restFocus, 'Resting it. Come back to it whenever you like.');
      else if (ds.again) change(ds.again, nextBlock, 'New block started');
      else if (ds.finish) change(ds.finish, finishFocus, 'Marked done');
      else if (ds.ladder) {
        closeNotebook();
        openLadder(ds.ladder);
      }
    });
  }
  showNotebook('focus');
}

/** For the API and tests: the focuses as plain data. */
export function focusSummary(e: LogEvent, now: number) {
  const v = focuses([e], now)[0];
  return v ? { text: v.f.text, role: v.f.role, state: v.state, week: v.week, weeks: v.weeks, line: numbers(v.f.text, v.block.from, v.block.to ?? now) } : null;
}

registerTab('focus', () => openFocus());
