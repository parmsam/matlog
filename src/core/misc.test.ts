import { describe, expect, it } from 'vitest';
import { parseBackup, toBackup } from './backup';
import { resolvePosition, resolveSub, resolveTechnique } from './catalog';
import { weekOf, daysBetween } from './days';
import { duration, timer } from './format';
import { DEFAULT_SETTINGS, sanitize } from './settings';
import { ev } from './testUtil';

describe('catalog', () => {
  it('resolves aliases and keeps unknown text', () => {
    expect(resolveSub('Rear Naked Choke')).toBe('rnc');
    expect(resolveSub("D’arce")).toBe('darce');
    expect(resolveSub('Baseball bat choke')).toBe('Baseball bat choke');
    expect(resolveTechnique('knee slice')).toBe('knee-cut');
    expect(resolveTechnique('DLR')).toBe('de-la-riva-sweep');
    expect(resolvePosition('half guard bottom')).toBe('half-guard');
    expect(resolvePosition('Side')).toBe('side-control');
    expect(resolvePosition('Truck')).toBe('Truck');
  });
});

describe('days', () => {
  it('weekOf honors the week start', () => {
    expect(weekOf('2026-10-09', 1)).toBe('2026-10-05');
    expect(weekOf('2026-10-09', 0)).toBe('2026-10-04');
    expect(weekOf('2026-10-05', 1)).toBe('2026-10-05');
  });
  it('daysBetween is DST-safe', () => expect(daysBetween('2026-10-30', '2026-11-03')).toBe(4));
});

describe('format', () => {
  it('formats durations and timers', () => {
    expect(duration(65 * 60_000)).toBe('1h 05m');
    expect(duration(42 * 60_000)).toBe('42m');
    expect(timer(65_000)).toBe('1:05');
    expect(timer(3_725_000)).toBe('1:02:05');
  });
});

describe('settings', () => {
  it('repairs bad values', () => {
    const s = sanitize({ startBelt: 'green' as never, startStripes: 9, theme: 'pink' as never, defaultMin: 1, patches: ['p10', 'nope' as never, 'p10'], focus: 5 as never });
    expect(s).toMatchObject({ startBelt: 'white', startStripes: 0, theme: 'auto', defaultMin: 60, patches: ['p10'], focus: '' });
    expect(sanitize({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({ companion: true as never }).companion).toBe('grappler');
    expect(sanitize({ companion: false as never }).companion).toBe('off');
    expect(sanitize({ companion: 'dragon' as never }).companion).toBe('grappler');
    expect(sanitize({ splash: undefined }).splash).toBe(true);
  });
});

describe('backup', () => {
  it('round-trips and skips bad entries', () => {
    const good = ev('class', 1);
    const text = JSON.stringify({ ...toBackup({ events: [good] }, 5), events: [good, { id: 'x', type: 'yoga' }] });
    expect(parseBackup(text)).toEqual({ events: [good], skipped: 1 });
  });
  it('rejects other files', () => {
    expect(() => parseBackup('nope')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"app":"tinylog","version":1}')).toThrow(/matlog export/);
    expect(() => parseBackup('{"app":"matlog","version":2}')).toThrow(/newer/);
  });
});
