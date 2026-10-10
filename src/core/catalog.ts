/**
 * The vocabulary: positions, and techniques that move between them. Techniques you type that aren't
 * here are kept as free text (their id is the text itself), so the library never blocks a log.
 */

export interface Position {
  id: string;
  label: string;
  /** Column in the position graph, left (standing) to right (finishing). */
  col: number;
  /** Row within the column. */
  row: number;
}

export const POSITIONS: Position[] = [
  { id: 'standing', label: 'Standing', col: 0, row: 1 },
  { id: 'closed-guard', label: 'Closed guard', col: 1, row: 0 },
  { id: 'open-guard', label: 'Open guard', col: 1, row: 1 },
  { id: 'half-guard', label: 'Half guard', col: 1, row: 2 },
  { id: 'butterfly', label: 'Butterfly', col: 1, row: 3 },
  { id: 'turtle', label: 'Turtle', col: 2, row: 0 },
  { id: 'side-control', label: 'Side control', col: 2, row: 1 },
  { id: 'knee-on-belly', label: 'Knee on belly', col: 2, row: 2 },
  { id: 'leg-entanglement', label: 'Leg entanglement', col: 2, row: 3 },
  { id: 'north-south', label: 'North–south', col: 3, row: 0 },
  { id: 'mount', label: 'Mount', col: 3, row: 1 },
  { id: 'back', label: 'Back', col: 3, row: 2 },
  { id: 'submission', label: 'Submission', col: 4, row: 1 },
];

export const positionById = (id: string) => POSITIONS.find((p) => p.id === id);
export const positionLabel = (id: string) => positionById(id)?.label ?? id;

export type TechKind = 'takedown' | 'sweep' | 'pass' | 'transition' | 'escape' | 'submission';

export interface Technique {
  id: string;
  label: string;
  kind: TechKind;
  from: string;
  to: string;
  /** Other names people type. */
  aka?: string[];
}

const t = (id: string, label: string, kind: TechKind, from: string, to: string, aka?: string[]): Technique => ({ id, label, kind, from, to, aka });

