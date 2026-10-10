import { parseLinkAction, stripLinkAction } from '../core/linkActions';
import { app } from '../core/log';
import { logKind, startKind, stopKind, toggleKind } from '../core/ops';
import { matMinutes } from '../core/stats';
import { present } from './actions';
import { requestPersistence } from './persist';
import { toast } from './toast';

const RECENT_KEY = 'matlog:last-link';

/** iOS sometimes opens the same shortcut link twice; don't log it twice. */
function isRepeat(search: string, now: number): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? 'null') as { q: string; at: number } | null;
    sessionStorage.setItem(RECENT_KEY, JSON.stringify({ q: search, at: now }));
    return !!last && last.q === search && now - last.at < 8000;
  } catch {
    return false;
  }
}

/** Runs a `?do=` link action once the log has loaded, then removes it from the URL. */
export function runLinkAction(now = Date.now()) {
  const search = location.search;
  const action = parseLinkAction(search);
  if (!action) return;
  history.replaceState(history.state, '', stripLinkAction(location.href));
  if (action.kind === 'invalid') {
    toast(`That link didn't log anything: ${action.reason}.`, { duration: 7000 });
    return;
  }
  if (isRepeat(search, now)) return;
  requestPersistence();
  const before = matMinutes(app.get().events, now);
  const opts = { at: now - action.minutesAgo * 60_000, detail: Object.keys(action.detail).length ? action.detail : undefined };
  const op = { log: logKind, start: startKind, stop: stopKind, toggle: toggleKind }[action.kind];
  present(op(action.what, opts), { prefix: 'Via link: ', before });
}
