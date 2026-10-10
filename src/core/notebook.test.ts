import { describe, expect, it } from 'vitest';
import { newProblem, problems, processStats, reflectionDue } from './notebook';
import { ev } from './testUtil';

const MIN = 60_000;
const now = 1_000 * 60 * MIN;
const s = { reflectAfter: 120 as const, reflectSkipped: [] as string[] };

describe('reflectionDue', () => {
  it('asks about the latest finished session, a while after it ends, once', () => {
    const a = ev('class', now - 5 * 60 * MIN, { min: 60 }); // ended 4h ago
    const b = ev('open-mat', now - 3 * 60 * MIN, { min: 60 }); // ended 2h ago
    const fresh = ev('drilling', now - 70 * MIN, { min: 60 }); // ended 10m ago
    expect(reflectionDue([a, b, fresh], s, now)?.id).toBe(b.id);
    expect(reflectionDue([a, { ...b, detail: { ...b.detail, reflectedAt: now } }], s, now)?.id).toBe(a.id);
    expect(reflectionDue([a, b], { ...s, reflectSkipped: [a.id, b.id] }, now)).toBeNull();
    expect(reflectionDue([a, b], { ...s, reflectAfter: -1 }, now)).toBeNull();
    expect(reflectionDue([fresh], { ...s, reflectAfter: 0 }, now)?.id).toBe(fresh.id);
  });
  it('skips running sessions, rounds, and anything older than 36 hours', () => {
    expect(reflectionDue([ev('class', now - 5 * 60 * MIN)], s, now)).toBeNull();
    expect(reflectionDue([ev('roll', now - 5 * 60 * MIN, { min: 6 })], s, now)).toBeNull();
    expect(reflectionDue([ev('class', now - 40 * 60 * MIN, { min: 60 })], s, now)).toBeNull();
  });
});

describe('problems and process', () => {
  it('splits open and solved, and summarises check-ins', () => {
    const p1 = newProblem('  swept from half guard  ', 10, { source: 'internal', idea: 'knee shield first' });
    expect(p1.detail!.problem).toEqual({ text: 'swept from half guard', source: 'internal', idea: 'knee shield first' });
    const p2 = newProblem('grip breaks on the back', 20, { solvedAt: 30, tinkered: true });
    expect(problems([p1, p2])).toEqual({ open: [p1], solved: [p2] });
    const st = processStats([
      p1,
      p2,
      ev('class', new Date(2026, 8, 3).getTime(), { min: 60, enjoy: 4, plan: 'yes', reflectedAt: 1 }),
      ev('class', new Date(2026, 9, 3).getTime(), { min: 60, enjoy: 2, plan: 'partly' }),
      ev('class', new Date(2026, 9, 5).getTime(), { min: 60 }),
    ]);
    expect(st).toMatchObject({ sessions: 3, reflected: 1, rated: 2, enjoyAvg: 3, plan: { yes: 1, partly: 1, no: 0 }, problemsOpen: 1, problemsSolved: 1, tinkered: 1 });
    expect(st.enjoyByMonth).toEqual([
      { month: '2026-09', avg: 4, n: 1 },
      { month: '2026-10', avg: 2, n: 1 },
    ]);
  });
});
