import { allTechniques, hasOverride, isBuiltIn, isCustom, POSITIONS, positionLabel, resolveTechnique, TECH_KINDS, techniqueById, techniqueLabel, variationsOf } from '../core/catalog';
import { dayKey, daysBetween } from '../core/days';
import { defineTechnique, LibraryError, mentions, newTechNote, NOTE_KINDS, techNoteCounts, techNotes } from '../core/library';
import { dayDate } from '../core/days';
import { kindById, type KindId } from '../core/kinds';
import { addEvent, app, deleteEvent, getEvent, revertTo, settings, updateEvent } from '../core/log';
import { LEVELS, positionGraph, rollStats, SIZES_ORDER, skillLadder, techniqueUses, type LadderCell } from '../core/stats';
import type { CustomTechnique, LogEvent, TechNoteKind } from '../core/types';
import { graphSvg } from '../viz/graph';
import { esc, openDialog, sheetHead } from './dom';
import { toast } from './toast';

const dialog = () => document.getElementById('tech') as HTMLDialogElement;
let filter = '';
/** The technique open in detail, or a new one being added ('' id). */
let detail: string | null = null;
let form: CustomTechnique | null = null;
let error = '';

function since(at: number, now: number): string {
  const d = daysBetween(dayKey(at), dayKey(now));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function rows(now: number): string {
  const uses = techniqueUses(app.get().events);
  // A technique you've only written notes about still belongs in the list.
  for (const n of app.get().events) {
    const id = !n.deleted && n.type === 'technote' ? n.detail?.techNote?.technique : undefined;
    if (id && !uses.some((u) => u.id === id)) {
      const t = techniqueById(id);
      uses.push({ id, label: techniqueLabel(id), sessions: 0, landed: 0, attempts: 0, lastAt: n.at, from: t?.from, to: t?.to });
    }
  }
  const q = filter.trim().toLowerCase();
  const list = uses.filter((u) => !q || u.label.toLowerCase().includes(q) || (u.from && positionLabel(u.from).toLowerCase().includes(q)));
  if (!uses.length) return '<p class="empty">Tag techniques on a session, or note moves you landed or tried in a round, and they show up here.</p>';
  if (!list.length) return '<p class="empty">No technique matches.</p>';
  const counts = techNoteCounts(app.get().events);
  return `<table class="data"><thead><tr><th>Technique</th><th>From → to</th><th class="num">Drilled</th><th class="num" title="Rounds you landed it, of rounds you went for it">Landed in rounds</th><th class="num">Last</th></tr></thead><tbody>${list
    .map(
      (u) => `<tr><td><button type="button" class="link-btn" data-open="${esc(u.id)}">${esc(u.label)}</button>${counts.get(u.id) ? ` <span class="entry-meta" title="Your notes">📝 ${counts.get(u.id)}</span>` : ''}</td><td class="entry-meta">${u.from && u.to ? `${esc(positionLabel(u.from))} → ${esc(positionLabel(u.to))}` : '<span class="tag">your own: add positions</span>'}</td><td class="num">${u.sessions || '–'}</td><td class="num">${u.attempts ? `${u.landed} of ${u.attempts}` : '–'}</td><td class="num">${since(u.lastAt, now)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

const cell = (c: LadderCell) => (c.attempts ? `<b>${c.landed}</b>/${c.attempts}` : '<span class="entry-meta">–</span>');

/** Lighter → same → heavier, lower → similar → higher belt: where a skill holds up so far. */
function ladder(id: string): string {
  const l = skillLadder(app.get().events, id, settings.get());
  if (!l.total.attempts) return '<p class="empty">No rounds with it yet. Note it as landed or tried when you log a round.</p>';
  return `<table class="data ladder"><thead><tr><th>Partner</th>${LEVELS.map((lv) => `<th class="num">${lv === 'lower' ? 'Lower belt' : lv === 'similar' ? 'Same belt' : 'Higher belt'}</th>`).join('')}</tr></thead><tbody>${SIZES_ORDER.map(
    (s) => `<tr><th scope="row">${s === 'smaller' ? 'Lighter' : s === 'similar' ? 'Same size' : 'Heavier'}</th>${LEVELS.map((lv) => `<td class="num">${cell(l.cells[s][lv])}</td>`).join('')}</tr>`,
  ).join('')}</tbody></table>
  <p class="basis">Landed / rounds you went for it: ${l.total.landed} of ${l.total.attempts}${l.unknown.attempts ? `, ${l.unknown.attempts} without the partner's belt and size` : ''}. Belts are against yours at the time.</p>`;
}

function editor(): string {
  const f = form!;
  const builtIn = !!f.id && isBuiltIn(f.id);
  const opts = (sel: string) =>
    POSITIONS.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  return `<form data-tech-form novalidate class="block">
    <label class="field"><span class="field-label">Name</span><input type="text" data-name value="${esc(f.label)}" maxlength="80" autocomplete="off" placeholder="e.g. Kiss of the dragon" /></label>
    <fieldset class="field"><legend>What it is</legend><div class="picks">${TECH_KINDS.map((k) => `<button type="button" class="pick" data-kind="${k.id}" aria-pressed="${k.id === f.kind}">${k.label}</button>`).join('')}</div></fieldset>
    <div class="row stack-sm">
      <label class="field"><span class="field-label">Starts from</span><select data-from><option value="">Pick a position</option>${opts(f.from)}</select></label>
      <label class="field"><span class="field-label">Ends in</span><select data-to><option value="">Pick a position</option>${opts(f.to)}</select></label>
    </div>
    <label class="field"><span class="field-label">Other names (optional, comma-separated)</span><input type="text" data-aka value="${esc((f.aka ?? []).join(', '))}" maxlength="200" autocomplete="off" placeholder="what else people call it" /></label>
    <label class="field"><span class="field-label">Variation of (optional)</span><input type="text" data-parent value="${esc(f.parent ? techniqueLabel(f.parent) : '')}" list="dl-tech-all" autocomplete="off" placeholder="e.g. Arm drag" /></label>
    <datalist id="dl-tech-all">${allTechniques()
      .filter((t) => t.id !== f.id)
      .map((t) => `<option value="${esc(t.label)}"></option>`)
      .join('')}</datalist>
    ${builtIn ? `<label class="check"><input type="checkbox" data-hidden ${f.hidden ? 'checked' : ''} /> Hide from suggestions (it’s still recognised when you type it)</label>` : ''}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <div class="actions">${f.id && isCustom(f.id) ? '<button type="button" class="btn danger" data-forget>Remove from library</button>' : ''}${builtIn && hasOverride(f.id) ? '<button type="button" class="btn" data-reset>Back to the built-in version</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Save</button></div>
  </form>`;
}

let noteKind: TechNoteKind = 'detail';
let editingNote: string | null = null;
const shortDate = (ts: number) => dayDate(dayKey(ts)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const kindLabel = (k: TechNoteKind) => NOTE_KINDS.find((x) => x.id === k)?.label ?? k;

/** Your notes on a technique (key details pinned), and what else your log says about it. */
function notesSection(id: string): string {
  const notes = techNotes(app.get().events, id);
  const m = mentions(app.get().events, id);
  const note = (e: LogEvent) => {
    const n = e.detail!.techNote!;
    if (editingNote === e.id)
      return `<li class="tech-note editing"><textarea data-note-edit rows="3" maxlength="1000">${esc(n.text)}</textarea>
        <input type="url" data-note-edit-url value="${esc(n.url ?? '')}" placeholder="Link (optional)" />
        <div class="actions"><button type="button" class="btn danger" data-note-delete="${e.id}">Delete</button><span class="spacer"></span><button type="button" class="btn" data-note-cancel>Cancel</button><button type="button" class="btn primary" data-note-save="${e.id}">Save</button></div></li>`;
    return `<li class="tech-note ${n.kind}"><span class="tag">${esc(kindLabel(n.kind))}</span> ${esc(n.text)}${n.url ? ` <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">link ↗</a>` : ''}
      <span class="entry-meta">${shortDate(e.at)} · <button type="button" class="link-btn" data-note-edit-open="${e.id}">Edit</button></span></li>`;
  };
  const fromLog = [
    ...m.topic.map((s) => `<li><span class="entry-meta">${shortDate(s.at)} · ${esc(kindById(s.type as KindId).label)} on</span> <b>${esc(s.detail!.topic!)}</b>${s.detail?.techniques?.length ? ` <span class="entry-meta">· ${esc(s.detail.techniques.map(techniqueLabel).join(', '))}</span>` : ''}</li>`),
    ...m.sessions.map((s) => `<li><span class="entry-meta">${shortDate(s.at)} · ${esc(kindById(s.type as KindId).label)}</span> ${esc(s.detail!.note!)}</li>`),
    ...m.problems.map((p) => `<li><span class="entry-meta">${shortDate(p.at)} · problem${p.detail!.problem!.solvedAt ? ' (solved)' : ''}</span> ${esc(p.detail!.problem!.text)}${p.detail!.problem!.idea ? ` <span class="entry-meta">· idea: ${esc(p.detail!.problem!.idea)}</span>` : ''}</li>`),
  ];
  return `<section class="block"><h3>Your notes</h3>
    <p class="basis">Key details, things you’ve noticed, questions, sources. Key details stay at the top.</p>
    <form data-note-form novalidate class="note-form">
      <div class="picks">${NOTE_KINDS.map((k) => `<button type="button" class="pick" data-note-kind="${k.id}" aria-pressed="${k.id === noteKind}" title="${esc(k.hint)}">${k.label}</button>`).join('')}</div>
      <textarea data-note-text rows="2" maxlength="1000" placeholder="${noteKind === 'detail' ? 'e.g. underhook the far arm before the knee goes across' : noteKind === 'question' ? 'e.g. what if they get the knee shield first?' : noteKind === 'source' ? 'e.g. Half guard passing, volume 2, chapter 4' : 'e.g. works better against people my size'}" aria-label="Note"></textarea>
      <input type="url" data-note-url placeholder="Link (optional), e.g. a video at the right time" aria-label="Link" />
      <div class="actions"><span class="spacer"></span><button type="submit" class="btn primary">Add note</button></div>
    </form>
    ${notes.length ? `<ul class="tech-notes">${notes.map(note).join('')}</ul>` : ''}
  </section>
  ${fromLog.length ? `<section class="block"><h3>From your log</h3><p class="basis">Notes from sessions you tagged it in, and problems that mention it.</p><ul class="plain from-log">${fromLog.join('')}</ul></section>` : ''}`;
}

function detailView(id: string, now: number): string {
  const t = techniqueById(id);
  const u = techniqueUses(app.get().events).find((x) => x.id === id);
  const catalog = isBuiltIn(id);
  const vars = variationsOf(id);
  const uses = techniqueUses(app.get().events);
  // A parent's numbers with its variations folded in, shown next to its own.
  const fam = [u, ...vars.map((v) => uses.find((x) => x.id === v.id))].filter((x): x is NonNullable<typeof x> => !!x);
  const famLine =
    vars.length && fam.length > (u ? 1 : 0)
      ? `<p class="basis">With its variations: drilled in ${fam.reduce((a, x) => a + x.sessions, 0)} sessions${fam.some((x) => x.attempts) ? `, landed ${fam.reduce((a, x) => a + x.landed, 0)} of ${fam.reduce((a, x) => a + x.attempts, 0)} in rounds` : ''}.</p>`
      : '';
  return `<p><button type="button" class="link-btn" data-back>‹ All techniques</button></p>
    <h3 style="margin:0">${esc(techniqueLabel(id))}</h3>
    <p class="basis">${t ? `${esc(TECH_KINDS.find((k) => k.id === t.kind)?.label ?? '')} · ${esc(positionLabel(t.from))} → ${esc(positionLabel(t.to))}${catalog ? (hasOverride(id) ? ' · edited by you' : '') : ' · your own'}${t.hidden ? ' · hidden from suggestions' : ''}` : 'Your own, without positions yet'}${u ? ` · drilled in ${u.sessions} session${u.sessions === 1 ? '' : 's'}${u.attempts ? `, landed ${u.landed} of ${u.attempts} in rounds` : ''} · last ${since(u.lastAt, now)}` : ''}</p>
    ${t?.parent ? `<p class="basis">Variation of <button type="button" class="link-btn" data-open="${esc(t.parent)}">${esc(techniqueLabel(t.parent))}</button></p>` : ''}
    ${vars.length ? `<p class="basis">Variations: ${vars.map((v) => `<button type="button" class="link-btn" data-open="${esc(v.id)}">${esc(v.label)}</button>`).join(', ')}</p>` : ''}
    ${famLine}
    ${!form ? `<p><button type="button" class="chip primary" data-define>${t ? 'Edit' : 'Add type and positions'}</button></p>` : ''}
    ${form ? editor() : ''}
    ${notesSection(id)}
    <section class="block"><h3>Skill ladder</h3><p class="basis">Test new skills against people near your level in them, then climb.</p>${ladder(id)}</section>`;
}

function render() {
  const now = Date.now();
  const { events } = app.get();
  const body =
    detail !== null && detail !== ''
      ? detailView(detail, now)
      : detail === ''
        ? `<p><button type="button" class="link-btn" data-back>‹ All techniques</button></p><h3 style="margin:0">Add a technique</h3><p class="basis">Your own techniques join the suggestions, the position graph and the skill ladder. Entries already logged with the same name link up.</p>${editor()}`
        : (() => {
            const g = positionGraph(events);
            const stuck = new Set(rollStats(events).stuck.map((s) => s.id));
            const unused = allTechniques().filter((t) => !techniqueUses(events).some((u) => u.id === t.id)).length;
            return `<section><div class="section-head" style="margin-top:0"><h3 style="margin:0">Last drilled or tried</h3><button type="button" class="chip" data-add>+ Add a technique</button></div>
              <p class="basis" style="color:var(--muted);font-size:.82rem;margin:0 0 10px">Newest first. Tap one for your notes on it and its skill ladder. ${unused} techniques in the library you haven't used yet; anything you type is kept too.</p>
              <input class="search" type="search" placeholder="Filter by technique or position" value="${esc(filter)}" data-filter aria-label="Filter techniques" />
              <div data-rows>${rows(now)}</div>
            </section>
            <section class="block"><h3>Position graph</h3>
              <p class="basis">Built from your own logs: each line is a technique you've drilled or landed in a round, from one position to another; thicker means more. A dashed outline is somewhere you noted getting stuck.</p>
              <div class="viz">${graphSvg(g.edges, g.nodes, stuck)}</div>
              <details class="text-alt"><summary>As a list</summary>${g.edges.length ? `<ul>${g.edges.map((e) => `<li>${esc(positionLabel(e.from))} → ${esc(positionLabel(e.to))}: ${esc(e.techniques.join(', '))} (${e.n})</li>`).join('')}</ul>` : '<p class="empty">No techniques with positions yet.</p>'}</details>
            </section>`;
          })();
  dialog().innerHTML = `${sheetHead('tech-title', 'Technique library')}<div class="sheet-body">${body}</div>`;
}

function readForm() {
  const d = dialog();
  if (!form) return;
  form.label = d.querySelector<HTMLInputElement>('[data-name]')?.value ?? form.label;
  form.from = d.querySelector<HTMLSelectElement>('[data-from]')?.value ?? form.from;
  form.to = d.querySelector<HTMLSelectElement>('[data-to]')?.value ?? form.to;
  const aka = d.querySelector<HTMLInputElement>('[data-aka]');
  if (aka) form.aka = aka.value.split(',').map((x) => x.trim()).filter(Boolean);
  const parent = d.querySelector<HTMLInputElement>('[data-parent]');
  if (parent) form.parent = parent.value.trim() ? resolveTechnique(parent.value) : undefined;
  const hidden = d.querySelector<HTMLInputElement>('[data-hidden]');
  if (hidden) form.hidden = hidden.checked;
}

export function openTech(id?: string) {
  detail = id ?? null;
  form = null;
  error = '';
  render();
  const d = dialog();
  if (!d.dataset.techWired) {
    d.dataset.techWired = '1';
    d.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.filter === undefined) return;
      filter = el.value;
      d.querySelector('[data-rows]')!.innerHTML = rows(Date.now());
    });
    d.addEventListener('submit', (e) => {
      e.preventDefault();
      if ((e.target as HTMLElement).matches('[data-note-form]')) {
        const text = d.querySelector<HTMLTextAreaElement>('[data-note-text]')!.value.trim();
        if (!text || !detail) return;
        const ev = addEvent(newTechNote(detail, text, Date.now(), { kind: noteKind, url: d.querySelector<HTMLInputElement>('[data-note-url]')!.value }));
        render();
        toast('Note added', { actions: [{ label: 'Undo', primary: true, run: () => (deleteEvent(ev.id), render()) }] });
        return;
      }
      readForm();
      try {
        const ev = addEvent(defineTechnique(form!, Date.now()));
        const t = ev.detail!.technique!;
        detail = t.id;
        form = null;
        error = '';
        render();
        toast(`${t.label} is in your library`, { actions: [{ label: 'Undo', primary: true, run: () => (deleteEvent(ev.id), render()) }] });
      } catch (err) {
        error = err instanceof LibraryError ? err.message : String(err);
        render();
      }
    });
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      const ds = b.dataset;
      if (ds.noteKind) {
        const text = d.querySelector<HTMLTextAreaElement>('[data-note-text]')?.value ?? '';
        noteKind = ds.noteKind as TechNoteKind;
        render();
        const ta = d.querySelector<HTMLTextAreaElement>('[data-note-text]');
        if (ta) ta.value = text;
        return;
      }
      if (ds.noteEditOpen) {
        editingNote = ds.noteEditOpen;
        return render();
      }
      if (ds.noteCancel !== undefined) {
        editingNote = null;
        return render();
      }
      if (ds.noteSave) {
        const prev = getEvent(ds.noteSave)!;
        const text = d.querySelector<HTMLTextAreaElement>('[data-note-edit]')!.value.trim();
        if (!text) return;
        const url = d.querySelector<HTMLInputElement>('[data-note-edit-url]')!.value.trim();
        const note = { ...prev.detail!.techNote!, text: text.slice(0, 1000) };
        if (url && /^https?:\/\//i.test(url)) note.url = url.slice(0, 500);
        else delete note.url;
        updateEvent(prev.id, { detail: { ...prev.detail, techNote: note } });
        editingNote = null;
        render();
        toast('Saved', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
        return;
      }
      if (ds.noteDelete) {
        const prev = getEvent(ds.noteDelete)!;
        deleteEvent(prev.id);
        editingNote = null;
        render();
        toast('Note deleted', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
        return;
      }
      if (ds.open) {
        detail = ds.open;
        form = null;
        editingNote = null;
      } else if (ds.back !== undefined) {
        detail = null;
        form = null;
      } else if (ds.add !== undefined) {
        detail = '';
        form = { id: '', label: filter.trim(), kind: 'sweep', from: '', to: '' };
      } else if (ds.define !== undefined) {
        const t = techniqueById(detail!);
        form = { id: detail!, label: t?.label ?? detail!, kind: t?.kind ?? 'sweep', from: t?.from ?? '', to: t?.to ?? '', aka: t?.aka, parent: t?.parent, hidden: t?.hidden };
      } else if (ds.kind) {
        readForm();
        form!.kind = ds.kind as CustomTechnique['kind'];
      } else if (ds.cancel !== undefined) form = null;
      else if (ds.reset !== undefined) {
        // Your version of a built-in is just events in the log: deleting them brings the original back.
        const evs = app.get().events.filter((x) => x.type === 'technique' && !x.deleted && x.detail?.technique?.id === form!.id);
        evs.forEach((x) => deleteEvent(x.id));
        form = null;
        toast('Back to the built-in version');
      }
      else if (ds.forget !== undefined) {
        const evs = app.get().events.filter((x) => x.type === 'technique' && !x.deleted && x.detail?.technique?.id === form!.id);
        evs.forEach((x) => deleteEvent(x.id));
        form = null;
        toast('Removed from your library. Entries that used it keep the name.');
      } else return;
      error = '';
      render();
    });
  }
  openDialog(d);
}
