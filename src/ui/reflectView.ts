import { dayDate, dayKey } from '../core/days';
import { focusProgress, matchFocus, roleLabel, runningFocuses } from '../core/focus';
import { dayTitle, duration } from '../core/format';
import { kindById, type KindId } from '../core/kinds';
import { addEvent, app, deleteEvent, getEvent, revertTo, settings, updateEvent } from '../core/log';
import { newProblem, PROBLEM_SOURCES, problems } from '../core/notebook';
import { minutesOf, spanEnd } from '../core/events';
import { rollsIn, techniqueUses } from '../core/stats';
import type { LogEvent, PlanFollowed, ProblemSource } from '../core/types';
import { companionReact } from './companion';
import { esc, openDialog, sheetHead } from './dom';
import { toast } from './toast';

/**
 * The notebook, a while after training: "a problem I hit, an idea to try", the current block, and
 * a check-in (did I enjoy it, did I follow my plan). Basic on purpose: the value is in thinking it
 * over. Nothing here is scored.
 */

const dialog = () => document.getElementById('reflect') as HTMLDialogElement;
const MIN = 60_000;

let session: LogEvent;
let state: { enjoy?: number; plan?: PlanFollowed; source: ProblemSource; solved: Set<string>; tinkered: boolean };

const FACES = ['😩', '🙁', '😐', '🙂', '😄'];

