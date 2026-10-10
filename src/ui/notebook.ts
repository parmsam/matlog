import { openDialog } from './dom';

/**
 * The Notebook: everything about training with intention in one place, as tabs: Focus (what
 * you're working on), Problems, Injuries and Reflections. Each tab's view renders into its own panel.
 */

export type NotebookTab = 'focus' | 'problems' | 'injuries' | 'reflections';
const TABS: NotebookTab[] = ['focus', 'problems', 'injuries', 'reflections'];
const PANEL: Record<NotebookTab, string> = { focus: 'focus-sheet', problems: 'problems', injuries: 'injuries', reflections: 'reflections' };
const LAST_KEY = 'matlog:notebook-tab';

const dialog = () => document.getElementById('notebook') as HTMLDialogElement;
const openers: Partial<Record<NotebookTab, () => void>> = {};

/** Each view registers how to open (render) its tab. */
export function registerTab(tab: NotebookTab, open: () => void) {
  openers[tab] = open;
}

/** Shows a tab whose panel was just rendered, opening the Notebook if it isn't open. */
export function showNotebook(tab: NotebookTab) {
  const d = dialog();
  if (!d.dataset.nbWired) {
    d.dataset.nbWired = '1';
    d.querySelector('.tabs')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (b) openers[b.dataset.tab as NotebookTab]?.();
    });
    d.querySelector('.tabs')!.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
      const cur = TABS.indexOf((d.dataset.tab as NotebookTab) ?? 'focus');
      const next = TABS[(cur + (k === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      openers[next]?.();
      d.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
    });
  }
  d.dataset.tab = tab;
  for (const t of TABS) {
    const on = t === tab;
    document.getElementById(PANEL[t])!.hidden = !on;
    const b = d.querySelector<HTMLElement>(`[data-tab="${t}"]`)!;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  try {
    localStorage.setItem(LAST_KEY, tab);
  } catch {
    /* a convenience only */
  }
  if (!d.open) openDialog(d);
  d.scrollTop = 0;
}

/** Opens the Notebook on the tab you used last. */
export function openNotebook(tab?: NotebookTab) {
  let t = tab;
  if (!t) {
    try {
      t = (localStorage.getItem(LAST_KEY) as NotebookTab | null) ?? undefined;
    } catch {
      t = undefined;
    }
  }
  openers[t && TABS.includes(t) ? t : 'focus']?.();
}

export const closeNotebook = () => dialog().close();
export const notebookTab = () => (dialog().open ? (dialog().dataset.tab as NotebookTab) : null);
