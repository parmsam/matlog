import './styles.css';
import { KINDS } from './core/kinds';
import { app, init, settings, setupPersistence } from './core/log';
import { tapKind, holdKind } from './ui/actions';
import { createAgentApi } from './ui/agentApi';
import { renderCompanion } from './ui/companion';
import { copyText } from './ui/dom';
import { mountCards, mountRecent, renderCards, renderHero, renderRecent } from './ui/homeView';
import { runLinkAction } from './ui/linkRunner';
import { openPaste } from './ui/pasteView';
import { openProgress } from './ui/progressView';
import { setupPwa } from './ui/pwa';
import { openSettings } from './ui/settingsView';
import { openShortcuts } from './ui/shortcuts';
import { openTech } from './ui/techView';
import { applyTheme } from './ui/theme';
import { toast, undoLast } from './ui/toast';
import { addDays, dayKey } from './core/days';
import { toMarkdown } from './core/markdown';

const cardsEl = document.getElementById('cards')!;

setupPersistence();
// Pinch-zoom stays; iPhone's focus zoom goes (maximum-scale=1 is read that way on iOS only).
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
  const vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (vp && !vp.content.includes('maximum-scale')) vp.content += ', maximum-scale=1';
}
applyTheme(settings.get().theme);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(settings.get().theme));
mountCards(cardsEl);
mountRecent();
document.getElementById('app-version')!.textContent = `v${__APP_VERSION__}`;
document.getElementById('settings-open')!.addEventListener('click', openSettings);
document.getElementById('progress-open')!.addEventListener('click', openProgress);
document.getElementById('tech-open')!.addEventListener('click', openTech);
document.getElementById('paste-open')!.addEventListener('click', () => openPaste());
document.getElementById('shortcuts-open')!.addEventListener('click', openShortcuts);

function editFocus() {
  const cur = settings.get().focus;
  const next = prompt('What are you working on? (Leave empty to clear.)', cur);
  if (next !== null) settings.set({ focus: next.trim().slice(0, 140) });
}
document.getElementById('focus')!.addEventListener('click', editFocus);

let frame = 0;
function render() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const now = Date.now();
    renderCards(cardsEl, now);
    if (!app.get().loaded) return;
    renderHero(now);
    renderRecent(now);
    renderCompanion(now);
    const name = settings.get().name.trim();
    document.title = name ? `${name} · matlog` : 'matlog';
  });
}

app.subscribe(render);
settings.subscribe((s, prev) => {
  if (s.theme !== prev.theme) applyTheme(s.theme);
  render();
});

// Everything is derived from timestamps, so a once-a-second redraw keeps timers and "ago" fresh.
setInterval(() => {
  if (document.visibilityState === 'visible') render();
}, 1000);
document.addEventListener('visibilitychange', render);

async function copyWeek() {
  const now = Date.now();
  const ok = await copyText(toMarkdown(app.get().events, addDays(dayKey(now), -6), dayKey(now), now, settings.get().name));
  toast(ok ? 'Copied the last 7 days as Markdown' : "Couldn't copy");
}

// Keyboard: a letter per card starts/stops it (Shift: log a finished one), plus views.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const el = e.target as HTMLElement;
  if (el.closest('input, textarea, select, [contenteditable]')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === ',') openSettings();
  else if (key === '?') openShortcuts();
  else if (key === 'g') openProgress();
  else if (key === 't') openTech();
  else if (key === 'v') openPaste();
  else if (key === 'f') editFocus();
  else if (key === 'm') void copyWeek();
  else if (key === 'u') {
    if (!undoLast()) toast('Nothing to undo');
  } else {
    const k = KINDS.find((c) => c.key === key);
    if (!k) return;
    cardsEl.querySelector<HTMLElement>(`[data-card="${k.id}"]`)?.focus();
    if (e.shiftKey) holdKind(k.id);
    else tapKind(k.id);
  }
  e.preventDefault();
});

render();
void init().then(({ restored }) => {
  if (restored) toast(`Recovered ${restored} entr${restored === 1 ? 'y' : 'ies'} from the on-device backup copy`);
  document.documentElement.dataset.ready = '';
  runLinkAction();
  render();
});
setupPwa();
window.matlog = createAgentApi();
