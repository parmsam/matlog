import { describe, expect, it } from 'vitest';
import { blockProgress, finishFocus, focuses, focusProgress, matchFocus, migrateFocus, newFocus, nextBlock, repsToday, restFocus } from './focus';
import { at, ev } from './testUtil';

const DAY = 86_400_000;

describe('matchFocus', () => {
  it('finds techniques, positions and subs inside a sentence', () => {
    expect(matchFocus('knee slice')).toEqual({ kind: 'technique', id: 'knee-cut' });
    expect(matchFocus('Hitting the scissor sweep more')).toEqual({ kind: 'technique', id: 'scissor-sweep' });
    expect(matchFocus('escaping half guard bottom')).toEqual({ kind: 'position', id: 'half-guard' });
    expect(matchFocus('triangle defense')).toEqual({ kind: 'sub', id: 'triangle' });
    expect(matchFocus('My spin thing', ['My spin thing'])).toEqual({ kind: 'technique', id: 'My spin thing' });
    expect(matchFocus('breathing and staying calm')).toBeNull();
  });
});

describe('focusProgress', () => {
  const since = at(2026, 10, 1);
  const events = [
    ev('class', at(2026, 9, 30), { min: 60, techniques: ['knee-cut'] }), // before the focus
    ev('class', at(2026, 10, 2), { min: 60, techniques: ['knee-cut'] }),
    ev('open-mat', at(2026, 10, 3), { min: 60 }),
    ev('roll', at(2026, 10, 3, 13), { min: 6, landed: ['knee-cut'], stuck: ['half-guard'], subsAgainst: ['triangle'] }),
    ev('roll', at(2026, 10, 3, 14), { min: 6, tried: ['knee-cut'], stuck: ['half-guard'], start: 'half-guard', role: 'bottom' }),
  ];
  const now = at(2026, 10, 9);
  it('counts what happened in a window', () => {
    expect(focusProgress(events, { kind: 'technique', id: 'knee-cut' }, since, now)).toMatchObject({ sessions: 2, drilled: 1, attempts: 2, landed: 1 });
    expect(focusProgress(events, { kind: 'position', id: 'half-guard' }, since, now)).toMatchObject({ stuck: 2, started: 1 });
    expect(focusProgress(events, { kind: 'sub', id: 'triangle' }, since, now)).toMatchObject({ tapped: 1, hit: 0 });
    expect(focusProgress(events, null, since, now)).toMatchObject({ sessions: 2, drilled: 0 });
    // A round that started just before the focus was set but ended after it counts.
    const r = ev('roll', since - 3 * 60_000, { min: 6, landed: ['knee-cut'] });
    expect(focusProgress([r], { kind: 'technique', id: 'knee-cut' }, since, now)).toMatchObject({ landed: 1 });
  });
  it('counts reps today', () => {
    expect(repsToday(events, { kind: 'technique', id: 'knee-cut' }, at(2026, 10, 3, 20))).toBe(1);
    expect(repsToday(events, { kind: 'technique', id: 'knee-cut' }, at(2026, 10, 4, 20))).toBe(0);
  });
});

describe('blocks', () => {
  const t0 = at(2026, 9, 1);
  it('runs a block, goes over, rests, comes back and finishes', () => {
    const e = newFocus('knee cut', t0, { role: 'main', blockDays: 14, ifWorks: 'back take', ifFails: 'knee shield' });
    expect(e.detail!.focus).toEqual({ text: 'knee cut', role: 'main', blockDays: 14, blocks: [{ from: t0 }], ifWorks: 'back take', ifFails: 'knee shield' });
    let [v] = focuses([e], t0 + 9 * DAY);
    expect(v).toMatchObject({ state: 'active', week: 2, weeks: 2 });
    [v] = focuses([e], t0 + 15 * DAY);
    expect(v.state).toBe('over');
    const rested = restFocus(e.detail!.focus!, t0 + 16 * DAY);
    // A block that ran over ends when it was planned to.
    expect(rested.blocks).toEqual([{ from: t0, to: t0 + 14 * DAY }]);
    [v] = focuses([{ ...e, detail: { focus: rested } }], t0 + 20 * DAY);
    expect(v).toMatchObject({ state: 'resting', restingSince: t0 + 14 * DAY });
    const back = nextBlock(rested, t0 + 30 * DAY);
    expect(back.blocks).toEqual([{ from: t0, to: t0 + 14 * DAY }, { from: t0 + 30 * DAY }]);
    const done = finishFocus(back, t0 + 35 * DAY);
    expect(done).toMatchObject({ doneAt: t0 + 35 * DAY, blocks: [{ from: t0, to: t0 + 14 * DAY }, { from: t0 + 30 * DAY, to: t0 + 35 * DAY }] });
  });
  it('orders running focuses first, main skill first', () => {
    const a = newFocus('side thing', t0, { role: 'side' });
    const b = newFocus('knee cut', t0, { role: 'main' });
    const c = { ...newFocus('old', t0), detail: { focus: finishFocus(newFocus('old', t0).detail!.focus!, t0 + DAY) } };
    expect(focuses([c, a, b], t0 + 2 * DAY).map((v) => v.f.text)).toEqual(['knee cut', 'side thing', 'old']);
  });
  it('compares blocks', () => {
    const f = { ...newFocus('knee cut', t0).detail!.focus!, blocks: [{ from: t0, to: t0 + 14 * DAY }, { from: t0 + 30 * DAY }] };
    const events = [ev('roll', t0 + DAY, { min: 6, tried: ['knee-cut'] }), ev('roll', t0 + 31 * DAY, { min: 6, landed: ['knee-cut'] })];
    expect(blockProgress(events, f, [], t0 + 40 * DAY).map((b) => [b.attempts, b.landed])).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });
  it('migrates the v0.2 "Working on" line and its history', () => {
    const out = migrateFocus({ focus: 'knee cut', focusSince: t0, focusHistory: [{ text: 'old one', from: t0 - 20 * DAY, to: t0 }] }, [], t0 + DAY);
    expect(out.map((e) => [e.type, e.detail!.focus!.text, e.detail!.focus!.doneAt ?? null])).toEqual([
      ['focus', 'old one', t0],
      ['focus', 'knee cut', null],
    ]);
    expect(migrateFocus({ focus: 'x', focusSince: null, focusHistory: [] }, out, t0)).toEqual([]);
  });
});
