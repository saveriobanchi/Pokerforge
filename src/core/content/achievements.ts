import type { GameState } from '../state';
import { GAMES } from './games';
import { TOKENS } from './tokens';

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  branch: 'tables' | 'feats' | 'house' | 'fortune';
  gems: number;
  check: (s: GameState) => boolean;
  /** Hidden until earned. */
  secret?: boolean;
}

const A: AchDef[] = [];
const feat = (s: GameState, id: string) => (s.stats.feats[id] ?? 0) > 0;

for (const g of GAMES) {
  A.push(
    { id: `first_${g.id}`, name: `${g.name}: First Hand`, desc: `Play ${g.name}.`, branch: 'tables', gems: 0, check: (s) => (s.stats.playsBy[g.id] ?? 0) >= 1 },
    { id: `regular_${g.id}`, name: `${g.name}: Regular`, desc: `Play ${g.name} 200 times.`, branch: 'tables', gems: 1, check: (s) => (s.stats.playsBy[g.id] ?? 0) >= 200 },
    { id: `big_${g.id}`, name: `${g.name}: Big Win`, desc: `Win 10× your stake or more at ${g.name}.`, branch: 'tables', gems: 1, check: (s) => (s.stats.bestBy[g.id] ?? 0) >= 10 },
  );
}