function render() {
  const now = Date.now();
  const s = session;
  const k = kindById(s.type as KindId);
  const end = spanEnd(s, now);
  const used = techniqueUses(app.get().events).map((u) => u.id);
  const blocks = runningFocuses(app.get().events, now).map((v) => {
    const m = matchFocus(v.f.text, used);
    const p = focusProgress(app.get().events, m, s.at, end);
    const today = m?.kind === 'technique' && p.attempts ? ` · this session: landed ${p.landed} of ${p.attempts}` : m?.kind === 'sub' && (p.hit || p.tapped) ? ` · this session: ${p.hit} finished, ${p.tapped} tapped to` : '';
    return `<li><b>${esc(v.f.text)}</b> <span class="entry-meta">${esc(roleLabel(v.f.role))} · ${v.state === 'over' ? 'block over' : `week ${v.week} of ${v.weeks}`}${esc(today)}</span></li>`;
  });
  const open = problems(app.get().events).open;
  const rounds = rollsIn(s, app.get().events, now).length;
  dialog().innerHTML = `${sheetHead('reflect-title', `📓 ${k.label} · ${dayTitle(dayDate(dayKey(s.at)))}`)}<div class="sheet-body"><form data-reflect-form novalidate>
    <p class="hint" style="margin-top:0">${duration(minutesOf(s, now) * MIN)}${rounds ? `, ${rounds} round${rounds === 1 ? '' : 's'}` : ''}. Five minutes, basic notes: a problem, an idea, or just what you’re working on. Thinking it over is the point.</p>
    ${blocks.length ? `<div class="field"><span class="field-label">Current block</span><ul class="plain">${blocks.join('')}</ul></div>` : ''}
    <label class="field"><span class="field-label">Problem I hit</span><textarea data-problem rows="2" maxlength="300" placeholder="e.g. got flattened in half guard"></textarea></label>
    <fieldset class="field"><legend>Where it came from</legend><div class="picks">${PROBLEM_SOURCES.map((p) => `<button type="button" class="pick" data-source="${p.id}" aria-pressed="${state.source === p.id}" title="${esc(p.hint)}">${p.label}</button>`).join('')}</div></fieldset>
    <label class="field"><span class="field-label">Idea to try / solution</span><textarea data-idea rows="2" maxlength="300" placeholder="optional"></textarea></label>
    <label class="check"><input type="checkbox" data-tinkered ${state.tinkered ? 'checked' : ''} /> I tinkered with it before looking anything up</label>
    ${open.length ? `<fieldset class="field"><legend>Open problems: solved any?</legend>${open.map((p) => `<label class="check"><input type="checkbox" data-solved="${p.id}" ${state.solved.has(p.id) ? 'checked' : ''} /> ${esc(p.detail!.problem!.text)}${p.detail!.problem!.idea ? ` <span class="entry-meta">(idea: ${esc(p.detail!.problem!.idea)})</span>` : ''}</label>`).join('')}</fieldset>` : ''}
    <div class="row stack-sm">
      <fieldset class="field"><legend>Enjoyed it</legend><div class="picks">${FACES.map((f, i) => `<button type="button" class="pick face" data-enjoy="${i + 1}" aria-pressed="${state.enjoy === i + 1}" aria-label="${i + 1} of 5">${f}</button>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>Followed my plan</legend><div class="picks">${(['yes', 'partly', 'no'] as const).map((p) => `<button type="button" class="pick" data-plan="${p}" aria-pressed="${state.plan === p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></fieldset>
    </div>
    <label class="field"><span class="field-label">Note</span><textarea data-note rows="2" placeholder="optional">${esc(s.detail?.note ?? '')}</textarea></label>
    <div class="actions"><button type="button" class="btn" data-skip>Not now</button><span class="spacer"></span><button type="submit" class="btn primary">Save</button></div>
  </form></div>`;
}

function save() {
  const d = dialog();
  const now = Date.now();
  const prev = getEvent(session.id)!;
  const text = d.querySelector<HTMLTextAreaElement>('[data-problem]')!.value.trim();
  const idea = d.querySelector<HTMLTextAreaElement>('[data-idea]')!.value.trim();
  const note = d.querySelector<HTMLTextAreaElement>('[data-note]')!.value;
  updateEvent(prev.id, { detail: { ...prev.detail, enjoy: state.enjoy, plan: state.plan, note, reflectedAt: now } });
  const added = text ? addEvent(newProblem(text, now, { source: state.source, idea, tinkered: state.tinkered, sessionId: prev.id })) : null;
  const solvedPrev = [...state.solved].map((id) => getEvent(id)!).filter(Boolean);
  for (const p of solvedPrev) updateEvent(p.id, { detail: { ...p.detail, problem: { ...p.detail!.problem!, solvedAt: now, ...(state.tinkered ? { tinkered: true } : {}) } } });
  d.close();
  if (solvedPrev.length) companionReact('cheer');
  toast(solvedPrev.length ? `Noted. ${solvedPrev.length} problem${solvedPrev.length === 1 ? '' : 's'} solved.` : 'Noted', {
    actions: [
      {
        label: 'Undo',
        primary: true,
        run: () => {
          revertTo(prev);
          if (added) deleteEvent(added.id);
          solvedPrev.forEach((p) => revertTo(p));
        },
      },
    ],
  });
}

export function openReflect(s: LogEvent) {
  session = getEvent(s.id) ?? s;
  state = { enjoy: session.detail?.enjoy, plan: session.detail?.plan, source: 'internal', solved: new Set(), tinkered: false };
  render();
  const d = dialog();
  if (!d.dataset.reflectWired) {
    d.dataset.reflectWired = '1';
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      const ds = b.dataset;
      const set = (fn: () => void) => {
        fn();
        // Keep what's typed: only the pressed state changes.
        d.querySelectorAll<HTMLElement>('[data-enjoy]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.enjoy) === state.enjoy)));
        d.querySelectorAll<HTMLElement>('[data-plan]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.plan === state.plan)));
        d.querySelectorAll<HTMLElement>('[data-source]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.source === state.source)));
      };
      if (ds.enjoy) set(() => (state.enjoy = state.enjoy === Number(ds.enjoy) ? undefined : Number(ds.enjoy)));
      else if (ds.plan) set(() => (state.plan = state.plan === ds.plan ? undefined : (ds.plan as PlanFollowed)));
      else if (ds.source) set(() => (state.source = ds.source as ProblemSource));
      else if (ds.skip !== undefined) {
        settings.set({ reflectSkipped: [...settings.get().reflectSkipped, session.id].slice(-30) });
        d.close();
      }
    });
    d.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.solved) el.checked ? state.solved.add(el.dataset.solved) : state.solved.delete(el.dataset.solved);
      if (el.dataset.tinkered !== undefined) state.tinkered = el.checked;
    });
    d.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
  }
  openDialog(d);
}
