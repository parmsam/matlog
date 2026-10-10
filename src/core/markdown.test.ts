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
  it('reads moves landed and tried', () => {
    expect(parseRollLine('- Riley (blue): landed knee cut, scissor sweep; tried berimbolo; went for x pass')).toEqual({
      partner: 'Riley',
      belt: 'blue',
      landed: ['knee-cut', 'scissor-sweep'],
      tried: ['berimbolo', 'x-pass'],
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
    const list = parseMarkdown('## Open mat\n- Date: 2026-10-01 10:00\n\n## Drilling\n- Length: 45m\n\n## Details\n- Type: competition');
    // A Type: line under a heading that isn't a session or a section ("Details") applies to the session above it.
    expect(list.map((s) => s.type)).toEqual(['open-mat', 'comp']);
  });
  it('round-trips an export', () => {
    const now = at(2026, 10, 9, 20);
    const s = ev('class', at(2026, 10, 8, 18), { attire: 'gi', techniques: ['knee-cut', 'my own thing'], note: 'tough one' }, { endAt: at(2026, 10, 8, 19, 30) });
    const r = ev('roll', at(2026, 10, 8, 19), { partner: 'Sam', belt: 'purple', size: 'bigger', subsFor: ['armbar'], subsAgainst: ['triangle'], stuck: ['half-guard'], landed: ['knee-cut'], tried: ['my spin thing'] }, { endAt: at(2026, 10, 8, 19, 6) });
    const md = toMarkdown([s, r], '2026-10-08', '2026-10-08', now);
    const [p] = parseMarkdown(md);
    expect(p.type).toBe('class');
    expect(p.at).toBe(s.at);
    expect(p.detail).toEqual({ min: 90, attire: 'gi', techniques: ['knee-cut', 'my own thing'], note: 'tough one' });
    expect(p.rolls[0].detail).toEqual({ partner: 'Sam', belt: 'purple', size: 'bigger', min: 6, subsFor: ['armbar'], subsAgainst: ['triangle'], stuck: ['half-guard'], landed: ['knee-cut'], tried: ['my spin thing'] });
  });
});

describe('notesToEvents', () => {
  it('places an undated session ending now and rolls inside it', () => {
    const now = at(2026, 10, 9, 20);
    const events = notesToEvents([{ type: 'open-mat', at: null, detail: { min: 60 }, problems: [], rolls: [{ detail: { partner: 'A' } }, { detail: { partner: 'B', min: 8 } }] }], now);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: 'open-mat', at: now - 60 * MIN, detail: { min: 60 } });
    // Rounds without a length get the default round length (5 minutes), one after another.
    expect(events[1]).toMatchObject({ type: 'roll', at: now - 59 * MIN, detail: { partner: 'A', min: 5 } });
    expect(events[2]).toMatchObject({ type: 'roll', at: now - 53 * MIN, detail: { partner: 'B', min: 8 } });
  });
});

describe('notebook template and new fields', () => {
  it('reads the notebook template, check-ins, positional rounds and study', () => {
    const [s] = parseMarkdown(`## Class 2026-10-08 18:00
Main skill: knee cut
Problem I hit today: got flattened in half guard
Idea to try / solution: knee shield first
Enjoyed: 4
Followed my plan: partly

### Rolls
- Riley (blue, from side control bottom): landed elbow knee escape
`);
    expect(s.problems).toEqual([{ text: 'got flattened in half guard', idea: 'knee shield first', solved: false, source: 'internal' }]);
    expect(s.detail).toMatchObject({ enjoy: 4, plan: 'partly', note: 'Main skill: knee cut' });
    expect(s.rolls[0].detail).toMatchObject({ partner: 'Riley', start: 'side-control', role: 'bottom', landed: ['elbow-knee'] });
    const [st] = parseMarkdown('## Study\nSource: Lachlan Giles, half guard (https://example.com/v)\nLength: 10m');
    expect(st).toMatchObject({ type: 'study', detail: { source: 'Lachlan Giles, half guard', url: 'https://example.com/v', min: 10 } });
    const events = notesToEvents([s], at(2026, 10, 9, 20));
    const problem = events.find((e) => e.type === 'problem')!;
    expect(problem.detail!.problem).toMatchObject({ text: 'got flattened in half guard', idea: 'knee shield first', sessionId: events[0].id });
  });
  it('round-trips check-ins, problems and positional rounds', async () => {
    const { newProblem } = await import('./notebook');
    const now = at(2026, 10, 9, 20);
    const s = ev('class', at(2026, 10, 8, 18), { min: 60, enjoy: 5, plan: 'yes' });
    const r = ev('roll', at(2026, 10, 8, 18, 30), { min: 6, start: 'mount', role: 'bottom', partner: 'Jo' });
    const p = newProblem('stuck under mount', now, { idea: 'elbow knee', sessionId: s.id });
    const [back] = parseMarkdown(toMarkdown([s, r, p], '2026-10-08', '2026-10-08', now));
    expect(back.detail).toMatchObject({ enjoy: 5, plan: 'yes' });
    expect(back.problems[0]).toMatchObject({ text: 'stuck under mount', idea: 'elbow knee' });
    expect(back.rolls[0].detail).toMatchObject({ start: 'mount', role: 'bottom' });
  });
});

