import { timer } from '../core/format';
import { kindById, ongoingRoll, ongoingSession, type KindId } from '../core/kinds';
import { app, settings } from '../core/log';
import { startKind, stopKind } from '../core/ops';
import { rollsIn } from '../core/stats';
import { present } from './actions';
import { closeBtn } from './dom';

/**
 * The round clock: a big, glanceable gym timer for open mat. It counts the running round down
 * from the round length (then up, in red, past it), and between rounds counts rest. It's the same
 * round timer as the card, so every round is still logged. Keeps the screen awake while open.
 */

const dialog = () => document.getElementById('clock') as HTMLDialogElement;
const MIN = 60_000;
let tick: number | undefined;
let lock: { release(): Promise<void> } | null = null;
let buzzedFor = '';

async function keepAwake() {
  try {
    lock = (await (navigator as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
  } catch {
    lock = null;
  }
}

function lastRoundEnd(now: number): number | null {
  let best: number | null = null;
  for (const e of app.get().events) if (!e.deleted && e.type === 'roll' && e.endAt !== undefined && e.endAt <= now && (best === null || e.endAt > best)) best = e.endAt;
  return best;
}

function buzz(key: string) {
  if (buzzedFor === key) return;
  buzzedFor = key;
  navigator.vibrate?.([250, 120, 250, 120, 400]);
}

function render() {
  const d = dialog();
  const now = Date.now();
  const s = settings.get();
  const { events } = app.get();
  const round = ongoingRoll(events);
  const session = ongoingSession(events);
  const n = session ? rollsIn(session, events, now).length : 0;
  let big: string;
  let label: string;
  let phase: string;
  if (round) {
    const left = s.roundMin * MIN - (now - round.at);
    big = left >= 0 ? timer(left) : `+${timer(-left)}`;
    phase = left < 0 ? 'over' : left <= 30_000 ? 'last' : 'round';
    label = `Round ${n || 1}${left < 0 ? ' · time' : ''}`;
    if (left <= 0) buzz(`round-${round.id}`);
  } else {
    const end = lastRoundEnd(now);
    const rest = end === null ? null : now - end;
    if (rest !== null && rest < s.restMin * MIN) {
      big = timer(s.restMin * MIN - rest);
      phase = 'rest';
      label = 'Rest';
    } else {
      big = timer(s.roundMin * MIN);
      phase = 'ready';
      label = rest !== null && rest < 30 * MIN ? 'Ready' : 'Round clock';
      if (end !== null && rest !== null && rest < s.restMin * MIN + 2000) buzz(`rest-${end}`);
    }
  }
  const sessionLine = session ? `${kindById(session.type as KindId).label} · ${timer(now - session.at)} · ${n} round${n === 1 ? '' : 's'}` : 'No session running: rounds still get logged';
  const html = `<div class="clock-top"><span class="clock-session">${sessionLine}</span>${closeBtn}</div>
    <div class="clock-face" data-phase="${phase}"><span class="clock-label">${label}</span><span class="clock-big" role="timer" aria-live="off">${big}</span></div>
    <div class="clock-actions">
      ${round ? '<button type="button" class="btn clock-btn" data-end>End round</button>' : '<button type="button" class="btn primary clock-btn" data-start>Start round</button>'}
      ${!session ? '<button type="button" class="btn" data-open-mat>Start open mat</button>' : ''}
    </div>
    <div class="clock-settings">
      <span>Round <button type="button" class="chip" data-round="-1" aria-label="Shorter rounds">−</button> <b>${s.roundMin} min</b> <button type="button" class="chip" data-round="1" aria-label="Longer rounds">+</button></span>
      <span>Rest <button type="button" class="chip" data-rest="-1" aria-label="Shorter rest">−</button> <b>${s.restMin} min</b> <button type="button" class="chip" data-rest="1" aria-label="Longer rest">+</button></span>
    </div>`;
  if (d.dataset.html !== html) {
    d.innerHTML = html;
    d.dataset.html = html;
  }
  d.dataset.phase = phase;
}

export function openClock() {
  const d = dialog();
  if (!d.dataset.clockWired) {
    d.dataset.clockWired = '1';
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      const ds = b.dataset;
      const now = Date.now();
      if (ds.close !== undefined) return d.close();
      if (ds.start !== undefined) present(startKind('roll', { at: now }), { prefix: '⏱️ ' });
      else if (ds.end !== undefined) present(stopKind('roll', { at: now }), { prefix: '⏱️ ' });
      else if (ds.openMat !== undefined) present(startKind('open-mat', { at: now }));
      else if (ds.round) settings.set({ roundMin: Math.max(1, Math.min(20, settings.get().roundMin + Number(ds.round))) });
      else if (ds.rest) settings.set({ restMin: Math.max(0, Math.min(10, settings.get().restMin + Number(ds.rest))) });
      render();
    });
    d.addEventListener('close', () => {
      clearInterval(tick);
      void lock?.release().catch(() => {});
      lock = null;
    });
    document.addEventListener('visibilitychange', () => {
      if (d.open && document.visibilityState === 'visible') void keepAwake();
    });
  }
  delete d.dataset.html;
  render();
  if (!d.open) d.showModal();
  void keepAwake();
  clearInterval(tick);
  tick = window.setInterval(render, 250);
}

