import type { BuddyId } from './companion';

/** What your buddy says when you tap it. Playful, never a verdict on your training. */
export const SHARED_LINES = [
  'Oss!',
  'Shrimp, shrimp, shrimp.',
  'Rounds are experiments, not verdicts.',
  'Mat time is good time.',
  'I washed my gi. Probably.',
  'One more round? Your call.',
  'Did you bring your mouthguard?',
  'Positional sparring builds character. And knees.',
];

export const BUDDY_LINES: Record<BuddyId, string[]> = {
  grappler: ['My guard is “interesting”, apparently.', 'I stretched. Mostly.'],
  bear: ['Bear hug? I call it a body lock.', 'Top pressure is my love language.'],
  sloth: ['Slow is smooth. Smooth is… also slow.', 'Flow roll? My favorite speed.'],
  octopus: ['Eight limbs. Still get passed.', 'Spider guard was made for me.'],
  frog: ['Frog guard is my birthright.', 'Ribbit. That means oss.'],
  cat: ['I always land on my feet. Takedowns are rude.', 'Kimura? More like kitty-mura.'],
};

let turn = 0;
/** Lines take turns between the buddy's own and the shared ones, so taps never repeat back to back. */
export function nextLine(id: BuddyId): string {
  const own = BUDDY_LINES[id];
  const i = turn++;
  return i % 2 === 0 ? own[(i / 2) % own.length] : SHARED_LINES[Math.floor(i / 2) % SHARED_LINES.length];
}
