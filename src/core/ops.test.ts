import { beforeEach, describe, expect, it } from 'vitest';
import { app } from './log';
import { logKind, startKind, stopKind, toggleKind } from './ops';
import { MIN } from './testUtil';

beforeEach(() => app.set({ events: [] }));

describe('ops', () => {
  it('toggles a class on and off', () => {
    expect(toggleKind('class').kind).toBe('started');
    const r = toggleKind('class');
    expect(r.kind).toBe('stopped');
    expect(app.get().events[0].endAt).toBeDefined();
  });
  it('switches the running session instead of starting a second', () => {
    startKind('class');
    const r = startKind('open-mat');
    expect(r.kind).toBe('switched');
    expect(app.get().events).toHaveLength(1);
    expect(app.get().events[0].type).toBe('open-mat');
  });
  it('runs a round alongside a session, and stopping the session stops the round', () => {
    startKind('class');
    expect(startKind('roll').kind).toBe('started');
    expect(startKind('roll').kind).toBe('noop');
    const r = stopKind('class');
    expect(r.kind === 'stopped' && r.alsoStopped).toBeTruthy();
    expect(app.get().events.every((e) => e.endAt !== undefined)).toBe(true);
  });
  it('logs a finished session ending at `at` with its length', () => {
    const now = Date.now();
    const r = logKind('open-mat', { at: now - 10 * MIN, detail: { min: 60 } });
    expect(r.kind === 'logged' && r.event).toMatchObject({ type: 'open-mat', at: now - 70 * MIN, detail: { min: 60 } });
  });
  it('stop with nothing running is a no-op with a reason', () => {
    expect(stopKind('drilling')).toMatchObject({ kind: 'noop', reason: 'No drilling is going' });
  });
});
