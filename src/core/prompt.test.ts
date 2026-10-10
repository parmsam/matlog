import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTE_FORMAT, NOTE_RULES, parseMarkdown } from './markdown';
import { notePrompt } from './prompt';

describe('the note format, everywhere it is written down', () => {
  it('llms.txt and the Claude skill carry the same format and rules as the app', () => {
    for (const file of ['public/llms.txt', 'skills/matlog-note/SKILL.md']) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).toContain(NOTE_FORMAT);
      for (const r of NOTE_RULES) expect(text, file).toContain(r);
    }
  });
  it('the example in the format parses into everything it shows', () => {
    const [s] = parseMarkdown(NOTE_FORMAT);
    expect(s.rolls).toHaveLength(1);
    expect(s.problems).toHaveLength(1);
    expect(s.injuries).toHaveLength(1);
    expect(s.techNotes).toHaveLength(1);
  });
  it('the prompt carries the format, your names, and the no-inventing rule', () => {
    const p = notePrompt({ today: '2026-10-10', techniques: ['Knee cut pass', 'My spin thing'], partners: ['Riley'] });
    expect(p).toContain(NOTE_FORMAT);
    expect(p).toContain('Today is 2026-10-10');
    expect(p).toContain('My spin thing');
    expect(p).toContain('Riley');
    expect(p).toMatch(/Don’t invent rounds/);
  });
});
