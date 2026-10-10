import { BELTS, type CompanionChoice, type PatchId, type Settings } from './types';

const COMPANIONS: CompanionChoice[] = ['grappler', 'bear', 'sloth', 'octopus', 'frog', 'cat', 'random', 'off'];

export const SETTINGS_KEY = 'matlog:v1:settings';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  startBelt: 'white',
  startStripes: 0,
  theme: 'auto',
  clock: 'auto',
  defaultMin: 60,
  weekStart: 1,
  companion: 'grappler',
  patches: [],
  lastBackupAt: null,
  backupEveryDays: 7,
  backupSnoozedAt: 0,
  backupLaterAt: 0,
  tipsSeen: [],
  focus: '',
  focusSince: null,
  focusHistory: [],
  reflectAfter: 120,
  reflectSkipped: [],
  roundMin: 6,
  restMin: 1,
  hiddenCards: ['study'],
  classOnHour: true,
  splash: true,
  lastBelt: 'white',
};

/** Backup reminder intervals offered in Settings (0 = only every 30 entries). */
export const BACKUP_DAY_CHOICES = [3, 7, 14, 30, 0];

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
  // v0.1 stored a boolean.
  const c = s.companion as unknown;
  if (c === true) s.companion = 'grappler';
  else if (c === false) s.companion = 'off';
  if (!COMPANIONS.includes(s.companion)) s.companion = 'grappler';
  s.splash = s.splash !== false;
  if (!BELTS.includes(s.lastBelt)) s.lastBelt = s.startBelt;
  s.patches = Array.isArray(s.patches) ? [...new Set(s.patches.filter((p) => PATCHES.includes(p)))] : [];
  if (!Array.isArray(s.tipsSeen)) s.tipsSeen = [];
  s.focus = typeof s.focus === 'string' ? s.focus.slice(0, 140) : '';
  if (!s.focus) s.focusSince = null;
  else if (!Number.isFinite(s.focusSince)) s.focusSince = null;
  if (![0, 60, 120, 240, -1].includes(s.reflectAfter)) s.reflectAfter = 120;
  s.reflectSkipped = Array.isArray(s.reflectSkipped) ? s.reflectSkipped.filter((x) => typeof x === 'string').slice(-30) : [];
  if (!Number.isInteger(s.roundMin) || s.roundMin < 1 || s.roundMin > 20) s.roundMin = 6;
  if (!Number.isInteger(s.restMin) || s.restMin < 0 || s.restMin > 10) s.restMin = 1;
  const cards = ['class', 'open-mat', 'drilling', 'comp', 'roll', 'study'];
  s.hiddenCards = Array.isArray(s.hiddenCards) ? [...new Set(s.hiddenCards.filter((id) => cards.includes(id)))] : [];
  if (s.hiddenCards.length >= cards.length) s.hiddenCards = [];
  s.classOnHour = s.classOnHour !== false;
  s.focusHistory = Array.isArray(s.focusHistory)
    ? s.focusHistory.filter((h) => h && typeof h.text === 'string' && h.text.trim() && Number.isFinite(h.from) && Number.isFinite(h.to)).slice(0, 12)
    : [];
  if (s.lastBackupAt !== null && !Number.isFinite(s.lastBackupAt)) s.lastBackupAt = null;
  if (!BACKUP_DAY_CHOICES.includes(s.backupEveryDays)) s.backupEveryDays = DEFAULT_SETTINGS.backupEveryDays;
  if (!Number.isInteger(s.backupSnoozedAt) || s.backupSnoozedAt < 0) s.backupSnoozedAt = 0;
  if (!Number.isFinite(s.backupLaterAt) || s.backupLaterAt < 0) s.backupLaterAt = 0;
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage disabled or full: settings just won't persist */
  }
}
