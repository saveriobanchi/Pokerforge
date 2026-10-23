import type { GameState } from '../state';
import { GAME, type GameId } from './games';

/**
 * The guide: a chain of goals shown one at a time on the quest card (the
 * journal lists them all). Each pays a small reward.
 */
export interface Reward { chips?: number; gems?: number; points?: number }
export interface GoalDef {
  id: string;
  text: string;
  /** Short how-to shown under the goal. */
  hint: string;
  /** [progress, target]. */
  check: (s: GameState) => [number, number];
  reward: Reward;
}

const count = (s: GameState, type: string) => { let n = 0; for (const b of s.buildings.values()) if (b.type === type) n++; return n; };
const plays = (s: GameState, g: GameId) => s.stats.playsBy[g] ?? 0;
const built = (type: string, text: string, hint: string, reward: Reward): GoalDef => ({ id: 'build_' + type, text, hint, check: (s) => [Math.min(1, count(s, type)), 1], reward });
const play = (g: GameId, n: number, reward: Reward, hint?: string): GoalDef => ({ id: `play_${g}_${n}`, text: `Play ${GAME[g].name} ${n} times`, hint: hint ?? GAME[g].tagline, check: (s) => [Math.min(n, plays(s, g)), n], reward });
const level = (n: number, reward: Reward): GoalDef => ({ id: 'level_' + n, text: `Reach renown level ${n}`, hint: 'Every chip you wager earns renown, win or lose.', check: (s) => [Math.min(n, s.renown.level), n], reward });
const bank = (n: number, reward: Reward): GoalDef => ({ id: 'bank_' + n, text: `Hold ${n.toLocaleString('en-US')} chips at once`, hint: 'Patrons, wins and comps all add up.', check: (s) => [Math.min(n, Math.floor(s.chips)), n], reward });

