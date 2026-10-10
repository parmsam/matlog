import { describe, expect, it } from 'vitest';
import { matchScore, rankMatches } from './fuzzy';

describe('palette matching', () => {
  it('needs every word, in any order', () => {
    expect(matchScore('open start', 'Start open mat')).not.toBeNull();
    expect(matchScore('open swim', 'Start open mat')).toBeNull();
  });
  it('takes letters in order', () => {
    expect(matchScore('kcp', 'Knee cut pass')).not.toBeNull();
    expect(matchScore('pck', 'Knee cut pass')).toBeNull();
  });
  it('an empty query matches everything', () => {
    expect(matchScore('  ', 'Settings')).toBe(0);
  });
  it('ranks word starts above the middle of a word, and keeps ties in order', () => {
    const items = ['Paste a class note', 'Start class', 'Log a finished class', 'Subclass'];
    expect(rankMatches('class', items, (s) => s)).toEqual(['Paste a class note', 'Start class', 'Log a finished class', 'Subclass']);
    expect(rankMatches('set', ['Reset', 'Settings'], (s) => s)).toEqual(['Settings', 'Reset']);
  });
});
