/** Training sessions (timed: tap to start, tap to stop), single rounds, and promotions. */
export type SessionKind = 'class' | 'open-mat' | 'drilling' | 'comp';
export type EventType = SessionKind | 'roll' | 'promotion';

export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';
export const BELTS: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];

/** A partner's size relative to you. */
export type Size = 'smaller' | 'similar' | 'bigger';
export type Attire = 'gi' | 'nogi';
export type Outcome = 'win' | 'loss' | 'draw';

/** Optional detail. Nothing here is ever required to log an event. */
export interface Detail {
  attire?: Attire; // session, roll
  /** Technique ids (see catalog.ts) or free text for your own. Sessions. */
  techniques?: string[];
  /** Length in minutes, for entries logged after the fact without start/stop. */
  min?: number;

  // Rolls
  partner?: string;
  belt?: Belt; // partner's belt (roll) or your new belt (promotion)
  size?: Size;
  /** Submissions you finished. */
  subsFor?: string[];
  /** Submissions you tapped to. */
  subsAgainst?: string[];
  /** Position ids where you got stuck. */
  stuck?: string[];
  outcome?: Outcome; // comp matches

  // Promotions
  stripes?: number; // 0–4

  note?: string;
}

export interface LogEvent {
  id: string;
  type: EventType;
  /** Start time, epoch ms. */
  at: number;
  /** End time for timed events; undefined while one is still going. */
  endAt?: number;
  detail?: Detail;
  createdAt: number;
  /** Newest wins when merging two devices' exports. */
  updatedAt: number;
  /** Soft delete, so undo and merging work. */
  deleted?: boolean;
}

export interface LogData {
  events: LogEvent[];
}

export type ThemeChoice = 'auto' | 'gi' | 'nogi';
export type ClockFormat = 'auto' | '12h' | '24h';
export type PatchId = 'p10' | 'p25' | 'p50' | 'p100' | 'p250' | 'p500' | 'p1000';

export interface Settings {
  name: string;
  /** Where you start: rank before your first logged promotion. */
  startBelt: Belt;
  startStripes: number;
  theme: ThemeChoice;
  clock: ClockFormat;
  /** Default length for a session logged after the fact (minutes). */
  defaultMin: number;
  /** Week starts on Monday (1) or Sunday (0). */
  weekStart: 0 | 1;
  companion: boolean;
  /** Patches worn on the companion (only unlocked ones show). */
  patches: PatchId[];
  lastBackupAt: number | null;
  tipsSeen: string[];
  /** "Working on": what you want to try next class. Shown on the home screen; yours, never suggested. */
  focus: string;
}