export const TECHNIQUES: Technique[] = [
  t('double-leg', 'Double leg', 'takedown', 'standing', 'side-control', ['double']),
  t('single-leg', 'Single leg', 'takedown', 'standing', 'side-control', ['single']),
  t('guard-pull', 'Guard pull', 'transition', 'standing', 'closed-guard', ['pull guard']),
  t('osoto-gari', 'Osoto gari', 'takedown', 'standing', 'side-control', ['osoto']),
  t('ankle-pick', 'Ankle pick', 'takedown', 'standing', 'side-control'),
  t('snap-down', 'Snap down', 'takedown', 'standing', 'turtle'),

  t('scissor-sweep', 'Scissor sweep', 'sweep', 'closed-guard', 'mount', ['scissor']),
  t('hip-bump', 'Hip bump sweep', 'sweep', 'closed-guard', 'mount', ['hip bump']),
  t('flower-sweep', 'Flower sweep', 'sweep', 'closed-guard', 'mount', ['pendulum sweep', 'pendulum']),
  t('armbar-guard', 'Armbar from guard', 'submission', 'closed-guard', 'submission', ['armbar', 'juji gatame']),
  t('triangle', 'Triangle', 'submission', 'closed-guard', 'submission', ['triangle choke']),
  t('kimura-guard', 'Kimura from guard', 'submission', 'closed-guard', 'submission', ['kimura']),
  t('guillotine', 'Guillotine', 'submission', 'closed-guard', 'submission'),
  t('cross-collar', 'Cross collar choke', 'submission', 'closed-guard', 'submission', ['collar choke']),
  t('omoplata', 'Omoplata', 'submission', 'open-guard', 'submission'),
  t('take-back-guard', 'Arm drag to back', 'transition', 'open-guard', 'back', ['arm drag']),

  t('de-la-riva-sweep', 'De la Riva sweep', 'sweep', 'open-guard', 'side-control', ['dlr sweep', 'dlr']),
  t('tripod-sweep', 'Tripod sweep', 'sweep', 'open-guard', 'side-control', ['tripod']),
  t('sickle-sweep', 'Sickle sweep', 'sweep', 'open-guard', 'side-control'),
  t('berimbolo', 'Berimbolo', 'transition', 'open-guard', 'back'),
  t('straight-ankle', 'Straight ankle lock', 'submission', 'leg-entanglement', 'submission', ['ankle lock', 'straight footlock']),
  t('heel-hook', 'Heel hook', 'submission', 'leg-entanglement', 'submission', ['inside heel hook', 'outside heel hook']),
  t('kneebar', 'Kneebar', 'submission', 'leg-entanglement', 'submission'),
  t('toe-hold', 'Toe hold', 'submission', 'leg-entanglement', 'submission'),
  t('ashi-entry', 'Single leg X entry', 'transition', 'open-guard', 'leg-entanglement', ['slx', 'ashi garami', 'ashi']),

  t('old-school-sweep', 'Old school sweep', 'sweep', 'half-guard', 'side-control', ['old school']),
  t('half-guard-back-take', 'Dogfight to back', 'transition', 'half-guard', 'back', ['dogfight']),
  t('knee-shield', 'Knee shield recovery', 'transition', 'half-guard', 'open-guard', ['knee shield']),
  t('butterfly-sweep', 'Butterfly sweep', 'sweep', 'butterfly', 'mount', ['hook sweep']),
  t('arm-drag-butterfly', 'Butterfly arm drag', 'transition', 'butterfly', 'back'),

  t('toreando', 'Toreando pass', 'pass', 'open-guard', 'side-control', ['torreando', 'bullfighter pass', 'toreando']),
  t('knee-cut', 'Knee cut pass', 'pass', 'half-guard', 'side-control', ['knee slice', 'knee cut', 'knee slide']),
  t('over-under', 'Over-under pass', 'pass', 'open-guard', 'side-control', ['over under']),
  t('leg-drag', 'Leg drag', 'pass', 'open-guard', 'side-control'),
  t('stack-pass', 'Stack pass', 'pass', 'closed-guard', 'side-control', ['stack']),
  t('x-pass', 'X pass', 'pass', 'open-guard', 'side-control'),
  t('body-lock-pass', 'Body lock pass', 'pass', 'half-guard', 'side-control', ['body lock']),

  t('side-to-mount', 'Side control to mount', 'transition', 'side-control', 'mount'),
  t('side-to-knee', 'Knee on belly', 'transition', 'side-control', 'knee-on-belly'),
  t('side-to-ns', 'Side to north–south', 'transition', 'side-control', 'north-south'),
  t('americana', 'Americana', 'submission', 'side-control', 'submission', ['keylock']),
  t('kimura-side', 'Kimura from side', 'submission', 'side-control', 'submission'),
  t('far-side-armbar', 'Far side armbar', 'submission', 'knee-on-belly', 'submission'),
  t('ns-choke', 'North–south choke', 'submission', 'north-south', 'submission', ['north south choke']),
  t('arm-triangle', 'Arm triangle', 'submission', 'side-control', 'submission', ['kata gatame', 'head and arm']),
  t('darce', "D'arce", 'submission', 'turtle', 'submission', ['darce', 'brabo']),
  t('anaconda', 'Anaconda', 'submission', 'turtle', 'submission'),
  t('turtle-back-take', 'Seatbelt back take', 'transition', 'turtle', 'back', ['seatbelt', 'back take']),
  t('crucifix', 'Crucifix', 'transition', 'turtle', 'back'),

  t('mount-armbar', 'Armbar from mount', 'submission', 'mount', 'submission', ['s-mount armbar']),
  t('ezekiel', 'Ezekiel', 'submission', 'mount', 'submission'),
  t('mount-to-back', 'Mount to back', 'transition', 'mount', 'back'),
  t('rnc', 'Rear naked choke', 'submission', 'back', 'submission', ['rear naked', 'mata leao', 'rnc']),
  t('bow-and-arrow', 'Bow and arrow choke', 'submission', 'back', 'submission', ['bow and arrow']),

  t('upa', 'Upa (bridge and roll)', 'escape', 'mount', 'closed-guard', ['bridge and roll', 'trap and roll']),
  t('elbow-knee', 'Elbow–knee escape', 'escape', 'mount', 'half-guard', ['shrimp escape', 'elbow escape']),
  t('side-escape', 'Side control escape', 'escape', 'side-control', 'open-guard', ['frame and shrimp']),
  t('back-escape', 'Back escape', 'escape', 'back', 'closed-guard'),
  t('turtle-roll', 'Granby roll', 'escape', 'turtle', 'open-guard', ['granby']),
];

