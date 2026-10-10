import { positionLabel, TECHNIQUES } from '../core/catalog';
import { dayKey, daysBetween } from '../core/days';
import { app } from '../core/log';
import { positionGraph, rollStats, techniqueUses } from '../core/stats';
import { graphSvg } from '../viz/graph';
import { esc, openDialog, sheetHead } from './dom';

const dialog = () => document.getElementById('tech') as HTMLDialogElement;
let filter = '';

function since(at: number, now: number): string {
  const d = daysBetween(dayKey(at), dayKey(now));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function rows(now: number): string {
  const uses = techniqueUses(app.get().events);
  const q = filter.trim().toLowerCase();
  const list = uses.filter((u) => !q || u.label.toLowerCase().includes(q) || (u.from && positionLabel(u.from).toLowerCase().includes(q)));
  if (!uses.length) return '<p class="empty">Tag techniques on a session (hold a card, or tap Details after logging) and they show up here.</p>';
  if (!list.length) return '<p class="empty">No technique matches.</p>';
  return `<table class="data"><thead><tr><th>Technique</th><th>From → to</th><th class="num">Sessions</th><th class="num">Last drilled</th></tr></thead><tbody>${list
    .map(
      (u) => `<tr><td>${esc(u.label)}</td><td class="entry-meta">${u.from && u.to ? `${esc(positionLabel(u.from))} → ${esc(positionLabel(u.to))}` : 'your own'}</td><td class="num">${u.sessions}</td><td class="num">${since(u.lastAt, now)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function render() {
  const now = Date.now();
  const { events } = app.get();
  const g = positionGraph(events);
  const stuck = new Set(rollStats(events).stuck.map((s) => s.id));
  const unused = TECHNIQUES.filter((t) => !techniqueUses(events).some((u) => u.id === t.id)).length;
  dialog().innerHTML = `${sheetHead('tech-title', 'Technique library')}<div class="sheet-body">
    <section><h3 style="margin:0 0 4px">Last drilled</h3>
      <p class="basis" style="color:var(--muted);font-size:.82rem;margin:0 0 10px">Newest first. ${unused} catalog techniques you haven't tagged yet; anything you type is kept too.</p>
      <input class="search" type="search" placeholder="Filter by technique or position" value="${esc(filter)}" data-filter aria-label="Filter techniques" />
      <div data-rows>${rows(now)}</div>
    </section>
    <section class="block"><h3>Position graph</h3>
      <p class="basis">Built from your own logs: each line is a technique you've tagged, from one position to another; thicker means more sessions. A dashed outline is somewhere you noted getting stuck.</p>
      <div class="viz">${graphSvg(g.edges, g.nodes, stuck)}</div>
      <details class="text-alt"><summary>As a list</summary>${g.edges.length ? `<ul>${g.edges.map((e) => `<li>${esc(positionLabel(e.from))} → ${esc(positionLabel(e.to))}: ${esc(e.techniques.join(', '))} (${e.n})</li>`).join('')}</ul>` : '<p class="empty">No catalog techniques tagged yet.</p>'}</details>
    </section>
  </div>`;
}

export function openTech() {
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
  }
  openDialog(d);
}
