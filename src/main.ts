import './styles.css';
import { KINDS } from './core/kinds';
import { app, init, settings, setupPersistence } from './core/log';
import { tapKind, holdKind } from './ui/actions';
import { createAgentApi } from './ui/agentApi';
import { renderCompanion } from './ui/companion';
import { copyText } from './ui/dom';
import { mountCards, mountRecent, renderCards, renderHero, renderRecent } from './ui/homeView';
import { runLinkAction } from './ui/linkRunner';
import { openFocus } from './ui/focusView';
import { openPaste } from './ui/pasteView';
import { openProgress } from './ui/progressView';
import { setupPwa } from './ui/pwa';
import { openSettings } from './ui/settingsView';
import { openShortcuts } from './ui/shortcuts';
import { openTech } from './ui/techView';
import { applyTheme } from './ui/theme';
import { mountBanner, showBanner } from './ui/banner';
import { openClock } from './ui/roundClock';
import { openProblems } from './ui/problemsView';
import { openInjuries } from './ui/injuriesView';
import { onLadder } from './ui/focusView';
import { companionSay } from './ui/companion';
import { setCustomTechniques } from './core/catalog';
import { customFromLog } from './core/library';
import { showSplash } from './ui/splash';
import { currentRank } from './core/stats';
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
mountBanner();
document.getElementById('app-version')!.textContent = `v${__APP_VERSION__}`;
document.getElementById('settings-open')!.addEventListener('click', openSettings);
document.getElementById('progress-open')!.addEventListener('click', openProgress);
document.getElementById('tech-open')!.addEventListener('click', () => openTech());
document.getElementById('clock-open')!.addEventListener('click', openClock);
document.getElementById('injury-line')!.addEventListener('click', () => openInjuries());
document.getElementById('companion')!.addEventListener('click', companionSay);
onLadder((id) => openTech(id));
document.getElementById('paste-open')!.addEventListener('click', () => openPaste());
document.getElementById('shortcuts-open')!.addEventListener('click', openShortcuts);

document.getElementById('focus')!.addEventListener('click', () => openFocus());

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
    const belt = currentRank(app.get().events, settings.get(), now).belt;
    if (settings.get().lastBelt !== belt) settings.set({ lastBelt: belt });
    const name = settings.get().name.trim();
    document.title = name ? `${name} · matlog` : 'matlog';
  });
}

// Your own techniques live in the log; the catalog lookups see them through this registry.
app.subscribe((s, prev) => {
  if (s.events !== prev.events) setCustomTechniques(customFromLog(s.events));
});
app.subscribe(render);
// New entries can make the backup reminder due; settings changes (a backup, "Not now") can clear it.
app.subscribe((s, prev) => {
  if (s.loaded && s.events.length !== prev.events.length) showBanner();
});
settings.subscribe((s, prev) => {
  if (s.theme !== prev.theme) applyTheme(s.theme);
  showBanner();
  render();
});

// Everything is derived from timestamps, so a once-a-second redraw keeps timers and "ago" fresh.
setInterval(() => {
  if (document.visibilityState === 'visible') render();
}, 1000);
// The reflection prompt comes due with time, not with a change.
setInterval(showBanner, 30_000);
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
  else if (key === 'f') openFocus();
  else if (key === 'k') openClock();
  else if (key === 'b') openProblems();
  else if (key === 'i') openInjuries();
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
const loading = init();
showSplash(loading, { enabled: settings.get().splash, rank: settings.get().lastBelt });
void loading.then(({ restored }) => {
  if (restored) toast(`Recovered ${restored} entr${restored === 1 ? 'y' : 'ies'} from the on-device backup copy`);
  document.documentElement.dataset.ready = '';
  runLinkAction();
  showBanner();
  render();
});
setupPwa();
window.matlog = createAgentApi();
