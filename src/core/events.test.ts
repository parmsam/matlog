import { describe, expect, it } from 'vitest';
import { cleanDetail, mergeData, spanEnd } from './events';
import { ev, MIN } from './testUtil';

describe('events', () => {
  it('cleans empty fields and dedupes lists', () => {
    expect(cleanDetail({ note: '  ', techniques: ['a', ' a ', ''], partner: ' Sam ', min: NaN })).toEqual({ techniques: ['a'], partner: 'Sam' });
    expect(cleanDetail({ subsFor: [] })).toBeUndefined();
  });
  it('spanEnd: finished, by length, running, promotion', () => {
    expect(spanEnd(ev('class', 0, undefined, { endAt: 5 }), 100)).toBe(5);
    expect(spanEnd(ev('class', 0, { min: 60 }), 100)).toBe(60 * MIN);
    expect(spanEnd(ev('roll', 0), 100)).toBe(100);
    expect(spanEnd(ev('promotion', 7, { belt: 'blue' }), 100)).toBe(7);
  });
  it('merges by id, newest wins, idempotent', () => {
    const a = ev('class', 1);
    const b = { ...a, updatedAt: a.updatedAt + 5, detail: { note: 'x' } };
    const c = ev('roll', 2);
    const m = mergeData({ events: [a] }, { events: [b, c] });
    expect(m).toMatchObject({ added: 1, updated: 1 });
    expect(m.events.find((e) => e.id === a.id)?.detail?.note).toBe('x');
    expect(mergeData(m, { events: [b, c] })).toMatchObject({ added: 0, updated: 0 });
  });
});
