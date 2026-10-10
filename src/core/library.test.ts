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

describe('editing built-ins and variations', () => {
  it('overrides a built-in by id, hides it from suggestions, and links variations', async () => {
    const { libraryFromLog } = await import('./library');
    const cat = await import('./catalog');
    const edit = defineTechnique({ id: 'take-back-guard', label: 'Arm drag (seated)', kind: 'transition', from: 'open-guard', to: 'back', aka: ['seated arm drag'] }, 1);
    const hide = defineTechnique({ id: 'osoto-gari', label: 'Osoto gari', kind: 'takedown', from: 'standing', to: 'side-control', hidden: true }, 2);
    const mine = defineTechnique({ id: '', label: 'Shoulder post wrist grab arm drag', kind: 'transition', from: 'open-guard', to: 'back', parent: 'take-back-guard' }, 3);
    const lib = libraryFromLog([edit, hide, mine]);
    expect(lib.custom.map((t) => t.id)).toEqual(['Shoulder post wrist grab arm drag']);
    expect([...lib.overrides.keys()]).toEqual(['take-back-guard', 'osoto-gari']);
    cat.setCustomTechniques(lib.custom, lib.overrides);
    try {
      expect(cat.techniqueLabel('take-back-guard')).toBe('Arm drag (seated)');
      expect(cat.resolveTechnique('seated arm drag')).toBe('take-back-guard');
      expect(cat.visibleTechniques().some((t) => t.id === 'osoto-gari')).toBe(false);
      // Hidden is only about suggestions: typing it still works.
      expect(cat.resolveTechnique('osoto gari')).toBe('osoto-gari');
      expect(cat.variationsOf('take-back-guard').map((t) => t.id)).toEqual(['Shoulder post wrist grab arm drag']);
    } finally {
      cat.setCustomTechniques([]);
    }
  });
  it('refuses a variation of itself, and only hides built-ins', () => {
    expect(() => defineTechnique({ id: 'x', label: 'X', kind: 'sweep', from: 'open-guard', to: 'mount', parent: 'x' }, 1)).toThrow(/itself/);
    expect(defineTechnique({ id: '', label: 'Mine', kind: 'sweep', from: 'open-guard', to: 'mount', hidden: true }, 1).detail!.technique!.hidden).toBeUndefined();
  });
});
