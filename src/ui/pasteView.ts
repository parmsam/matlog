import { positionLabel, subLabel, techniqueLabel, visibleTechniques } from '../core/catalog';
import { dayDate, dayKey } from '../core/days';
import { dayTitle, duration, plural } from '../core/format';
import { kindById } from '../core/kinds';
import { addEvents, app, deleteEvent, settings } from '../core/log';
import { NOTE_FORMAT, NOTE_RULES, notesToEvents, parseMarkdown, type ParsedSession } from '../core/markdown';
import { notePrompt } from '../core/prompt';
import { rollStats, techniqueUses } from '../core/stats';
import { companionReact } from './companion';
import { copyText, esc, openDialog, sheetHead } from './dom';
import { requestPersistence } from './persist';
import { toast } from './toast';

const dialog = () => document.getElementById('paste') as HTMLDialogElement;
const MIN = 60_000;

const EXAMPLE = NOTE_FORMAT;

function preview(list: ParsedSession[]): string {
  if (!list.length) return '<p class="empty">Paste a note to see what will be logged.</p>';
  return list
    .map((s) => {
      const k = kindById(s.type);
      const when = s.at ? dayTitle(dayDate(dayKey(s.at))) : 'ending now';
      const d = s.detail;
      const bits = [d.min ? duration(d.min * MIN) : `${duration(settings.get().defaultMin * MIN)} (default)`, d.attire === 'nogi' ? 'no-gi' : d.attire, d.topic ? `topic: ${d.topic}` : ''].filter(Boolean);
      const extra = [
        d.techniques?.length ? `Techniques: ${d.techniques.map(techniqueLabel).join(', ')}` : '',
        s.techNotes?.length ? plural(s.techNotes.length, 'technique note') : '',
        s.problems.length ? plural(s.problems.length, 'problem') : '',
        s.injuries?.length ? plural(s.injuries.length, 'injury', 'injuries') : '',
        d.enjoy || d.plan ? 'a check-in' : '',
      ].filter(Boolean);
      const rolls = s.rolls
        .map((r) => {
          const x = r.detail;
          const parts = [
            x.belt,
            x.start ? `from ${positionLabel(x.start).toLowerCase()}${x.role ? ` ${x.role}` : ''}` : '',
            x.subsFor?.length ? `hit ${x.subsFor.map(subLabel).join(', ')}` : '',
            x.subsAgainst?.length ? `tapped to ${x.subsAgainst.map(subLabel).join(', ')}` : '',
            x.landed?.length ? `landed ${x.landed.map(techniqueLabel).join(', ')}` : '',
            x.tried?.length ? `went for ${x.tried.map(techniqueLabel).join(', ')}` : '',
            x.stuck?.length ? `stuck in ${x.stuck.map(positionLabel).join(', ')}` : '',
            x.outcome,
          ].filter(Boolean);
          return `<li>${esc(x.partner ?? 'Round')}${parts.length ? `: ${esc(parts.join('; '))}` : ''}</li>`;
        })
        .join('');
      return `<div class="preview"><b>${k.emoji} ${k.label}</b> · ${esc(when)} · ${esc(bits.join(' · '))}${extra.length ? `<br /><span>${esc(extra.join(' · '))}</span>` : ''}${d.note ? `<br /><span class="entry-meta">📝 ${esc(d.note.slice(0, 120))}</span>` : ''}${rolls ? `<ul>${rolls}</ul>` : ''}</div>`;
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
    <p class="hint" style="margin-top:0">A class note in Markdown, or plain text from your notes app: you’ll see what will be logged before anything is saved.</p>
    <details class="fold format-help"><summary><span>The format</span></summary><div class="fold-body">
      <pre class="format">${esc(NOTE_FORMAT)}</pre>
      <ul class="rules">${NOTE_RULES.map((r) => `<li>${esc(r).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`).join('')}</ul>
      <p class="hint">Got a voice memo or a messy note? Copy the prompt, paste it into ChatGPT or Claude with your notes, and paste the answer back here. It includes your own technique names, so they match.</p>
      <p><button type="button" class="chip primary" data-copy-prompt>Copy prompt for an AI</button></p>
    </div></details>
    <label class="field"><span class="field-label">Note</span><textarea rows="9" data-md placeholder="${esc(EXAMPLE)}">${esc(initial)}</textarea></label>
    <div data-preview>${preview(parseMarkdown(initial))}</div>
    <div class="actions"><button type="button" class="btn" data-example>Use the example</button><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-log>Log it</button></div>
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
      if (el.closest('[data-copy-prompt]')) {
        const events = app.get().events;
        const prompt = notePrompt({
          today: dayKey(Date.now()),
          techniques: [...new Set([...techniqueUses(events).map((u) => u.label), ...visibleTechniques().map((t) => t.label)])].slice(0, 120),
          partners: rollStats(events).partners.slice(0, 30).map((p) => p.label),
        });
        void copyText(prompt).then((ok) => toast(ok ? 'Prompt copied. Paste it into your AI chat with your notes.' : "Couldn't copy"));
        return;
      }
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