A.push(
  { id: 'natural', name: 'Natural', desc: 'Get dealt a blackjack.', branch: 'feats', gems: 1, check: (s) => feat(s, 'blackjack') },
  { id: 'double_down', name: 'Double Down', desc: 'Win a doubled blackjack hand.', branch: 'feats', gems: 1, check: (s) => feat(s, 'bj_double_win') },
  { id: 'royal', name: 'Royal Flush', desc: 'Draw a royal flush at video poker.', branch: 'feats', gems: 5, check: (s) => feat(s, 'vp_royal'), secret: true },
  { id: 'quads', name: 'Four of a Kind', desc: 'Make four of a kind at video poker.', branch: 'feats', gems: 2, check: (s) => feat(s, 'vp_quads') },
  { id: 'jackpot', name: 'Crown Jackpot', desc: 'Hit the slots jackpot.', branch: 'feats', gems: 5, check: (s) => s.stats.jackpots > 0, secret: true },
  { id: 'free_spins', name: 'Seeing Stars', desc: 'Trigger free spins on Lucky Reels.', branch: 'feats', gems: 1, check: (s) => feat(s, 'free_spins') },
  { id: 'streak', name: 'Let It Ride', desc: 'Win five coin tosses in a row.', branch: 'feats', gems: 1, check: (s) => feat(s, 'coin_streak5') },
  { id: 'streak10', name: 'Unstoppable', desc: 'Win ten coin tosses in a row.', branch: 'feats', gems: 3, check: (s) => feat(s, 'coin_streak10'), secret: true },
  { id: 'longshot', name: 'Long Shot', desc: 'Win a dice roll paying 49× or more.', branch: 'feats', gems: 2, check: (s) => feat(s, 'dice_longshot') },
  { id: 'straight_up', name: 'Straight Up', desc: 'Win a single-number roulette bet.', branch: 'feats', gems: 1, check: (s) => feat(s, 'roulette_straight') },
  { id: 'edge_pocket', name: 'Edge of Glory', desc: 'Land a plinko ball in an edge pocket.', branch: 'feats', gems: 2, check: (s) => feat(s, 'plinko_edge') },
  { id: 'gold_segment', name: 'Golden Spin', desc: 'Hit the gold segment of the Fortune Wheel.', branch: 'feats', gems: 2, check: (s) => feat(s, 'wheel_gold') },
  { id: 'deep_mine', name: 'Deep Digger', desc: 'Uncover 8 gems in one Gem Mines round with 5 or more duds.', branch: 'feats', gems: 2, check: (s) => feat(s, 'mines_deep') },
  { id: 'keno_six', name: 'Six Catch', desc: 'Catch six or more numbers at Sky Keno.', branch: 'feats', gems: 2, check: (s) => feat(s, 'keno_six') },
  { id: 'moonshot', name: 'Moonshot', desc: 'Cash out an Airship Ascent at 20× or more.', branch: 'feats', gems: 2, check: (s) => feat(s, 'crash_20') },
  { id: 'tie', name: 'Dead Heat', desc: 'Win a tie bet at baccarat.', branch: 'feats', gems: 1, check: (s) => feat(s, 'bac_tie') },
  { id: 'outsider', name: 'Outsider', desc: 'Win a Sky Derby bet at 8.00 or longer.', branch: 'feats', gems: 2, check: (s) => feat(s, 'derby_long') },
  { id: 'flush_ante', name: 'Ante Up', desc: 'Win Casino Hold’em with a flush or better.', branch: 'feats', gems: 2, check: (s) => feat(s, 'holdem_flush') },
  { id: 'scratch_big', name: 'Golden Scratch', desc: 'Win 50× or more on a scratch card.', branch: 'feats', gems: 2, check: (s) => feat(s, 'scratch_50') },
  { id: 'broke', name: 'Down to the Felt', desc: 'Run out of chips. The well remembers you.', branch: 'feats', gems: 1, check: (s) => feat(s, 'broke'), secret: true },

  { id: 'patrons100', name: 'Full House', desc: 'Welcome 100 patrons.', branch: 'house', gems: 1, check: (s) => s.stats.patrons >= 100 },
  { id: 'patrons1000', name: 'Crowd Pleaser', desc: 'Welcome 1,000 patrons.', branch: 'house', gems: 2, check: (s) => s.stats.patrons >= 1000 },
  { id: 'patrons10000', name: 'Talk of the Skies', desc: 'Welcome 10,000 patrons.', branch: 'house', gems: 4, check: (s) => s.stats.patrons >= 10000 },
  { id: 'whale', name: 'Whale Watching', desc: 'Host a high roller from your airship dock.', branch: 'house', gems: 2, check: (s) => s.stats.vips > 0 },
  { id: 'tiles25', name: 'Room to Roll', desc: 'Grow the island to 25 tiles.', branch: 'house', gems: 1, check: (s) => s.tiles.size >= 25 },
  { id: 'tiles60', name: 'Resort', desc: 'Grow the island to 60 tiles.', branch: 'house', gems: 2, check: (s) => s.tiles.size >= 60 },
  { id: 'tiles120', name: 'Sky Strip', desc: 'Grow the island to 120 tiles.', branch: 'house', gems: 4, check: (s) => s.tiles.size >= 120 },
  { id: 'glamour50', name: 'Bright Lights', desc: 'Reach 50 glamour.', branch: 'house', gems: 1, check: (s) => s.cache.glamour >= 50 },
  { id: 'glamour200', name: 'Showplace', desc: 'Reach 200 glamour.', branch: 'house', gems: 2, check: (s) => s.cache.glamour >= 200 },
  { id: 'glamour600', name: 'Wonder of the Skies', desc: 'Reach 600 glamour.', branch: 'house', gems: 4, check: (s) => s.cache.glamour >= 600 },
  { id: 'all_tables', name: 'The Full Floor', desc: 'Own a table of every game.', branch: 'house', gems: 5, check: (s) => GAMES.every((g) => [...s.buildings.values()].some((b) => b.type === g.building)) },
  { id: 'max_table', name: 'Top Shelf', desc: 'Upgrade a table to level 10.', branch: 'house', gems: 3, check: (s) => [...s.buildings.values()].some((b) => b.level >= 10) },
  { id: 'take1m', name: 'The House Always Wins', desc: 'Earn 1,000,000 chips from patrons.', branch: 'house', gems: 3, check: (s) => s.stats.houseTake >= 1e6 },

  { id: 'chips1k', name: 'Pocket Money', desc: 'Hold 1,000 chips.', branch: 'fortune', gems: 0, check: (s) => s.stats.maxChips >= 1e3 },
  { id: 'chips100k', name: 'High Roller', desc: 'Hold 100,000 chips.', branch: 'fortune', gems: 1, check: (s) => s.stats.maxChips >= 1e5 },
  { id: 'chips10m', name: 'Tycoon', desc: 'Hold 10,000,000 chips.', branch: 'fortune', gems: 2, check: (s) => s.stats.maxChips >= 1e7 },
  { id: 'chips1b', name: 'Billionaire of the Skies', desc: 'Hold 1,000,000,000 chips.', branch: 'fortune', gems: 5, check: (s) => s.stats.maxChips >= 1e9 },
  { id: 'wagered1m', name: 'Action', desc: 'Wager 1,000,000 chips in total.', branch: 'fortune', gems: 2, check: (s) => s.stats.wagered >= 1e6 },
  { id: 'tokens_all', name: 'Lucky Collector', desc: 'Find every lucky token.', branch: 'fortune', gems: 5, check: (s) => TOKENS.every((t) => (s.tokens[t.id] ?? 0) > 0) },
  { id: 'level10', name: 'Known Face', desc: 'Reach renown level 10.', branch: 'fortune', gems: 1, check: (s) => s.renown.level >= 10 },
  { id: 'level20', name: 'Legend in the Making', desc: 'Reach renown level 20.', branch: 'fortune', gems: 2, check: (s) => s.renown.level >= 20 },
  { id: 'level30', name: 'Sky Royalty', desc: 'Reach renown level 30.', branch: 'fortune', gems: 4, check: (s) => s.renown.level >= 30 },
  { id: 'well100', name: 'Coin Fisher', desc: 'Fish the wishing well 100 times.', branch: 'fortune', gems: 1, check: (s) => s.stats.wellTaps >= 100 },
  { id: 'pokerforge', name: 'The Great Work', desc: 'Complete the Pokerforge.', branch: 'fortune', gems: 10, check: (s) => s.wonder.stage >= 3, secret: true },
);

export const ACHIEVEMENTS = A;
export const ACH: Record<string, AchDef> = Object.fromEntries(A.map((a) => [a.id, a]));
export const ACH_BRANCHES: { id: AchDef['branch']; name: string }[] = [
  { id: 'tables', name: 'Tables' },
  { id: 'feats', name: 'Feats' },
  { id: 'house', name: 'House' },
  { id: 'fortune', name: 'Fortune' },
];
