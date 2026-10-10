import { positionLabel, subLabel, techniqueById, techniqueLabel } from '../core/catalog';
import { dayDate, dayKey } from '../core/days';
import { focusProgress, matchFocus, setFocus, type FocusMatch } from '../core/focus';
import { plural } from '../core/format';
import { app, settings } from '../core/log';
import { rollStats, techniqueUses } from '../core/stats';
import { esc, openDialog, sheetHead } from './dom';
import { toast } from './toast';

const dialog = () => document.getElementById('focus-sheet') as HTMLDialogElement;
const MAX = 140;
const DAY = 86_400_000;

const shortDate = (ts: number) => dayDate(dayKey(ts)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const usedIds = () => techniqueUses(app.get().events).map((u) => u.id);

function matchLabel(m: FocusMatch): string {
  if (!m) return '';
  if (m.kind === 'technique') return `Tracking the technique <b>${esc(techniqueLabel(m.id))}</b>: sessions you tag it in, and rounds you go for or land it.`;
  if (m.kind === 'position') return `Tracking the position <b>${esc(positionLabel(m.id))}</b>: rounds you note getting stuck there.`;
  return `Tracking the submission <b>${esc(subLabel(m.id))}</b>: rounds you finish it and rounds you tap to it.`;
}

/** "since Oct 3 · 4 sessions · drilled 2× · landed 2 of 5 in rounds" */
export function progressLine(text: string, since: number | null, now: number): string {
  if (!text.trim() || since === null) return '';
  const m = matchFocus(text, usedIds());
  const p = focusProgress(app.get().events, m, since, now);
  const bits = [`since ${shortDate(since)}`, plural(p.sessions, 'session')];
  if (m?.kind === 'technique') {
    if (p.drilled) bits.push(`drilled ${p.drilled}×`);
    if (p.attempts) bits.push(`landed ${p.landed} of ${p.attempts} in rounds`);
  }
  if (m?.kind === 'position' && p.stuck) bits.push(`noted stuck there in ${plural(p.stuck, 'round')}`);
  if (m?.kind === 'sub' && (p.hit || p.tapped)) bits.push(`${p.hit} finished, ${p.tapped} tapped to`);
  return bits.join(' · ');
}

export function renderFocusCard(now: number) {
  const s = settings.get();
  const el = document.getElementById('focus')!;
  const text = s.focus.trim();
  const html = text
    ? `<span class="focus-k">Working on</span><span class="focus-text">${esc(text)}</span><span class="focus-meta">${esc(progressLine(text, s.focusSince, now))}</span>`
    : `<span class="focus-k">Working on</span><span class="focus-text empty-focus">+ What are you working on? Set one thing to try next class.</span>`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.classList.toggle('set', !!text);
  const label = text ? `Working on: ${text}. ${progressLine(text, s.focusSince, now)}. Tap to change.` : 'Set what you are working on';
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
  return [...new Set([...tech, ...stuck, ...tapped])];
}

function render(value: string) {
  const s = settings.get();
  const now = Date.now();
  const m = matchFocus(value, usedIds());
  const chips = fromLog(now);
  const history = s.focusHistory;
  dialog().innerHTML = `${sheetHead('focus-title', 'Working on')}<div class="sheet-body"><form data-focus-form novalidate>
    <p class="hint" style="margin-top:0">One thing to try next class: a technique, a position, a habit. It shows on the home screen, and matlog counts what happens with it from now on. You pick it; matlog never will.</p>
    <label class="field"><span class="field-label">Working on <span data-count>${value.length}/${MAX}</span></span>
      <textarea data-focus rows="2" maxlength="${MAX}" placeholder="e.g. knee cut pass, framing from bottom side, breathing in bad spots">${esc(value)}</textarea></label>
    <p class="hint" data-match ${m ? '' : 'hidden'}>${matchLabel(m)}</p>
    ${chips.length ? `<div class="field"><span class="field-label">From your last 30 days</span><div class="suggest">${chips.map((c) => `<button type="button" class="pick" data-fill="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>` : ''}
    ${
      history.length
        ? `<div class="field"><span class="field-label">Before</span><ul class="focus-history">${history
            .map((h, i) => `<li><span><b>${esc(h.text)}</b><br /><span class="entry-meta">${shortDate(h.from)} – ${shortDate(h.to)} · ${esc(progressLine(h.text, h.from, h.to).replace(/^since [^·]+· /, ''))}</span></span><button type="button" class="chip" data-reuse="${i}">Use again</button></li>`)
            .join('')}</ul></div>`
        : ''
    }
    <div class="actions">
      ${s.focus ? '<button type="button" class="btn danger" data-clear>Clear</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form></div>`;
}

function save(text: string) {
  const s = settings.get();
  const prev = { focus: s.focus, focusSince: s.focusSince, focusHistory: s.focusHistory };
  const next = setFocus(s, text, Date.now());
  if (next.focus === prev.focus) {
    dialog().close();
    return;
  }
  settings.set(next);
  dialog().close();
  toast(next.focus ? `Working on: ${next.focus}` : 'Cleared', { actions: [{ label: 'Undo', primary: true, run: () => settings.set(prev) }] });
}

export function openFocus() {
  const d = dialog();
  render(settings.get().focus);
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
        save(ta.value);
      }
    });
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const ta = d.querySelector<HTMLTextAreaElement>('[data-focus]')!;
      const fill = el.closest<HTMLElement>('[data-fill]')?.dataset.fill;
      const reuse = el.closest<HTMLElement>('[data-reuse]')?.dataset.reuse;
      if (fill !== undefined || reuse !== undefined) {
        ta.value = fill ?? settings.get().focusHistory[Number(reuse)].text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
      } else if (el.closest('[data-clear]')) save('');
    });
    d.addEventListener('submit', (e) => {
      e.preventDefault();
      save(d.querySelector<HTMLTextAreaElement>('[data-focus]')!.value);
    });
  }
  openDialog(d);
}
