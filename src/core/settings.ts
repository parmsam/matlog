import { BELTS, type PatchId, type Settings } from './types';

export const SETTINGS_KEY = 'matlog:v1:settings';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  startBelt: 'white',
  startStripes: 0,
  theme: 'auto',
  clock: 'auto',
  defaultMin: 60,
  weekStart: 1,
  companion: true,
  patches: [],
  lastBackupAt: null,
  tipsSeen: [],
  focus: '',
};

const PATCHES: PatchId[] = ['p10', 'p25', 'p50', 'p100', 'p250', 'p500', 'p1000'];

/** Reads settings, repairing anything unknown or out of range. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitize(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function sanitize(saved: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...saved };
  if (typeof s.name !== 'string') s.name = '';
  s.name = s.name.slice(0, 60);
  if (!BELTS.includes(s.startBelt)) s.startBelt = 'white';
  if (!Number.isInteger(s.startStripes) || s.startStripes < 0 || s.startStripes > 4) s.startStripes = 0;
  if (!['auto', 'gi', 'nogi'].includes(s.theme)) s.theme = 'auto';
  if (!['auto', '12h', '24h'].includes(s.clock)) s.clock = 'auto';
  if (!Number.isInteger(s.defaultMin) || s.defaultMin < 5 || s.defaultMin > 600) s.defaultMin = 60;
  if (s.weekStart !== 0 && s.weekStart !== 1) s.weekStart = 1;
  s.companion = s.companion !== false;
  s.patches = Array.isArray(s.patches) ? [...new Set(s.patches.filter((p) => PATCHES.includes(p)))] : [];
  if (!Array.isArray(s.tipsSeen)) s.tipsSeen = [];
  s.focus = typeof s.focus === 'string' ? s.focus.slice(0, 140) : '';
  if (s.lastBackupAt !== null && !Number.isFinite(s.lastBackupAt)) s.lastBackupAt = null;
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage disabled or full: settings just won't persist */
  }
}
