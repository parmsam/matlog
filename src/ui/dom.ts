import type { Belt } from '../core/types';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const BELT_LABEL: Record<Belt, string> = { white: 'White', blue: 'Blue', purple: 'Purple', brown: 'Brown', black: 'Black' };

/** A small belt swatch with its stripes, as HTML. */
export function beltSwatch(belt: Belt, stripes = 0): string {
  const bar = belt === 'black' ? 'var(--k-comp)' : 'var(--belt-black)';
  return `<span class="belt-swatch" style="--sw: var(--belt-${belt}); --bar: ${bar}; --stripes-w: ${stripes * 3}px" role="img" aria-label="${BELT_LABEL[belt]} belt${stripes ? `, ${stripes} stripe${stripes === 1 ? '' : 's'}` : ''}"></span>`;
}

export const closeBtn = '<button type="button" class="icon-btn" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';

export function sheetHead(id: string, title: string): string {
  return `<div class="sheet-head"><h2 id="${id}" tabindex="-1">${title}</h2>${closeBtn}</div>`;
}

/** Opens a dialog and wires its close buttons and backdrop click. Focuses the title, so phone keyboards stay closed. */
export function openDialog(d: HTMLDialogElement) {
  if (!d.dataset.wired) {
    d.dataset.wired = '1';
    d.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]') || e.target === d) d.close();
    });
  }
  if (!d.open) d.showModal();
  d.querySelector<HTMLElement>('h2')?.focus();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  }
}

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
