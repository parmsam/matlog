/**
 * Training sessions (timed: tap to start, tap to stop), single rounds, study time, promotions, and
 * the notebook: focuses you're working on and problems you're solving. Everything is an event, so
 * it all merges, backs up and undoes the same way.
 */
export type SessionKind = 'class' | 'open-mat' | 'drilling' | 'comp';
export type EventType = SessionKind | 'roll' | 'study' | 'promotion' | 'focus' | 'problem' | 'technique';

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
  /** Technique ids (sweeps, passes, takedowns…) you landed in the round. */
  landed?: string[];
  /** Technique ids you went for but didn't land. */
  tried?: string[];
  outcome?: Outcome; // comp matches
  /** Positional round: where it started (position id) and which side you were on. */
  start?: string;
  role?: Role;

  // Session check-in (usually filled in when reflecting)
  /** How much you enjoyed it, 1–5. */
  enjoy?: number;
  /** Did you follow your plan? */
  plan?: PlanFollowed;
  /** When you reflected on it (the notebook prompt stops asking). */
  reflectedAt?: number;

  // Study
  /** What you studied: an instructional, a coach, a video. */
  source?: string;
  url?: string;

  // Your own technique (Technique library)
  technique?: CustomTechnique;

  // Notebook
  focus?: FocusDetail;
  problem?: ProblemDetail;

  // Promotions
  stripes?: number; // 0–4

  note?: string;
}

export type Role = 'top' | 'bottom';
export type PlanFollowed = 'yes' | 'partly' | 'no';

/** What a focus is in your game (from "build a few connected skills deeply"). */
export type FocusRole = 'main' | 'complement' | 'habit' | 'experiment' | 'side';

/** A block of work on a focus. `to` is set when you rest it or finish it. */
export interface FocusBlock {
  from: number;
  to?: number;
}

export interface FocusDetail {
  text: string;
  role: FocusRole;
  /** Block length in days: 7 ("one position, one week") or 14 ("about 2 weeks"). */
  blockDays: number;
  blocks: FocusBlock[];
  /** Your plan: where you go if it works, and if it fails. */
  ifWorks?: string;
  ifFails?: string;
  /** Reps a session that would count as a good day (e.g. 1–2 against live resistance). */
  target?: number;
  /** Marked done (no more blocks planned). */
  doneAt?: number;
}

export interface CustomTechnique {
  /** The text it was first typed as; entries refer to it by this. */
  id: string;
  label: string;
  kind: 'takedown' | 'sweep' | 'pass' | 'transition' | 'escape' | 'submission';
  from: string;
  to: string;
  aka?: string[];
}

export type ProblemSource = 'external' | 'internal' | 'predictive';

export interface ProblemDetail {
  text: string;
  source?: ProblemSource;
  /** Idea to try / solution. */
  idea?: string;
  /** Did you tinker in the position before looking it up? */
  tinkered?: boolean;
  solvedAt?: number;
  /** The session it came up in, if any. */
  sessionId?: string;
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

export type CompanionChoice = 'grappler' | 'bear' | 'sloth' | 'octopus' | 'frog' | 'cat' | 'random' | 'off';
export type ThemeChoice = 'auto' | 'gi' | 'nogi';
export type ClockFormat = 'auto' | '12h' | '24h';
export type ReflectAfter = 0 | 60 | 120 | 240 | -1;
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
  /** The training buddy, 'random' for a different one each day, or 'off'. */
  companion: CompanionChoice;
  /** Patches worn on the companion (only unlocked ones show). */
  patches: PatchId[];
  lastBackupAt: number | null;
  /** Remind to back up after this many days without one; 0 = only the every-30-entries reminder. */
  backupEveryDays: number;
  /** New-entry count at which the count reminder was last put off ("Not now"); 0 after a backup. */
  backupSnoozedAt: number;
  /** When the time reminder was last put off; it waits a day. 0 after a backup. */
  backupLaterAt: number;
  tipsSeen: string[];
  /** A short branded splash while the app opens. */
  splash: boolean;
  /** Your belt as of the last visit, so the splash can show it before the log loads. */
  lastBelt: Belt;
  /**
   * v0.2 kept one "Working on" line here. It moves into the log as a focus event on load
   * (see core/focus.ts migrateFocus) and these stay empty afterwards.
   */
  focus: string;
  focusSince: number | null;
  focusHistory: { text: string; from: number; to: number }[];
  /** Minutes after a session ends before the reflection prompt shows; -1 = off. */
  reflectAfter: ReflectAfter;
  /** Sessions whose reflection prompt was put off ("Not now"). */
  reflectSkipped: string[];
  /** Round clock: round and rest length in minutes. */
  roundMin: number;
  restMin: number;
  /** True once you've changed the round length yourself (v0.3 saved 6 by default; untouched ones move to 5). */
  roundMinSet?: boolean;
  /** Home-screen buttons turned off (kind ids). Links, keys and the API still work. */
  hiddenCards: string[];
  /** Classes start on the hour: snap class start times (see core/ops.ts classStart). */
  classOnHour: boolean;
}
