/**
 * Loose matching for the command palette: every word you type must appear in the text, as a
 * word start (best), anywhere (good) or as letters in order ("kcp" for "knee cut pass"). Higher is
 * better; null means no match. An empty query matches everything with 0.
 */
export function matchScore(query: string, text: string): number | null {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const t = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    const at = t.indexOf(w);
    if (at === 0) score += 4;
    else if (at > 0) score += /[\s\-/(·:]/.test(t[at - 1]) ? 3 : 2;
    else if (inOrder(w, t)) score += 1;
    else return null;
  }
  return score;
}

function inOrder(w: string, t: string): boolean {
  let i = 0;
  for (const c of t) if (c === w[i]) i++;
  return i === w.length;
}

/** The items that match, best first; ties keep their order. */
export function rankMatches<T>(query: string, items: T[], text: (item: T) => string): T[] {
  return items
    .map((item, i) => ({ item, i, s: matchScore(query, text(item)) }))
    .filter((x): x is { item: T; i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
