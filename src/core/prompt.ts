import { NOTE_FORMAT, NOTE_RULES } from './markdown';

/**
 * A prompt for turning messy notes (a voice memo transcript, a quick text) into matlog's class
 * note format with a chat assistant. It carries your own technique names, so the model uses names
 * matlog will recognise. The model only reformats: no inventing rounds, no advice.
 */
export function notePrompt(opts: { today: string; techniques?: string[]; partners?: string[] }): string {
  const lines = [
    'Turn my Brazilian jiu-jitsu training notes below into a matlog class note. Reply with only the Markdown, nothing before or after it.',
    '',
    'The format:',
    '',
    '```markdown',
    NOTE_FORMAT,
    '```',
    '',
    'Rules:',
    ...NOTE_RULES.map((r) => `- ${r}`),
    `- Today is ${opts.today}. If I say "today" or "tonight", use today's date; if I don't say when, leave out the Date line.`,
    '- Only include what I actually said. Leave out any section or line I said nothing about. Don’t invent rounds, partners, submissions, times or details.',
    '- Keep my own words for problems, ideas, observations and notes. Don’t add advice, scores or suggestions.',
    '- Use bullets for lists, with sub-bullets two spaces in.',
  ];
  if (opts.techniques?.length) lines.push(`- When a technique I mention matches one of these names, write it this way: ${opts.techniques.join('; ')}.`);
  if (opts.partners?.length) lines.push(`- Training partners I've logged before (spell them this way): ${opts.partners.join(', ')}.`);
  lines.push('', 'My notes:', '', '[paste your notes or transcript here]');
  return lines.join('\n');
}
