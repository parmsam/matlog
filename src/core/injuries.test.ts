import { describe, expect, it } from 'vitest';
import { activeAt, injuries, injuryDays, injuryStats, injuryTitle, newInjury, parseArea } from './injuries';
import { at, ev } from './testUtil';

describe('parseArea', () => {
  it('reads area and side from what people type', () => {
    expect(parseArea('left knee')).toEqual({ area: 'knee', side: 'left' });
    expect(parseArea('Right shoulder')).toEqual({ area: 'shoulder', side: 'right' });
    expect(parseArea('low back')).toEqual({ area: 'lower-back' });
    expect(parseArea('sore R thumb')).toEqual({ area: 'fingers', side: 'right' });
    expect(parseArea('MCL')).toEqual({ area: 'knee' });
    expect(parseArea('pinky toe left')).toEqual({ area: 'foot', side: 'left' });
    expect(parseArea('Achilles')).toEqual({ area: 'Achilles' });
  });
  it('titles', () => {
    expect(injuryTitle({ area: 'knee', side: 'left' })).toBe('Left knee');
    expect(injuryTitle({ area: 'lower-back' })).toBe('Lower back');
    expect(injuryTitle({ area: 'ankle', side: 'both' })).toBe('Ankle (both)');
  });
});

describe('injuries', () => {
  const now = at(2026, 10, 10);
  const knee = newInjury(at(2026, 9, 20), { area: 'knee', side: 'left', severity: 'moderate', how: '  heel hook  ', around: 'no leg locks' }, now);
  const finger = newInjury(at(2026, 6, 1), { area: 'fingers', healedAt: at(2026, 6, 15) }, now);
  it('builds clean details', () => {
    expect(knee.detail!.injury).toEqual({ area: 'knee', side: 'left', severity: 'moderate', how: 'heel hook', around: 'no leg locks' });
  });
  it('splits active and healed, and counts days', () => {
    expect(injuries([finger, knee], now)).toEqual({ active: [knee], healed: [finger] });
    expect(injuryDays(knee, now)).toBe(20);
    expect(injuryDays(finger, now)).toBe(14);
    expect(activeAt([knee, finger], at(2026, 6, 10)).map((e) => e.id)).toEqual([finger.id]);
  });
  it('summarises without judging', () => {
    const s = injuryStats(
      [knee, finger, ev('class', at(2026, 9, 25), { min: 60 }), ev('class', at(2026, 8, 1), { min: 60 }), ev('class', at(2026, 6, 5), { min: 60 })],
      now,
    );
    expect(s).toMatchObject({ total: 2, active: 1, sessionsWhileInjured: 2, medianDays: 14 });
    // Jun 1–15 (15 days) + Sep 20–Oct 10 (21 days).
    expect(s.daysThisYear).toBe(36);
    expect(s.byArea.map((a) => a.label)).toEqual(['Hand / fingers', 'Knee']);
  });
});
