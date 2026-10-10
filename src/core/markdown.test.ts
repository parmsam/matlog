import { describe, expect, it } from 'vitest';
import { notesToEvents, parseDate, parseDuration, parseMarkdown, parseRollLine, toMarkdown } from './markdown';
import { at, ev, MIN } from './testUtil';

describe('parseDuration', () => {
  it.each([
    ['90m', 90],
    ['90 min', 90],
    ['90', 90],
    ['1h30', 90],
    ['1h 30m', 90],
    ['1.5h', 90],
    ['2 hours', 120],
    ['1:15', 75],
  ])('%s → %i', (s, m) => expect(parseDuration(s)).toBe(m));
  it('rejects words', () => expect(parseDuration('long')).toBeNull());
});

describe('parseDate', () => {
  it('reads dates and times', () => {
    expect(parseDate('2026-10-08 18:00')).toBe(at(2026, 10, 8, 18));
    expect(parseDate('Class 2026-10-08 6:30pm')).toBe(at(2026, 10, 8, 18, 30));
    expect(parseDate('2026-10-08')).toBe(at(2026, 10, 8, 12));
    expect(parseDate('yesterday')).toBeNull();
  });
});

describe('parseRollLine', () => {
  it('reads partner, tags and clauses', () => {
    expect(parseRollLine('- Sam (purple, bigger, 6m): hit armbar; tapped to triangle; stuck in half guard')).toEqual({
      partner: 'Sam',
      belt: 'purple',
      size: 'bigger',
      min: 6,
      subsFor: ['armbar'],
      subsAgainst: ['triangle'],
      stuck: ['half-guard'],
    });
  });
  it('handles vs, belts named "blue belt", several subs and free notes', () => {
    expect(parseRollLine('* vs Alex (blue belt, won): got rnc and kimura; felt slow')).toEqual({
      partner: 'Alex',
      belt: 'blue',
      outcome: 'win',
      subsFor: ['rnc', 'kimura'],
      note: 'felt slow',
    });
  });
  it('a bare clause list is a round without a partner', () => {
    expect(parseRollLine('- tapped to heel hook')).toEqual({ subsAgainst: ['heel-hook'] });
  });
});

describe('parseMarkdown', () => {
  it('reads a typical class note', () => {
    const [s, ...rest] = parseMarkdown(`# No-gi class 2026-10-08 18:00
Length: 90 min
Gi: no-gi
Techniques: knee slice, armbar from guard, my funky sweep

Good energy tonight.

## Rolls
- Sam (purple, bigger): hit armbar; tapped to triangle; stuck in half guard
- Jo (white, smaller): hit rnc
`);
    expect(rest).toEqual([]);
    expect(s.type).toBe('class');
    expect(s.at).toBe(at(2026, 10, 8, 18));
    expect(s.detail).toEqual({ min: 90, attire: 'nogi', techniques: ['knee-cut', 'armbar-guard', 'my funky sweep'], note: 'Good energy tonight.' });
    expect(s.rolls.map((r) => r.detail.partner)).toEqual(['Sam', 'Jo']);
  });
  it('treats plain text as one class', () => {
    const [s] = parseMarkdown('Worked on guard passing today.\nRolled 5 rounds.');
    expect(s).toMatchObject({ type: 'class', at: null, detail: { note: 'Worked on guard passing today.\nRolled 5 rounds.' } });
  });
  it('reads several sessions and the type key', () => {
    const list = parseMarkdown('## Open mat\n- Date: 2026-10-01 10:00\n\n## Drilling\n- Length: 45m\n\n## Notes\n- Type: competition');
    // A Type: line under a heading that isn't a session ("Notes") applies to the session above it.
    expect(list.map((s) => s.type)).toEqual(['open-mat', 'comp']);
  });
  it('round-trips an export', () => {
    const now = at(2026, 10, 9, 20);
    const s = ev('class', at(2026, 10, 8, 18), { attire: 'gi', techniques: ['knee-cut', 'my own thing'], note: 'tough one' }, { endAt: at(2026, 10, 8, 19, 30) });
    const r = ev('roll', at(2026, 10, 8, 19), { partner: 'Sam', belt: 'purple', size: 'bigger', subsFor: ['armbar'], subsAgainst: ['triangle'], stuck: ['half-guard'] }, { endAt: at(2026, 10, 8, 19, 6) });
    const md = toMarkdown([s, r], '2026-10-08', '2026-10-08', now);
    const [p] = parseMarkdown(md);
    expect(p.type).toBe('class');
    expect(p.at).toBe(s.at);
    expect(p.detail).toEqual({ min: 90, attire: 'gi', techniques: ['knee-cut', 'my own thing'], note: 'tough one' });
    expect(p.rolls[0].detail).toEqual({ partner: 'Sam', belt: 'purple', size: 'bigger', min: 6, subsFor: ['armbar'], subsAgainst: ['triangle'], stuck: ['half-guard'] });
  });
});

describe('notesToEvents', () => {
  it('places an undated session ending now and rolls inside it', () => {
    const now = at(2026, 10, 9, 20);
    const events = notesToEvents([{ type: 'open-mat', at: null, detail: { min: 60 }, rolls: [{ detail: { partner: 'A' } }, { detail: { partner: 'B', min: 8 } }] }], now);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: 'open-mat', at: now - 60 * MIN, detail: { min: 60 } });
    expect(events[1]).toMatchObject({ type: 'roll', at: now - 59 * MIN, detail: { partner: 'A', min: 6 } });
    expect(events[2]).toMatchObject({ type: 'roll', at: now - 52 * MIN, detail: { partner: 'B', min: 8 } });
  });
});
