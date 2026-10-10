import { describe, expect, it } from 'vitest';
import { focusProgress, matchFocus, setFocus } from './focus';
import { at, ev } from './testUtil';

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
    ev('roll', at(2026, 10, 3, 13), { landed: ['knee-cut'], stuck: ['half-guard'], subsAgainst: ['triangle'] }),
    ev('roll', at(2026, 10, 3, 14), { tried: ['knee-cut'], stuck: ['half-guard'] }),
  ];
  const now = at(2026, 10, 9);
  it('counts what happened since the focus was set', () => {
    expect(focusProgress(events, { kind: 'technique', id: 'knee-cut' }, since, now)).toMatchObject({ sessions: 2, drilled: 1, attempts: 2, landed: 1 });
    expect(focusProgress(events, { kind: 'position', id: 'half-guard' }, since, now)).toMatchObject({ stuck: 2 });
    expect(focusProgress(events, { kind: 'sub', id: 'triangle' }, since, now)).toMatchObject({ tapped: 1, hit: 0 });
    expect(focusProgress(events, null, since, now)).toMatchObject({ sessions: 2, drilled: 0 });
    // A round that started just before the focus was set but ended after it counts.
    const r = ev('roll', since - 3 * 60_000, { min: 6, landed: ['knee-cut'] });
    expect(focusProgress([r], { kind: 'technique', id: 'knee-cut' }, since, now)).toMatchObject({ landed: 1 });
  });
});

describe('setFocus', () => {
  it('files the old focus in history and drops duplicates of the new one', () => {
    const s0 = { focus: '', focusSince: null, focusHistory: [] };
    const s1 = setFocus(s0, 'knee cut', 100);
    expect(s1).toEqual({ focus: 'knee cut', focusSince: 100, focusHistory: [] });
    const s2 = setFocus(s1, 'half guard escapes', 200);
    expect(s2.focusHistory).toEqual([{ text: 'knee cut', from: 100, to: 200 }]);
    const s3 = setFocus(s2, 'Knee cut', 300);
    expect(s3.focus).toBe('Knee cut');
    expect(s3.focusHistory.map((h) => h.text)).toEqual(['half guard escapes']);
    expect(setFocus(s3, '', 400)).toMatchObject({ focus: '', focusSince: null });
    expect(setFocus(s3, 'Knee cut', 500).focusSince).toBe(300);
  });
});