/** Submissions offered for "hit" and "tapped to", most common first. */
export const SUBMISSIONS: { id: string; label: string }[] = [
  { id: 'rnc', label: 'Rear naked choke' },
  { id: 'armbar', label: 'Armbar' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'kimura', label: 'Kimura' },
  { id: 'guillotine', label: 'Guillotine' },
  { id: 'americana', label: 'Americana' },
  { id: 'arm-triangle', label: 'Arm triangle' },
  { id: 'darce', label: "D'arce" },
  { id: 'cross-collar', label: 'Collar choke' },
  { id: 'bow-and-arrow', label: 'Bow and arrow' },
  { id: 'ezekiel', label: 'Ezekiel' },
  { id: 'omoplata', label: 'Omoplata' },
  { id: 'heel-hook', label: 'Heel hook' },
  { id: 'straight-ankle', label: 'Ankle lock' },
  { id: 'kneebar', label: 'Kneebar' },
  { id: 'ns-choke', label: 'North–south choke' },
];

const SUB_ALIASES: Record<string, string> = {
  'rear naked': 'rnc',
  'rear naked choke': 'rnc',
  'mata leao': 'rnc',
  'armlock': 'armbar',
  'juji gatame': 'armbar',
  'armbar from guard': 'armbar',
  'armbar from mount': 'armbar',
  'triangle choke': 'triangle',
  'keylock': 'americana',
  'kata gatame': 'arm-triangle',
  'head and arm': 'arm-triangle',
  'darce': 'darce',
  'brabo': 'darce',
  'collar choke': 'cross-collar',
  'cross collar choke': 'cross-collar',
  'ankle lock': 'straight-ankle',
  'straight ankle lock': 'straight-ankle',
  'footlock': 'straight-ankle',
  'heelhook': 'heel-hook',
  'north south choke': 'ns-choke',
  'bow and arrow choke': 'bow-and-arrow',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Resolves typed text to a submission id, or keeps it as free text. */
export function resolveSub(text: string): string {
  const n = norm(text);
  if (!n) return '';
  const hit = SUBMISSIONS.find((s) => s.id === n || norm(s.label) === n || norm(s.id) === n);
  if (hit) return hit.id;
  return SUB_ALIASES[n] ?? text.trim();
}
export const subLabel = (id: string) => SUBMISSIONS.find((s) => s.id === id)?.label ?? id;

// ---------- Your own techniques ----------

/**
 * Techniques you add yourself (Technique library → Add technique). They live in the log as
 * `technique` events, so they back up and merge; the app keeps this list in step with the log
 * (`setCustomTechniques`), and every lookup below sees them. A custom technique's id is the text it
 * was first typed as, so entries logged before it was defined link up on their own.
 */
let custom: Technique[] = [];
export function setCustomTechniques(list: Technique[]) {
  custom = list;
}
export const customTechniques = () => custom;
export const allTechniques = () => (custom.length ? [...TECHNIQUES, ...custom] : TECHNIQUES);
export const isCustom = (id: string) => custom.some((t) => t.id === id);

export const TECH_KINDS: { id: TechKind; label: string }[] = [
  { id: 'takedown', label: 'Takedown' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'pass', label: 'Pass' },
  { id: 'transition', label: 'Transition' },
  { id: 'escape', label: 'Escape' },
  { id: 'submission', label: 'Submission' },
];

/** Resolves typed text to a technique id, or keeps it as free text. */
export function resolveTechnique(text: string): string {
  const n = norm(text);
  if (!n) return '';
  const hit = allTechniques().find((x) => x.id === n || norm(x.id) === n || norm(x.label) === n || x.aka?.some((a) => norm(a) === n));
  return hit?.id ?? text.trim();
}
export const techniqueById = (id: string) => TECHNIQUES.find((x) => x.id === id) ?? custom.find((x) => x.id === id);
export const techniqueLabel = (id: string) => techniqueById(id)?.label ?? id;

/** Resolves typed text to a position id ("half guard bottom" → half-guard), or keeps it. */
export function resolvePosition(text: string): string {
  const n = norm(text)
    .replace(/\b(bottom|top|on bottom|on top|position)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return '';
  const alias: Record<string, string> = { half: 'half-guard', 'closed': 'closed-guard', guard: 'closed-guard', side: 'side-control', 'side mount': 'side-control', kob: 'knee-on-belly', 'knee on belly': 'knee-on-belly', 'back control': 'back', 'back mount': 'back', 'leg lock': 'leg-entanglement', legs: 'leg-entanglement', ashi: 'leg-entanglement', 'north south': 'north-south', 'butterfly guard': 'butterfly', 'de la riva': 'open-guard', dlr: 'open-guard', spider: 'open-guard' };
  const hit = POSITIONS.find((p) => p.id === n || norm(p.id) === n || norm(p.label) === n);
  return hit?.id ?? alias[n] ?? text.trim();
}
