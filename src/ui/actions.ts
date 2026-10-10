import { duration, clockTime } from '../core/format';
import { kindById, ongoingFor, type KindId } from '../core/kinds';
import { app, deleteEvent, getEvent, revertTo, settings, updateEvent } from '../core/log';
import { toggleKind, type OpResult } from '../core/ops';
import { matMinutes, unlockedPatches } from '../core/stats';
import type { LogEvent } from '../core/types';
import { companionReact } from './companion';
import { requestPersistence } from './persist';
import { lastAttire, openSheet } from './sheet';
import { toast, type ToastAction } from './toast';

const MIN = 60_000;

/** "−5m / −15m / −30m" chips that move a just-logged time back, for logging after the fact. */
function shiftChips(e: LogEvent, onShift: (ts: number) => void): ToastAction[] {
  const base = e.at;
  const end = e.endAt;
  return [5, 15, 30].map((m) => ({
    label: `−${m}m`,
    keepOpen: true,
    run: () => {
      const at = base - m * MIN;
      // A stopped entry moves its end; a started or finished one moves as a whole.
      if (end !== undefined) updateEvent(e.id, { endAt: Math.max(e.at, end - m * MIN) });
      else updateEvent(e.id, { at });
      onShift(end !== undefined ? end - m * MIN : at);
    },
  }));
}

/** Toasts when a log crosses a mat-hour milestone. Derived: compares before and after. */
function checkPatch(before: number) {
  const after = matMinutes(app.get().events, Date.now());
  const was = unlockedPatches(before).length;
  const now = unlockedPatches(after);
  if (now.length > was) {
    const p = now[now.length - 1];
    settings.set({ patches: [...new Set([...settings.get().patches, p.id])] });
    companionReact('cheer');
    toast(`🎖️ Patch unlocked: ${p.label} on the mat. Your buddy sewed it on.`, { duration: 6000 });
    return true;
  }
  return false;
}

/**
 * Shows what an operation did: a toast with Undo and time chips, and the companion's reaction.
 * Stopping a round opens its sheet, since that's when you know what happened. Shared by taps and links.
 */
export function present(r: OpResult, opts: { prefix?: string; before?: number } = {}) {
  const def = kindById(r.what);
  const prefix = opts.prefix ?? '';
  const t = (ts: number) => clockTime(ts, settings.get().clock);
  const before = opts.before ?? matMinutes(app.get().events, Date.now());
  switch (r.kind) {
    case 'noop':
      toast(`${prefix}${def.emoji} ${r.reason}`);
      return;
    case 'started': {
      if (r.what !== 'roll') companionReact('tie');
      const label = (ts: number) => `${prefix}${def.emoji} ${def.label} started · ${t(ts)}`;
      const h = toast(label(r.event.at), {
        actions: [{ label: 'Undo', primary: true, run: () => deleteEvent(r.event.id) }, ...shiftChips(r.event, (ts) => h.update(label(ts))), { label: 'Details', run: () => openSheet({ event: getEvent(r.event.id)! }) }],
      });
      return;
    }
    case 'logged': {
      const ev = r.event;
      const min = ev.detail?.min ?? 0;
      if (ev.detail?.subsAgainst?.length) companionReact('tap');
      else if (ev.detail?.subsFor?.length) companionReact('cheer');
      if (checkPatch(before)) return;
      const label = (ts: number) => `${prefix}${def.emoji} ${def.label} · ${duration(min * MIN)}, ended ${t(ts + min * MIN)}`;
      const h = toast(label(ev.at), {
        actions: [{ label: 'Undo', primary: true, run: () => deleteEvent(ev.id) }, ...shiftChips(ev, (ts) => h.update(label(ts))), { label: 'Details', run: () => openSheet({ event: getEvent(ev.id)! }) }],
      });
      return;
    }
    case 'switched': {
      const prev = r.prev;
      companionReact('tie');
      toast(`${prefix}${def.emoji} Now counting as ${def.label.toLowerCase()}`, { actions: [{ label: 'Undo', primary: true, run: () => revertTo(prev) }] });
      return;
    }
    case 'stopped': {
      const { prev, alsoStopped } = r;
      if (checkPatch(before)) return;
      if (r.what === 'roll' && !opts.prefix) {
        return openSheet({ event: r.event, intro: `Round over · ${duration((r.event.endAt ?? r.event.at) - r.event.at)}. Who, and what happened? All optional.` });
      }
      const label = (ts: number) => `${prefix}${def.emoji} ${def.label} · ${duration(ts - r.event.at)}`;
      const h = toast(label(r.event.endAt!), {
        actions: [
          {
            label: 'Undo',
            primary: true,
            run: () => {
              revertTo(prev);
              if (alsoStopped) revertTo(alsoStopped.prev);
            },
          },
          ...shiftChips(r.event, (ts) => h.update(label(ts))),
          { label: 'Details', run: () => openSheet({ event: getEvent(r.event.id)! }) },
        ],
      });
      return;
    }
  }
}

/** Tap on a card: start or stop it now. New sessions remember gi or no-gi from last time. */
export function tapKind(id: KindId, now = Date.now()) {
  requestPersistence();
  const before = matMinutes(app.get().events, now);
  const running = ongoingFor(app.get().events, id);
  const attire = id !== 'roll' && !running ? lastAttire() : undefined;
  present(toggleKind(id, { at: now, detail: attire ? { attire } : undefined }), { before });
}

/** Long press: straight to the sheet. A running one opens for editing; otherwise a finished entry to fill in. */
export function holdKind(id: KindId) {
  const on = ongoingFor(app.get().events, id);
  if (on) return openSheet({ event: on });
  const attire = id !== 'roll' ? lastAttire() : undefined;
  openSheet({ type: id, detail: attire ? { attire } : undefined });
}
