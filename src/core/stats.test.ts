import { describe, expect, it } from 'vitest';
import { currentRank, matMinutes, nextPatch, patterns, positionGraph, rankTimeline, rollsIn, rollStats, techniqueUses, unlockedPatches, weekHeatmap, weekRecap } from './stats';
import { at, ev, MIN } from './testUtil';

const now = at(2026, 10, 9, 20);

describe('matMinutes', () => {
  it('counts sessions (finished, logged with a length, and running), not rolls or deleted ones', () => {
    const events = [
      ev('class', at(2026, 10, 1, 18), undefined, { endAt: at(2026, 10, 1, 19, 30) }),
      ev('open-mat', at(2026, 10, 2, 10), { min: 60 }),
      ev('roll', at(2026, 10, 2, 10, 5), { min: 6 }),
      ev('drilling', now - 20 * MIN),
      ev('comp', at(2026, 10, 3, 9), { min: 100 }, { deleted: true }),
    ];
    expect(matMinutes(events, now)).toBe(90 + 60 + 20);
  });
});

describe('rollsIn', () => {
  it('finds rounds during a session by time', () => {
    const s = ev('class', at(2026, 10, 1, 18), { min: 60 });
    const inside = ev('roll', at(2026, 10, 1, 18, 40), { min: 6 });
    const outside = ev('roll', at(2026, 10, 1, 20), { min: 6 });
    expect(rollsIn(s, [s, inside, outside], now).map((r) => r.id)).toEqual([inside.id]);
  });
});

