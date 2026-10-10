import { positionLabel, subLabel, techniqueLabel } from '../core/catalog';
import { dayDate, dayKey } from '../core/days';
import { dayTitle, duration, plural } from '../core/format';
import { kindById } from '../core/kinds';
import { addEvents, deleteEvent, settings } from '../core/log';
import { notesToEvents, parseMarkdown, type ParsedSession } from '../core/markdown';
import { companionReact } from './companion';
import { esc, openDialog, sheetHead } from './dom';
import { requestPersistence } from './persist';
import { toast } from './toast';

const dialog = () => document.getElementById('paste') as HTMLDialogElement;
const MIN = 60_000;

const EXAMPLE = `## No-gi class 2026-10-08 18:00
Length: 90m
Techniques: knee cut, arm triangle
Good rounds, tired cardio.

### Rolls
- Sam (purple, bigger): hit armbar; tapped to triangle; stuck in half guard
- Jo (white): hit rnc`;

function preview(list: ParsedSession[]): string {
  if (!list.length) return '<p class="empty">Paste a note to see what will be logged.</p>';
  return list
    .map((s) => {
      const k = kindById(s.type);
      const when = s.at ? dayTitle(dayDate(dayKey(s.at))) : 'ending now';
      const d = s.detail;
      const bits = [d.min ? duration(d.min * MIN) : `${duration(settings.get().defaultMin * MIN)} (default)`, d.attire === 'nogi' ? 'no-gi' : d.attire, d.techniques?.length ? d.techniques.map(techniqueLabel).join(', ') : ''].filter(Boolean);
      const rolls = s.rolls
        .map((r) => {
          const x = r.detail;
          const parts = [x.belt, x.subsFor?.length ? `hit ${x.subsFor.map(subLabel).join(', ')}` : '', x.subsAgainst?.length ? `tapped to ${x.subsAgainst.map(subLabel).join(', ')}` : '', x.stuck?.length ? `stuck in ${x.stuck.map(positionLabel).join(', ')}` : ''].filter(Boolean);
          return `<li>${esc(x.partner ?? 'Round')}${parts.length ? `: ${esc(parts.join('; '))}` : ''}</li>`;
        })
        .join('');
      return `<div class="preview"><b>${k.emoji} ${k.label}</b> · ${esc(when)} · ${esc(bits.join(' · '))}${d.note ? `<br /><span class="entry-meta">📝 ${esc(d.note.slice(0, 120))}</span>` : ''}${rolls ? `<ul>${rolls}</ul>` : ''}</div>`;
    })
    .join('');
}

/** Logs pasted Markdown. Returns how many sessions and rounds were added. */
export function logMarkdown(text: string, now = Date.now()): { sessions: number; rolls: number; ids: string[] } {
  const parsed = parseMarkdown(text);
  const events = notesToEvents(parsed, now, settings.get().defaultMin, settings.get().roundMin);
  addEvents(events);
  return { sessions: parsed.length, rolls: events.length - parsed.length, ids: events.map((e) => e.id) };
}

export function openPaste(initial = '') {
  const d = dialog();
  d.innerHTML = `${sheetHead('paste-title', 'Paste a class note')}<div class="sheet-body">
    <p class="hint" style="margin-top:0">Markdown or plain text from your notes app. A heading like "Class" or "Open mat" starts a session; "Rolls" lists rounds. Anything else becomes the note.</p>
    <label class="field"><span class="field-label">Note</span><textarea rows="9" data-md placeholder="${esc(EXAMPLE)}">${esc(initial)}</textarea></label>
    <div data-preview>${preview(parseMarkdown(initial))}</div>
    <div class="actions"><button type="button" class="btn" data-example>Show an example</button><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-log>Log it</button></div>
  </div>`;
  if (!d.dataset.pasteWired) {
    d.dataset.pasteWired = '1';
    d.addEventListener('input', (e) => {
      const ta = e.target as HTMLTextAreaElement;
      if (ta.dataset.md !== undefined) d.querySelector('[data-preview]')!.innerHTML = preview(parseMarkdown(ta.value));
    });
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const ta = d.querySelector<HTMLTextAreaElement>('[data-md]')!;
      if (el.closest('[data-example]')) {
        ta.value = EXAMPLE;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (el.closest('[data-log]')) {
        if (!ta.value.trim()) return;
        requestPersistence();
        const r = logMarkdown(ta.value);
        d.close();
        companionReact('cheer');
        toast(`Logged ${plural(r.sessions, 'session')}${r.rolls ? ` and ${plural(r.rolls, 'round')}` : ''}`, {
          actions: [{ label: 'Undo', primary: true, run: () => r.ids.forEach((id) => deleteEvent(id)) }],
        });
      }
    });
  }
  openDialog(d);
}
