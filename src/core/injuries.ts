import { dayKey, daysBetween } from './days';
import { createEvent, isSession } from './events';
import type { InjuryDetail, LogEvent } from './types';

/**
 * The injury log: what got hurt, how, what you're doing differently, and when it healed. It
 * describes what you logged and is never medical advice: no diagnoses, no return-to-training
 * timelines, no "you should rest". Injuries are events, so they back up and merge like the rest.
 */

const DAY = 86_400_000;

export interface Area {
  id: string;
  label: string;
  /** Has a left and a right. */
  sided: boolean;
}

export const AREAS: Area[] = [
  { id: 'head', label: 'Head / face', sided: false },
  { id: 'ear', label: 'Ear', sided: true },
  { id: 'neck', label: 'Neck', sided: false },
  { id: 'shoulder', label: 'Shoulder', sided: true },
  { id: 'elbow', label: 'Elbow', sided: true },
  { id: 'wrist', label: 'Wrist', sided: true },
  { id: 'fingers', label: 'Hand / fingers', sided: true },
  { id: 'ribs', label: 'Ribs', sided: true },
  { id: 'upper-back', label: 'Upper back', sided: false },
  { id: 'lower-back', label: 'Lower back', sided: false },
  { id: 'hip', label: 'Hip / groin', sided: true },
  { id: 'knee', label: 'Knee', sided: true },
  { id: 'ankle', label: 'Ankle', sided: true },
  { id: 'foot', label: 'Foot / toes', sided: true },
  { id: 'skin', label: 'Skin (mat burn, infection)', sided: false },
];

const ALIASES: Record<string, string> = {
  face: 'head',
  nose: 'head',
  eye: 'head',
  jaw: 'head',
  cauliflower: 'ear',
  ears: 'ear',
  shoulders: 'shoulder',
  elbows: 'elbow',
  wrists: 'wrist',
  hand: 'fingers',
  finger: 'fingers',
  thumb: 'fingers',
  rib: 'ribs',
  back: 'lower-back',
  'low back': 'lower-back',
  hips: 'hip',
  groin: 'hip',
  knees: 'knee',
  mcl: 'knee',
  acl: 'knee',
  ankles: 'ankle',
  toe: 'foot',
  toes: 'foot',
  feet: 'foot',
  ringworm: 'skin',
  staph: 'skin',
  'mat burn': 'skin',
};

export const areaLabel = (id: string) => AREAS.find((a) => a.id === id)?.label ?? id;

/** "left knee", "Right shoulder", "low back" → area and side; unknown areas are kept as typed. */
export function parseArea(text: string): { area: string; side?: 'left' | 'right' | 'both' } {
  let t = text.toLowerCase().replace(/[^a-z\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
  let side: 'left' | 'right' | 'both' | undefined;
  const m = /\b(left|right|both|l|r)\b/.exec(t);
  if (m) {
    side = m[1] === 'l' ? 'left' : m[1] === 'r' ? 'right' : (m[1] as 'left' | 'right' | 'both');
    t = t.replace(m[0], '').replace(/\s+/g, ' ').trim();
  }
  const hit = AREAS.find((a) => a.id === t || a.label.toLowerCase() === t || a.label.toLowerCase().split(' / ').includes(t)) ?? AREAS.find((a) => a.id === ALIASES[t]);
  if (!hit) {
    // Longest known word inside ("sore left knee" → knee).
    const word = Object.keys(ALIASES)
      .concat(AREAS.map((a) => a.id))
      .sort((a, b) => b.length - a.length)
      .find((w) => new RegExp(`\\b${w.replace('-', '[- ]')}\\b`).test(t));
    if (word) return { area: ALIASES[word] ?? word, ...(side ? { side } : {}) };
  }
  return { area: hit?.id ?? text.trim().slice(0, 60), ...(side ? { side } : {}) };
}

/** "Left knee", "Lower back". */
export function injuryTitle(d: Pick<InjuryDetail, 'area' | 'side'>): string {
  const area = areaLabel(d.area);
  if (!d.side) return area;
  if (d.side === 'both') return `${area} (both)`;
  return `${d.side[0].toUpperCase()}${d.side.slice(1)} ${area.toLowerCase()}`;
}

export function newInjury(at: number, d: InjuryDetail, now: number): LogEvent {
  const injury: InjuryDetail = { area: d.area.trim().slice(0, 60) };
  if (d.side) injury.side = d.side;
  if (d.severity) injury.severity = d.severity;
  if (d.how?.trim()) injury.how = d.how.trim().slice(0, 300);
  if (d.around?.trim()) injury.around = d.around.trim().slice(0, 300);
  if (d.sessionId) injury.sessionId = d.sessionId;
  if (d.rollId) injury.rollId = d.rollId;
  if (d.healedAt) injury.healedAt = d.healedAt;
  return createEvent('injury', at, { injury }, now);
}

export interface Injuries {
  active: LogEvent[];
  healed: LogEvent[];
}

/** Active injuries (most recent first) and healed ones (most recently healed first). */
export function injuries(events: LogEvent[], now = Date.now()): Injuries {
  const all = events.filter((e) => !e.deleted && e.type === 'injury' && e.detail?.injury && e.at <= now);
  return {
    active: all.filter((e) => !e.detail!.injury!.healedAt).sort((a, b) => b.at - a.at),
    healed: all.filter((e) => e.detail!.injury!.healedAt).sort((a, b) => b.detail!.injury!.healedAt! - a.detail!.injury!.healedAt!),
  };
}

/** Whole days since it happened (0 on the day), or how long it lasted once healed. */
export const injuryDays = (e: LogEvent, now: number) => daysBetween(dayKey(e.at), dayKey(e.detail?.injury?.healedAt ?? now));

/** Injuries active at a moment. */
export const activeAt = (events: LogEvent[], ts: number) => events.filter((e) => !e.deleted && e.type === 'injury' && e.at <= ts && (!e.detail?.injury?.healedAt || e.detail.injury.healedAt > ts));

export interface InjuryStats {
  total: number;
  active: number;
  /** Calendar days this year with at least one injury active. */
  daysThisYear: number;
  /** Sessions trained while an injury was active. */
  sessionsWhileInjured: number;
  byArea: { area: string; label: string; n: number }[];
  /** Median days from injury to healed, over healed ones (null without any). */
  medianDays: number | null;
}

export function injuryStats(events: LogEvent[], now: number): InjuryStats {
  const list = events.filter((e) => !e.deleted && e.type === 'injury' && e.detail?.injury && e.at <= now);
  const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  const days = new Set<string>();
  for (const e of list) {
    const end = Math.min(e.detail!.injury!.healedAt ?? now, now);
    for (let t = Math.max(e.at, yearStart); t <= end; t += DAY) days.add(dayKey(t));
    if (end >= yearStart && e.at <= end) days.add(dayKey(end));
  }
  const areas = new Map<string, number>();
  for (const e of list) areas.set(e.detail!.injury!.area, (areas.get(e.detail!.injury!.area) ?? 0) + 1);
  const healed = list
    .filter((e) => e.detail!.injury!.healedAt)
    .map((e) => injuryDays(e, now))
    .sort((a, b) => a - b);
  return {
    total: list.length,
    active: list.filter((e) => !e.detail!.injury!.healedAt).length,
    daysThisYear: days.size,
    sessionsWhileInjured: events.filter((e) => !e.deleted && isSession(e) && activeAt(list, e.at).length).length,
    byArea: [...areas.entries()].map(([area, n]) => ({ area, label: areaLabel(area), n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    medianDays: healed.length ? healed[Math.floor(healed.length / 2)] : null,
  };
}