describe('weekHeatmap', () => {
  it('lays out weeks × days with minutes and levels', () => {
    const events = [ev('class', at(2026, 10, 5, 18), { min: 60 }), ev('class', at(2026, 10, 7, 18), { min: 120 }), ev('open-mat', at(2026, 9, 28, 10), { min: 30 })];
    const h = weekHeatmap(events, '2026-10-09', 2, 1, now);
    expect(h.weeks).toEqual(['2026-09-28', '2026-10-05']);
    expect(h.cells[1][0]).toMatchObject({ day: '2026-10-05', minutes: 60, sessions: 1 });
    expect(h.cells[1][2].minutes).toBe(120);
    expect(h.cells[1][2].level).toBeGreaterThan(h.cells[1][0].level);
    expect(h.cells[1][6].future).toBe(true);
    expect(h.weekMinutes).toEqual([30, 180]);
  });
  it('starts weeks on Sunday when asked, across the DST change', () => {
    const h = weekHeatmap([], '2026-11-03', 2, 0, now);
    expect(h.weeks).toEqual(['2026-10-25', '2026-11-01']);
    expect(h.cells[1].map((c) => c.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  });
});

describe('rollStats', () => {
  const events = [
    ev('roll', 1, { partner: 'Sam', belt: 'purple', subsFor: ['armbar'], subsAgainst: ['triangle', 'triangle'], stuck: ['half-guard'] }),
    ev('roll', 2, { partner: 'Sam', belt: 'purple', subsAgainst: ['triangle'], stuck: ['half-guard', 'mount'] }),
    ev('roll', 3, { partner: 'Jo', belt: 'white', subsFor: ['rnc', 'armbar'] }),
  ];
  it('tallies subs, ratio, stuck positions, partners and belts', () => {
    const s = rollStats(events);
    expect(s).toMatchObject({ rolls: 3, subsFor: 3, subsAgainst: 3, ratio: 1, stuckRolls: 2 });
    expect(s.forBy[0]).toEqual({ id: 'armbar', label: 'Armbar', n: 2 });
    // A sub listed twice in one round counts once per round.
    expect(s.againstBy[0]).toEqual({ id: 'triangle', label: 'Triangle', n: 2 });
    expect(s.stuck[0]).toEqual({ id: 'half-guard', label: 'Half guard', n: 2 });
    expect(s.partners[0]).toEqual({ id: 'Sam', label: 'Sam', n: 2 });
    expect(s.byBelt).toEqual([
      { belt: 'white', rolls: 1, subsFor: 2, subsAgainst: 0 },
      { belt: 'purple', rolls: 2, subsFor: 1, subsAgainst: 3 },
    ]);
  });
  it('has no ratio without taps', () => {
    expect(rollStats([ev('roll', 1, { subsFor: ['rnc'] })]).ratio).toBeNull();
  });
});

describe('techniques', () => {
  const events = [ev('class', at(2026, 9, 1), { techniques: ['scissor-sweep', 'my thing'] }), ev('class', at(2026, 10, 1), { techniques: ['scissor-sweep', 'hip-bump'] })];
  it('lists last drilled, newest first', () => {
    const u = techniqueUses(events);
    expect(u.map((x) => [x.id, x.sessions])).toEqual([
      ['scissor-sweep', 2],
      ['hip-bump', 1],
      ['my thing', 1],
    ]);
    expect(u[0].lastAt).toBe(at(2026, 10, 1));
  });
  it('builds the position graph from catalog techniques only', () => {
    const g = positionGraph(events);
    expect(g.edges).toEqual([{ from: 'closed-guard', to: 'mount', n: 3, techniques: ['Scissor sweep', 'Hip bump sweep'] }]);
    expect(g.nodes.get('closed-guard')).toBe(3);
  });
});

describe('rank', () => {
  const prefs = { startBelt: 'white' as const, startStripes: 2 };
  it('starts from settings and follows promotions, with mat hours between', () => {
    const events = [ev('class', at(2026, 1, 5), { min: 600 }), ev('promotion', at(2026, 3, 1), { belt: 'white', stripes: 3 }), ev('class', at(2026, 4, 1), { min: 120 }), ev('promotion', at(2026, 9, 1), { belt: 'blue', stripes: 0 })];
    const t = rankTimeline(events, prefs, now);
    expect(t.map((s) => [s.belt, s.stripes, s.minutesBefore])).toEqual([
      ['white', 2, 0],
      ['white', 3, 600],
      ['blue', 0, 120],
    ]);
    expect(currentRank(events, prefs, now)).toEqual({ belt: 'blue', stripes: 0 });
  });
});

describe('patches', () => {
  it('unlocks by mat hours', () => {
    expect(unlockedPatches(9 * 60)).toEqual([]);
    expect(unlockedPatches(30 * 60).map((p) => p.id)).toEqual(['p10', 'p25']);
    expect(nextPatch(30 * 60)?.id).toBe('p50');
    expect(nextPatch(2000 * 60)).toBeUndefined();
  });
});

describe('weekRecap', () => {
  it('sums the last 7 days', () => {
    const events = [ev('class', at(2026, 10, 3, 18), { min: 60, techniques: ['knee-cut'] }), ev('class', at(2026, 10, 2, 18), { min: 60 }), ev('roll', at(2026, 10, 3, 18, 30), { subsFor: ['rnc'] })];
    expect(weekRecap(events, '2026-10-09', now)).toEqual({ from: '2026-10-03', to: '2026-10-09', sessions: 1, minutes: 60, rolls: 1, subsFor: 1, subsAgainst: 0, techniques: ['Knee cut pass'] });
  });
});

describe('patterns', () => {
  it('stays quiet without enough data', () => {
    expect(patterns([ev('roll', 1, { stuck: ['mount'] })], now)).toEqual([]);
  });
  it('describes, with what it is based on, and never advises', () => {
    const rolls = Array.from({ length: 6 }, (_, i) => ev('roll', at(2026, 10, 1 + i), { partner: 'Sam', stuck: i < 4 ? ['half-guard'] : ['mount'], subsAgainst: ['triangle'] }));
    const sessions = Array.from({ length: 4 }, (_, i) => ev('class', at(2026, 9, 1 + 7 * i, 18), { min: 60, attire: 'gi' }));
    const p = patterns([...rolls, ...sessions], now);
    const stuck = p.find((x) => x.id === 'stuck')!;
    expect(stuck.text).toBe('You noted getting stuck in half guard most: 4 rolls.');
    expect(stuck.basis).toBe('6 rolls with a stuck position');
    expect(p.find((x) => x.id === 'sub-against')?.text).toContain('triangle');
    expect(p.find((x) => x.id === 'attire')?.text).toBe('100% gi, 0% no-gi.');
    for (const x of p) expect(x.text).not.toMatch(/\b(should|try|work on|improve|need)\b/i);
  });
});
