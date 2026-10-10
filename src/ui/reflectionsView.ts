import { dayDate, dayKey } from '../core/days';
import { isSession, spanEnd } from '../core/events';
import { plural } from '../core/format';
import { kindById, type KindId } from '../core/kinds';
import { app } from '../core/log';
import { problemsFor, processStats } from '../core/notebook';
import type { LogEvent } from '../core/types';
import { esc } from './dom';
import { notebookTab, registerTab, showNotebook } from './notebook';
import { openReflect } from './reflectView';

/** Reflections: what you wrote after sessions, and the recent ones you haven't reflected on yet. */

const panel = () => document.getElementById('reflections') as HTMLElement;
const DAY = 86_400_000;
const FACES = ['😩', '🙁', '😐', '🙂', '😄'];
const when = (ts: number) => dayDate(dayKey(ts)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function item(s: LogEvent): string {
  const d = s.detail ?? {};
  const k = kindById(s.type as KindId);
  const bits = [d.enjoy ? FACES[d.enjoy - 1] : '', d.plan ? `plan: ${d.plan}` : ''].filter(Boolean);
  const probs = problemsFor(s.id, app.get().events);
  return `<li class="focus-item">
    <div class="focus-item-head"><b>${k.emoji} ${esc(k.label)} · ${when(s.at)}</b><span class="entry-meta">${bits.join(' · ')}</span></div>
    ${probs.map((p) => `<span>Problem: ${esc(p.detail!.problem!.text)}${p.detail!.problem!.idea ? ` <span class="entry-meta">· idea: ${esc(p.detail!.problem!.idea)}</span>` : ''}${p.detail!.problem!.solvedAt ? ' <span class="tag">solved</span>' : ''}</span>`).join('')}
    ${d.note ? `<span class="entry-meta">${esc(d.note.length > 220 ? `${d.note.slice(0, 220)}…` : d.note)}</span>` : ''}
    <div class="head-actions"><button type="button" class="chip" data-reflect="${s.id}">${d.reflectedAt ? 'Edit' : 'Reflect'}</button></div>
  </li>`;
}

function render() {
  const now = Date.now();
  const sessions = app
    .get()
    .events.filter((e) => !e.deleted && isSession(e) && !(e.endAt === undefined && !e.detail?.min))
    .sort((a, b) => b.at - a.at);
  const pending = sessions.filter((s) => !s.detail?.reflectedAt && now - spanEnd(s, now) < 7 * DAY);
  const done = sessions.filter((s) => s.detail?.reflectedAt).slice(0, 30);
  const p = processStats(app.get().events);
  panel().innerHTML = `<div class="sheet-body">
    <p class="hint" style="margin-top:0">Basic notes a while after training: a problem, an idea, how it felt. ${p.reflected ? `${plural(p.reflected, 'session')} reflected on${p.enjoyAvg !== null ? ` · enjoyment ${p.enjoyAvg.toFixed(1)} of 5 on average` : ''}.` : ''}</p>
    <section class="block" style="margin-top:0"><h3>Not reflected on yet (last 7 days)</h3>${pending.length ? `<ul class="focus-list">${pending.map(item).join('')}</ul>` : '<p class="empty">You’re all caught up.</p>'}</section>
    <section class="block"><h3>Reflections</h3>${done.length ? `<ul class="focus-list">${done.map(item).join('')}</ul>` : '<p class="empty">Nothing yet. The prompt shows a while after a session (Settings → Reflection prompt), or tap Reflect above.</p>'}</section>
  </div>`;
}

export function openReflections() {
  render();
  const el = panel();
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    el.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-reflect]')?.dataset.reflect;
      const s = id && app.get().events.find((x) => x.id === id);
      if (s) openReflect(s);
    });
    // The reflection sheet opens on top; when it closes, show what was written.
    document.getElementById('reflect')!.addEventListener('close', () => {
      if (notebookTab() === 'reflections') render();
    });
  }
  showNotebook('reflections');
}

registerTab('reflections', openReflections);
