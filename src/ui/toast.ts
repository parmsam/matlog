export interface ToastAction {
  label: string;
  run: () => void;
  /** Keep the toast open after running (e.g. the time-shift chips). */
  keepOpen?: boolean;
  primary?: boolean;
}

export interface ToastHandle {
  update(msg: string): void;
  close(): void;
}

let current: { el: HTMLElement; timer: number | undefined } | null = null;
let host: HTMLElement | null = null;

/**
 * Where toasts go. An open sheet is a modal dialog: it covers the page and makes the rest inert,
 * so a toast outside it (like an import's "Merged: …") would land hidden behind it. While a sheet
 * is open the host lives inside it; otherwise on the page. Kept by reference, since sheets rebuild
 * their contents with innerHTML.
 */
const isModal = (d: HTMLDialogElement) => {
  try {
    return d.matches(':modal');
  } catch {
    return false; // No :modal support (old Safari, jsdom): leave toasts where they are.
  }
};

function toastHost(): HTMLElement {
  host ??= document.getElementById('toasts')!;
  const sheets = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(isModal);
  const parent = sheets.at(-1) ?? document.body;
  if (host.parentElement !== parent) parent.append(host);
  return host;
}

/** The latest Undo on offer, so the U key can use it even after its toast has faded. */
let lastUndo: { run: () => void; at: number } | null = null;
const UNDO_WINDOW = 5 * 60_000;

export function undoLast(): boolean {
  if (!lastUndo || Date.now() - lastUndo.at > UNDO_WINDOW) return false;
  const { run } = lastUndo;
  lastUndo = null;
  dismiss();
  run();
  return true;
}

/** Shows one toast at a time; a new one replaces the last, so Undo always refers to the latest action. */
export function toast(msg: string, opts: { actions?: ToastAction[]; duration?: number } = {}): ToastHandle {
  const host = toastHost();
  dismiss();
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('div');
  text.className = 'toast-msg';
  text.textContent = msg;
  const row = document.createElement('div');
  row.className = 'toast-actions';
  el.append(text, row);

  // Toasts with an Undo (or other actions) stay long enough to reach for, one-handed.
  const duration = opts.duration ?? (opts.actions?.length ? 12_000 : 3500);
  const entry = { el, timer: undefined as number | undefined };
  const arm = () => {
    clearTimeout(entry.timer);
    entry.timer = window.setTimeout(close, duration);
  };
  function close() {
    clearTimeout(entry.timer);
    if (current === entry) current = null;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }

  const undo = opts.actions?.find((a) => a.label === 'Undo');
  if (undo) lastUndo = { run: undo.run, at: Date.now() };

  for (const a of opts.actions ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.primary ? 'chip primary' : 'chip';
    b.textContent = a.label;
    b.addEventListener('click', () => {
      if (a === undo) lastUndo = null;
      a.run();
      if (a.keepOpen) arm();
      else close();
    });
    row.append(b);
  }

  // Don't vanish while someone is reaching for a button.
  el.addEventListener('pointerenter', () => clearTimeout(entry.timer));
  el.addEventListener('pointerleave', arm);

  host.append(el);
  current = entry;
  arm();
  return {
    update: (m) => {
      text.textContent = m;
    },
    close,
  };
}

export function dismiss() {
  if (!current) return;
  clearTimeout(current.timer);
  current.el.remove();
  current = null;
}
