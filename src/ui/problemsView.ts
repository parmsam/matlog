import { dayDate, dayKey } from '../core/days';
import { addEvent, app, deleteEvent, getEvent, revertTo, updateEvent } from '../core/log';
import { newProblem, PROBLEM_SOURCES, problems } from '../core/notebook';
import type { LogEvent, ProblemSource } from '../core/types';
import { companionReact } from './companion';
import { esc, openDialog, sheetHead } from './dom';
import { toast } from './toast';

/** "Find problems, solve them": the list, oldest worries at the bottom, solved ones kept for the record. */

const dialog = () => document.getElementById('problems') as HTMLDialogElement;
const shortDate = (ts: number) => dayDate(dayKey(ts)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
let source: ProblemSource = 'internal';
let editing: string | null = null;

const sourceLabel = (s?: ProblemSource) => PROBLEM_SOURCES.find((p) => p.id === s)?.label ?? '';

function item(e: LogEvent): string {
  const p = e.detail!.problem!;
  if (editing === e.id)
    return `<li class="problem editing"><label class="field"><span class="field-label">Problem</span><textarea data-edit-text rows="2" maxlength="300">${esc(p.text)}</textarea></label>
      <label class="field"><span class="field-label">Idea to try / solution</span><textarea data-edit-idea rows="2" maxlength="300">${esc(p.idea ?? '')}</textarea></label>
      <label class="check"><input type="checkbox" data-edit-tinkered ${p.tinkered ? 'checked' : ''} /> I tinkered with it before looking anything up</label>
      <div class="actions"><button type="button" class="btn danger" data-delete="${e.id}">Delete</button><span class="spacer"></span><button type="button" class="btn" data-cancel>Cancel</button><button type="button" class="btn primary" data-save="${e.id}">Save</button></div></li>`;
  return `<li class="problem ${p.solvedAt ? 'solved' : ''}"><div><b>${esc(p.text)}</b>
      ${p.idea ? `<br /><span class="entry-meta">Idea: ${esc(p.idea)}</span>` : ''}
      <br /><span class="entry-meta">${[shortDate(e.at), sourceLabel(p.source), p.tinkered ? 'tinkered first' : '', p.solvedAt ? `solved ${shortDate(p.solvedAt)}` : ''].filter(Boolean).join(' · ')}</span></div>
    <div class="head-actions">${p.solvedAt ? `<button type="button" class="chip" data-reopen="${e.id}">Reopen</button>` : `<button type="button" class="chip primary" data-solve="${e.id}">Solved</button>`}<button type="button" class="chip" data-edit="${e.id}">Edit</button></div></li>`;
}

function render() {
  const p = problems(app.get().events);
  dialog().innerHTML = `${sheetHead('problems-title', 'Problems')}<div class="sheet-body">
    <p class="hint" style="margin-top:0">Find a problem, try an idea, mark it solved. The aim is to run out of them. Tinkering in the position before looking it up is worth noting.</p>
    <form data-add novalidate>
      <label class="field"><span class="field-label">New problem</span><textarea data-text rows="2" maxlength="300" placeholder="e.g. my underhook gets pummeled out"></textarea></label>
      <fieldset class="field"><legend>Where it came from</legend><div class="picks">${PROBLEM_SOURCES.map((s) => `<button type="button" class="pick" data-source="${s.id}" aria-pressed="${s.id === source}" title="${esc(s.hint)}">${s.label}</button>`).join('')}</div></fieldset>
      <label class="field"><span class="field-label">Idea to try (optional)</span><input type="text" data-idea maxlength="300" autocomplete="off" /></label>
      <div class="actions"><span class="spacer"></span><button type="submit" class="btn primary">Add problem</button></div>
    </form>
    <section class="block"><h3>Open (${p.open.length})</h3>${p.open.length ? `<ul class="problem-list">${p.open.map(item).join('')}</ul>` : '<p class="empty">No open problems. Add one when you notice it, or when you reflect after class.</p>'}</section>
    ${p.solved.length ? `<details class="block"><summary><b>Solved (${p.solved.length})</b></summary><ul class="problem-list">${p.solved.map(item).join('')}</ul></details>` : ''}
  </div>`;
}

function patchProblem(id: string, patch: Record<string, unknown>, msg: string) {
  const prev = getEvent(id)!;
  const problem = { ...prev.detail!.problem!, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined || v === '' || v === false) delete (problem as Record<string, unknown>)[k];
  updateEvent(id, { detail: { ...prev.detail, problem } });
  render();
  toast(msg, { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
}

export function openProblems() {
  editing = null;
  render();
  const d = dialog();
  if (!d.dataset.problemsWired) {
    d.dataset.problemsWired = '1';
    d.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = d.querySelector<HTMLTextAreaElement>('[data-text]')!.value.trim();
      if (!text) return;
      const idea = d.querySelector<HTMLInputElement>('[data-idea]')!.value;
      const ev = addEvent(newProblem(text, Date.now(), { source, idea }));
      render();
      toast('Problem added', { actions: [{ label: 'Undo', primary: true, run: () => (deleteEvent(ev.id), render()) }] });
    });
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      const ds = b.dataset;
      if (ds.source) {
        source = ds.source as ProblemSource;
        d.querySelectorAll<HTMLElement>('[data-source]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.source === source)));
      } else if (ds.solve) {
        companionReact('cheer');
        patchProblem(ds.solve, { solvedAt: Date.now() }, 'Solved');
      } else if (ds.reopen) patchProblem(ds.reopen, { solvedAt: undefined }, 'Reopened');
      else if (ds.edit) {
        editing = ds.edit;
        render();
      } else if (ds.cancel !== undefined) {
        editing = null;
        render();
      } else if (ds.save) {
        const text = d.querySelector<HTMLTextAreaElement>('[data-edit-text]')!.value.trim();
        if (!text) return;
        editing = null;
        patchProblem(ds.save, { text, idea: d.querySelector<HTMLTextAreaElement>('[data-edit-idea]')!.value.trim(), tinkered: d.querySelector<HTMLInputElement>('[data-edit-tinkered]')!.checked }, 'Saved');
      } else if (ds.delete) {
        const prev = getEvent(ds.delete)!;
        deleteEvent(prev.id);
        editing = null;
        render();
        toast('Problem deleted', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
      }
    });
  }
  openDialog(d);
}
