/** Local day keys (YYYY-MM-DD) and weeks. Built from calendar fields, so DST days are 23 or 25 hours. */

export function keyOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const dayKey = (ts: number) => keyOf(new Date(ts));

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m - 1, d];
}

export function dayStart(key: string): number {
  const [y, m, d] = parts(key);
  return new Date(y, m, d).getTime();
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = parts(key);
  return keyOf(new Date(y, m, d + n));
}

/** Noon-anchored Date for display. */
export function dayDate(key: string): Date {
  const [y, m, d] = parts(key);
  return new Date(y, m, d, 12);
}

/** The first day of the week containing `key`. */
export function weekOf(key: string, weekStart: 0 | 1 = 1): string {
  const dow = dayDate(key).getDay();
  return addDays(key, -((dow - weekStart + 7) % 7));
}

/** Whole days from a to b (b − a), DST-safe. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 86_400_000);
}