export const GOALS: GoalDef[] = [
  { id: 'well', text: 'Fish 5 coins from the wishing well', hint: 'Tap the well in the middle of the island.', check: (s) => [Math.min(5, s.stats.wellTaps), 5], reward: { chips: 20 } },
  play('coin', 5, { chips: 30 }, 'Tap the coin stand, pick a side and toss.'),
  { id: 'expand1', text: 'Grow the island to 12 tiles', hint: 'Build → Land → Grass Plot, then tap beside the island.', check: (s) => [Math.min(12, s.tiles.size), 12], reward: { chips: 40 } },
  level(2, { chips: 50 }),
  built('slots', 'Build a Lucky Reels machine', 'Build → Games. Slots stand on any floor.', { chips: 60 }),
  { id: 'patrons1', text: 'Welcome 10 patrons', hint: 'Patrons sit at your tables and pay the house. Tap a table to empty its till.', check: (s) => [Math.min(10, s.stats.patrons), 10], reward: { chips: 80 } },
  { id: 'perk1', text: 'Spend a perk point', hint: 'Open the Lounge (the star) and pick a perk.', check: (s) => [Math.min(1, Object.values(s.renown.perks).reduce((a, b) => a + b, 0)), 1], reward: { chips: 60 } },
  { id: 'pave1', text: 'Pave 4 tiles with cobbles', hint: 'Card and dice tables need a paved floor. Build → Land → Cobble Paving.', check: (s) => [Math.min(4, [...s.tiles.values()].filter((t) => t.floor !== 'grass').length), 4], reward: { chips: 80 } },
  built('dice_table', 'Open a Sky Dice table', 'Build → Games, on a paved tile.', { chips: 120 }),
  { id: 'glamour10', text: 'Reach 10 glamour', hint: 'Decor draws a crowd. Hedges, flowers, ropes and banners all help.', check: (s) => [Math.min(10, Math.floor(s.cache.glamour)), 10], reward: { chips: 150 } },
  { id: 'upgrade1', text: 'Upgrade a table to level 2', hint: 'Open a table and tap Upgrade: higher limits, richer patrons.', check: (s) => [Math.min(2, Math.max(0, ...[...s.buildings.values()].map((b) => b.level))), 2], reward: { chips: 200 } },
  built('scratch_kiosk', 'Open a Scratch Kiosk', 'Scratch cards often hide lucky tokens.', { chips: 250 }),
  built('blackjack', 'Open a Blackjack table', 'Unlocks at renown 5.', { chips: 400, gems: 1 }),
  play('blackjack', 20, { chips: 500 }),
  { id: 'token1', text: 'Find a lucky token', hint: 'Tokens drop from any bet, more often from big wins and scratch cards.', check: (s) => [Math.min(1, s.stats.tokens), 1], reward: { gems: 2 } },
  built('cashier', 'Build a Cashier Cage', 'It empties nearby tills for you — and pays out comps.', { chips: 800 }),
  bank(5000, { chips: 1000 }),
  built('roulette', 'Open a Roulette table', 'Unlocks at renown 7.', { chips: 1500 }),
  { id: 'carpet', text: 'Lay 6 tiles of velvet carpet', hint: 'Tables on carpet take 10% more.', check: (s) => [Math.min(6, [...s.tiles.values()].filter((t) => t.floor === 'carpet').length), 6], reward: { chips: 2000 } },
  built('bar', 'Open the Sky Bar', 'Patrons near it stay longer and tip.', { chips: 3000 }),
  level(10, { gems: 3, points: 1 }),
  built('plinko', 'Build Plinko', 'Unlocks at renown 9.', { chips: 6000 }),
  { id: 'glamour60', text: 'Reach 60 glamour', hint: 'Fountains, neon and gazebos draw bigger crowds.', check: (s) => [Math.min(60, Math.floor(s.cache.glamour)), 60], reward: { chips: 8000 } },
  { id: 'mastery1', text: 'Earn three mastery stars at one game', hint: 'Mastery grows with every round you play.', check: (s) => [Math.min(3, Math.max(0, ...Object.values(s.stats.playsBy).map((n) => [25, 100, 300, 1000, 2500].filter((t) => (n ?? 0) >= t).length))), 3], reward: { gems: 3 } },
  built('fortune_wheel', 'Raise the Fortune Wheel', 'Unlocks at renown 11.', { chips: 15000 }),
  built('hotel', 'Open the Cloud Hotel', 'More guests, and night owls who never leave.', { chips: 20000 }),
  built('dock', 'Build an Airship Dock', 'High rollers arrive by air. Must touch the edge.', { gems: 5 }),
  built('video_poker', 'Install Video Poker', 'Unlocks at renown 13.', { chips: 50000 }),
  { id: 'set1', text: 'Complete a token set', hint: 'Four tokens of one set grant a lasting bonus.', check: (s) => [Math.min(1, s.codex.length), 1], reward: { gems: 5, points: 1 } },
  bank(1_000_000, { gems: 5 }),
  built('gem_mine', 'Dig the Gem Mines', 'Unlocks at renown 15.', { chips: 120000 }),
  built('keno', 'Open Sky Keno', 'Unlocks at renown 17.', { chips: 300000 }),
  built('crash_pad', 'Launch Airship Ascent', 'Unlocks at renown 19.', { chips: 800000 }),
  level(20, { gems: 10, points: 2 }),
  built('baccarat', 'Open the Baccarat salon', 'Unlocks at renown 21.', { chips: 2_000_000 }),
  built('derby', 'Build the Sky Derby', 'Unlocks at renown 23.', { chips: 5_000_000 }),
  built('holdem', 'Open the Hold’em room', 'Unlocks at renown 25.', { chips: 12_000_000 }),
  built('pokerforge', 'Lay the foundation of the Pokerforge', 'The great work. Unlocks at renown 27.', { gems: 10 }),
  { id: 'wonder3', text: 'Complete the Pokerforge', hint: 'Three stages of chips and gems.', check: (s) => [s.wonder.stage, 3], reward: { gems: 25, points: 3 } },
  { id: 'legend1', text: 'Earn your first Legend rank', hint: 'Legend ranks raise everything, forever.', check: (s) => [Math.min(1, s.wonder.legend), 1], reward: { gems: 25 } },
];

export const GOAL_BY_ID: Record<string, GoalDef> = Object.fromEntries(GOALS.map((g) => [g.id, g]));

/** The first unfinished goal. */
export function currentGoal(s: GameState): GoalDef | null {
  for (const g of GOALS) if (!s.goals.has(g.id)) return g;
  return null;
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.chips) parts.push(`${r.chips.toLocaleString('en-US')} chips`);
  if (r.gems) parts.push(`${r.gems} gem${r.gems > 1 ? 's' : ''}`);
  if (r.points) parts.push(`${r.points} perk point${r.points > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
