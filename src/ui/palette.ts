import { rankMatches } from '../core/fuzzy';
import { KINDS, ongoingFor } from '../core/kinds';
import { app, settings } from '../core/log';
import { visibleTechniques } from '../core/catalog';
import { holdKind, tapKind } from './actions';
import { backUpNow } from './backup';
import { esc } from './dom';
import { openNotebook } from './notebook';
import { openPaste } from './pasteView';
import { openProgress } from './progressView';
import { openClock } from './roundClock';
import { openSettings } from './settingsView';
import { openShortcuts } from './shortcuts';
import { openTech } from './techView';
import { toast, undoLast } from './toast';

/**
 * The command palette (Ctrl/⌘K): everything the cards, top bar and shortcuts do, plus jumping to a
 * technique, by typing a few letters. Commands are built when it opens, so start/stop reads right.
 */

interface Command {
  label: string;
  /** Extra words it answers to, not shown. */
  also?: string;
  key?: string;
  run: () => void;
}

const MAX = 40;
let copyWeek: () => void = () => {};
/** main.ts owns "copy the last 7 days" (it's a shortcut there too). */
export const setCopyWeek = (fn: () => void) => (copyWeek = fn);

function commands(): Command[] {
  const events = app.get().events;
  const past = settings.get().cardsLogPast;
  const kinds = KINDS.flatMap((k): Command[] => {
    const on = ongoingFor(events, k.id);
    const name = k.label.toLowerCase();
    return [
      { label: `${k.emoji} ${on ? 'Stop' : past ? 'Log' : 'Start'} ${name}`, also: 'card timer', key: k.key.toUpperCase(), run: () => tapKind(k.id) },
      ...(on || past ? [] : [{ label: `${k.emoji} Log a finished ${name}`, also: 'past earlier add', key: `⇧${k.key.toUpperCase()}`, run: () => holdKind(k.id) }]),
    ];
  });
  const theme = (id: 'auto' | 'gi' | 'nogi', label: string): Command => ({ label: `Theme: ${label}`, also: 'appearance color dark light mode', run: () => settings.set({ theme: id }) });
  return [
    ...kinds,
    { label: 'Round clock', also: 'timer', key: 'K', run: openClock },
    { label: 'Notebook: Working on', also: 'focus block', key: 'F', run: () => openNotebook('focus') },
    { label: 'Notebook: Problems', also: 'stuck', key: 'B', run: () => openNotebook('problems') },
    { label: 'Notebook: Injuries', also: 'hurt', key: 'I', run: () => openNotebook('injuries') },
    { label: 'Notebook: Reflections', also: 'journal', run: () => openNotebook('reflections') },
    { label: 'Progress', also: 'stats belt hours charts', key: 'G', run: openProgress },
    { label: 'Technique library', also: 'moves', key: 'T', run: () => openTech() },
    { label: 'Paste a class note', also: 'import markdown', key: 'V', run: () => openPaste() },
    { label: 'Copy the last 7 days as Markdown', also: 'export week', key: 'M', run: copyWeek },
    { label: 'Undo', key: 'U', run: () => void (undoLast() || toast('Nothing to undo')) },
    { label: 'Back up now', also: 'export save download', run: () => void backUpNow() },
    { label: 'Settings', also: 'preferences belt name', key: ',', run: openSettings },
    { label: 'Keyboard shortcuts', also: 'help keys', key: '?', run: openShortcuts },
    theme('auto', 'Auto'),
    theme('gi', 'Gi (light)'),
    theme('nogi', 'No-gi (dark)'),
  ];
}

const dialog = () => document.getElementById('palette') as HTMLDialogElement;
let shown: Command[] = [];
let active = 0;

function list(q: string) {
  const all = commands();
  // Techniques only once you type: there are too many to list up front.
  const techs: Command[] = q.trim() ? visibleTechniques().map((t) => ({ label: `Technique: ${t.label}`, run: () => openTech(t.id) })) : [];
  shown = rankMatches(q, [...all, ...techs], (c) => `${c.label} ${c.also ?? ''}`).slice(0, MAX);
  active = 0;
  const d = dialog();
  d.querySelector('ul')!.innerHTML = shown.length
    ? shown.map((c, i) => `<li role="option" id="pal-${i}" data-i="${i}">${esc(c.label)}${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</li>`).join('')
    : '<li class="pal-empty" aria-disabled="true">Nothing matches</li>';
  mark();
}

function mark() {
  const d = dialog();
  d.querySelectorAll('[role="option"]').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  const input = d.querySelector('input')!;
  if (shown.length) input.setAttribute('aria-activedescendant', `pal-${active}`);
  else input.removeAttribute('aria-activedescendant');
  d.querySelector(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
}

function run(i: number) {
  const c = shown[i];
  if (!c) return;
  dialog().close();
  c.run();
}

function wire(d: HTMLDialogElement) {
  d.innerHTML = `<input type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" aria-label="Command" placeholder="Type a command or a technique…" autocomplete="off" spellcheck="false" enterkeyhint="go" />
    <ul id="pal-list" role="listbox" aria-label="Commands"></ul>`;
  const input = d.querySelector('input')!;
  input.addEventListener('input', () => list(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      mark();
    } else if (e.key === 'Enter') run(active);
    else return;
    e.preventDefault();
  });
  d.querySelector('ul')!.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (li) run(Number(li.dataset.i));
  });
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
}

export function openPalette() {
  const d = dialog();
  if (!d.dataset.wired) {
    d.dataset.wired = '1';
    wire(d);
  }
  const input = d.querySelector('input')!;
  input.value = '';
  list('');
  if (!d.open) d.showModal();
  input.focus();
}

/** Ctrl/⌘K toggles it. Not over another sheet: closing that one would lose what you were typing. */
export function paletteKey(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return false;
  e.preventDefault();
  const d = dialog();
  if (d.open) d.close();
  else if (!document.querySelector('dialog[open]')) openPalette();
  return true;
}
