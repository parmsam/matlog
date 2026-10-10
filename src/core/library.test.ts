import { describe, expect, it } from 'vitest';
import { customFromLog, defineTechnique, LibraryError, mentions, newTechNote, techNoteCounts, techNotes } from './library';
import { newProblem } from './notebook';
import { at, ev } from './testUtil';

describe('your own techniques', () => {
  it('defines one, keeps the latest version, and refuses built-in names', () => {
    const a = defineTechnique({ id: '', label: 'Kiss of the dragon', kind: 'transition', from: 'open-guard', to: 'back' }, 1);
    const b = { ...defineTechnique({ id: 'Kiss of the dragon', label: 'Kiss of the dragon', kind: 'transition', from: 'leg-entanglement', to: 'back' }, 2), updatedAt: 5 };
    expect(customFromLog([a, b])).toEqual([{ id: 'Kiss of the dragon', label: 'Kiss of the dragon', kind: 'transition', from: 'leg-entanglement', to: 'back', aka: undefined }]);
    expect(() => defineTechnique({ id: '', label: 'Armbar from guard', kind: 'submission', from: 'closed-guard', to: 'submission' }, 1)).toThrow(LibraryError);
    expect(() => defineTechnique({ id: '', label: 'x', kind: 'sweep', from: 'mount', to: 'mount' }, 1)).toThrow(/same position/);
  });
});

describe('technique notes', () => {
  const kd = newTechNote('knee-cut', 'Underhook the far arm before cutting', at(2026, 10, 1), { kind: 'detail' });
  const obs = newTechNote('knee-cut', 'Bigger partners stop it with a knee shield', at(2026, 10, 5));
  const src = newTechNote('knee-cut', 'Lachlan, half guard passing', at(2026, 10, 3), { kind: 'source', url: 'https://example.com/v?t=90' });
  it('keeps key details first, then newest first, and drops non-http links', () => {
    expect(techNotes([obs, src, kd], 'knee-cut').map((e) => e.detail!.techNote!.kind)).toEqual(['detail', 'observation', 'source']);
    expect(newTechNote('x', 'y', 1, { url: 'javascript:alert(1)' }).detail!.techNote!.url).toBeUndefined();
    expect(techNoteCounts([obs, src, kd, { ...obs, id: 'gone', deleted: true }]).get('knee-cut')).toBe(3);
  });
  it('gathers session notes and problems that mention it', () => {
    const s1 = ev('class', at(2026, 10, 2), { min: 60, techniques: ['knee-cut'], note: 'Coach: knee to the mat first' });
    const s2 = ev('class', at(2026, 10, 3), { min: 60, techniques: ['knee-cut'] });
    const p = newProblem('my knee cut gets stuffed by a knee shield', at(2026, 10, 4));
    const m = mentions([s1, s2, p], 'knee-cut');
    expect(m.sessions.map((e) => e.id)).toEqual([s1.id]);
    expect(m.problems.map((e) => e.id)).toEqual([p.id]);
  });
});