describe('injuries in notes', () => {
  it('reads an Injury line and exports it under its session', () => {
    const [s] = parseMarkdown('## Open mat 2026-10-08 10:00\nLength: 60m\nInjury: left knee (moderate): heel hook in round 3');
    expect(s.injuries).toEqual([{ area: 'knee', side: 'left', severity: 'moderate', how: 'heel hook in round 3' }]);
    const now = at(2026, 10, 9, 20);
    const events = notesToEvents([s], now);
    const inj = events.find((e) => e.type === 'injury')!;
    expect(inj.detail!.injury).toMatchObject({ area: 'knee', side: 'left', sessionId: events[0].id });
    expect(toMarkdown(events, '2026-10-08', '2026-10-08', now)).toContain('### Injuries\n- Left knee (moderate)\n  - How: heel hook in round 3');
  });
});

describe('note format v2', () => {
  it('reads the documented format', async () => {
    const { NOTE_FORMAT } = await import('./markdown');
    const [s] = parseMarkdown(NOTE_FORMAT);
    expect(s.type).toBe('class');
    expect(s.at).toBe(at(2026, 10, 8, 18));
    expect(s.detail).toMatchObject({ min: 90, attire: 'nogi', topic: 'Half guard passing', techniques: ['knee-cut', 'Shoulder post wrist grab arm drag'], note: 'Anything else, as free text.' });
    expect(s.techNotes).toEqual([{ technique: 'knee-cut', kind: 'detail', text: 'underhook the far arm first' }]);
    expect(s.rolls[0].detail).toEqual({ partner: 'Sam', belt: 'purple', size: 'bigger', start: 'half-guard', role: 'bottom', subsFor: ['armbar'], subsAgainst: ['triangle'], landed: ['knee-cut'], stuck: ['half-guard'] });
    expect(s.problems).toEqual([{ text: 'Got flattened in half guard', idea: 'knee shield first', solved: false, source: 'internal' }]);
    expect(s.injuries).toEqual([{ area: 'knee', side: 'left', severity: 'minor', how: 'heel hook', around: 'no leg locks' }]);
  });
  it('round-trips everything through export', async () => {
    const { newProblem } = await import('./notebook');
    const { newInjury } = await import('./injuries');
    const now = at(2026, 10, 9, 20);
    const s = ev('class', at(2026, 10, 8, 18), { min: 90, attire: 'nogi', topic: 'Half guard passing', techniques: ['knee-cut', 'My thing'], enjoy: 4, plan: 'partly', note: 'Line one\nLine two' });
    const r = ev('roll', at(2026, 10, 8, 18, 30), { min: 5, partner: 'Sam', belt: 'purple', start: 'half-guard', role: 'bottom', subsFor: ['armbar', 'kimura'], tried: ['berimbolo'], outcome: 'win', sessionId: s.id });
    const p = newProblem('flattened', now, { idea: 'frames', sessionId: s.id, solvedAt: now });
    const i = newInjury(at(2026, 10, 8, 19), { area: 'knee', side: 'left', severity: 'minor', how: 'heel hook', around: 'no leg locks', sessionId: s.id }, now);
    const md = toMarkdown([s, r, p, i], '2026-10-08', '2026-10-08', now);
    expect(md).not.toContain('·');
    const [back] = parseMarkdown(md);
    expect(back.at).toBe(s.at);
    expect(back.detail).toMatchObject({ min: 90, attire: 'nogi', topic: 'Half guard passing', techniques: ['knee-cut', 'My thing'], enjoy: 4, plan: 'partly', note: 'Line one\nLine two' });
    expect(back.rolls[0].detail).toEqual({ partner: 'Sam', belt: 'purple', min: 5, start: 'half-guard', role: 'bottom', subsFor: ['armbar', 'kimura'], tried: ['berimbolo'], outcome: 'win' });
    expect(back.problems).toEqual([{ text: 'flattened', idea: 'frames', solved: true, source: 'internal' }]);
    expect(back.injuries).toEqual([{ area: 'knee', side: 'left', severity: 'minor', how: 'heel hook', around: 'no leg locks' }]);
  });
  it('turns technique sub-bullets into notes on the technique', () => {
    const [s] = parseMarkdown('## Drilling\n### Techniques\n- Knee cut\n  - Key detail: knee to the mat\n  - Question: what about the knee shield?\n  - Source: half guard series (https://example.com/v)\n  - works better on smaller people');
    expect(s.techNotes).toEqual([
      { technique: 'knee-cut', kind: 'detail', text: 'knee to the mat' },
      { technique: 'knee-cut', kind: 'question', text: 'what about the knee shield?' },
      { technique: 'knee-cut', kind: 'source', text: 'half guard series', url: 'https://example.com/v' },
      { technique: 'knee-cut', kind: 'observation', text: 'works better on smaller people' },
    ]);
    const events = notesToEvents([s], at(2026, 10, 9));
    expect(events.filter((e) => e.type === 'technote')).toHaveLength(4);
  });
  it('still reads the older forms', () => {
    const [s] = parseMarkdown('## Class 2026-10-08 18:00\nTechniques: knee slice, armbar from guard\n\n### Rolls\n- Sam (purple): hit armbar; tapped to triangle');
    expect(s.detail.techniques).toEqual(['knee-cut', 'armbar-guard']);
    expect(s.rolls[0].detail).toMatchObject({ partner: 'Sam', subsFor: ['armbar'], subsAgainst: ['triangle'] });
  });
});
