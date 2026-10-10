import { beforeEach, describe, expect, it } from 'vitest';
import { app, settings } from './log';
import { classStart, logKind, startKind, stopKind, toggleKind } from './ops';
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
  it('a round logged after the fact is 5 minutes by default (the round length setting)', () => {
    const now = Date.now();
    const r = logKind('roll', { at: now });
    expect(r.kind === 'logged' && r.event).toMatchObject({ at: now - 5 * MIN, detail: { min: 5 } });
    settings.set({ roundMin: 7 });
    const r2 = logKind('roll', { at: now });
    expect(r2.kind === 'logged' && r2.event.detail?.min).toBe(7);
    settings.set({ roundMin: 5 });
  });
  it('stop with nothing running is a no-op with a reason', () => {
    expect(stopKind('drilling')).toMatchObject({ kind: 'noop', reason: 'No drilling is going' });
  });
});

describe('classes start on the hour', () => {
  const t = (h: number, m: number) => new Date(2026, 9, 9, h, m).getTime();
  it('snaps classes, live within 10 minutes, logged always', () => {
    expect(classStart(t(19, 4), true)).toBe(t(19, 0));
    expect(classStart(t(19, 10), true)).toBe(t(19, 0));
    expect(classStart(t(19, 25), true)).toBe(t(19, 25));
    expect(classStart(t(19, 10), false)).toBe(t(19, 0));
    expect(classStart(t(19, 50), false)).toBe(t(19, 0));
  });
  it('a class logged after the fact starts on the hour; open mat does not', () => {
    const r = logKind('class', { at: t(20, 10), detail: { min: 60 } });
    expect(r.kind === 'logged' && r.event.at).toBe(t(19, 0));
    expect(r.kind === 'logged' && r.snappedFrom).toBe(t(19, 10));
    const o = logKind('open-mat', { at: t(20, 10), detail: { min: 60 } });
    expect(o.kind === 'logged' && o.event.at).toBe(t(19, 10));
  });
  it('can be turned off', () => {
    settings.set({ classOnHour: false });
    const r = logKind('class', { at: t(20, 10), detail: { min: 60 } });
    expect(r.kind === 'logged' && r.event.at).toBe(t(19, 10));
    settings.set({ classOnHour: true });
  });
});
