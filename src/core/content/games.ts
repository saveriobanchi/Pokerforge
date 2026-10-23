/**
 * The casino games. Each lives in a table building on the island; tapping
 * the table opens it. A table's level raises its bet limit and the house
 * take it earns from patrons who sit at it.
 */
export type GameId =
  | 'coin' | 'slots' | 'dice' | 'scratch' | 'blackjack' | 'roulette' | 'plinko' | 'wheel'
  | 'poker' | 'mines' | 'keno' | 'crash' | 'baccarat' | 'derby' | 'holdem';

export interface GameDef {
  id: GameId;
  name: string;
  /** Building type that hosts it. */
  building: string;
  /** One line under the name. */
  tagline: string;
  /** How to play, shown in the table panel. */
  rules: string;
  /** Renown level that unlocks the table in the build tray. */
  level: number;
  /** Bet limits at table level 1 (max doubles every level). */
  minBet: number;
  maxBet: number;
  /** House take per seated patron per minute at table level 1. */
  patron: number;
  seats: number;
  /** Return to player with good play (for the info line). */
  rtp: number;
  /** A short label of what skill or choice matters. */
  flavor: string;
}

export const GAMES: GameDef[] = [
  { id: 'coin', name: 'Coin Toss', building: 'coin_stand', tagline: 'Call it in the air.', rules: 'Call heads or tails. A win pays 1.96×. Let it ride to stake your winnings on the next toss — five in a row earns a streak bonus.', level: 1, minBet: 1, maxBet: 10, patron: 1.2, seats: 1, rtp: 0.98, flavor: 'Nerve' },
  { id: 'slots', name: 'Lucky Reels', building: 'slots', tagline: 'Three reels and a crown jackpot.', rules: 'Pick a line bet and 1, 3 or 5 lines. Diamonds are wild and double a line. Three stars anywhere give free spins. Three crowns on a line win the progressive jackpot (scaled by your line bet).', level: 2, minBet: 1, maxBet: 5, patron: 2.4, seats: 2, rtp: 0.965, flavor: 'Luck' },
  { id: 'dice', name: 'Sky Dice', building: 'dice_table', tagline: 'Roll over, roll under.', rules: 'Pick a target and roll over or under it. The smaller your chance, the bigger the multiplier (98% return at any odds).', level: 3, minBet: 1, maxBet: 25, patron: 4, seats: 2, rtp: 0.98, flavor: 'Risk' },
  { id: 'scratch', name: 'Scratch Kiosk', building: 'scratch_kiosk', tagline: 'Three alike wins.', rules: 'Buy a card and scratch the nine panels. Three matching prizes win that prize. Gold cards cost more and pay bigger. Cards often hide lucky tokens.', level: 4, minBet: 5, maxBet: 50, patron: 5, seats: 1, rtp: 0.93, flavor: 'Treasure' },
  { id: 'blackjack', name: 'Blackjack', building: 'blackjack', tagline: 'Beat the dealer to 21.', rules: 'Get closer to 21 than the dealer without going over. Blackjack pays 3:2. Double on any two cards, split pairs once. Dealer stands on soft 17. Six-deck shoe.', level: 5, minBet: 5, maxBet: 50, patron: 10, seats: 3, rtp: 0.995, flavor: 'Skill' },
  { id: 'roulette', name: 'Roulette', building: 'roulette', tagline: 'Place your chips; the wheel decides.', rules: 'European wheel, one zero. Straight numbers pay 35:1, dozens and columns 2:1, red/black, odd/even and low/high 1:1. Place as many chips as you like, then spin.', level: 7, minBet: 5, maxBet: 100, patron: 20, seats: 3, rtp: 0.973, flavor: 'Choice' },
  { id: 'plinko', name: 'Plinko', building: 'plinko', tagline: 'Drop the ball, watch it bounce.', rules: 'Choose rows and risk, then drop balls. Each lands in a pocket that multiplies its bet. High risk: tiny centre, huge edges.', level: 9, minBet: 10, maxBet: 200, patron: 40, seats: 2, rtp: 0.98, flavor: 'Risk' },
  { id: 'wheel', name: 'Fortune Wheel', building: 'fortune_wheel', tagline: 'Spin for a multiplier.', rules: 'Pick a risk and spin. The pointer picks your multiplier. Low risk rarely loses; high risk mostly does, but the gold segment pays twenty times.', level: 11, minBet: 25, maxBet: 500, patron: 70, seats: 3, rtp: 0.97, flavor: 'Risk' },
  { id: 'poker', name: 'Video Poker', building: 'video_poker', tagline: 'Jacks or Better.', rules: 'Five cards are dealt. Hold the ones you want and draw once. Pairs of jacks or better pay. Royal flush pays 800×.', level: 13, minBet: 25, maxBet: 500, patron: 120, seats: 2, rtp: 0.995, flavor: 'Skill' },
  { id: 'mines', name: 'Gem Mines', building: 'gem_mine', tagline: 'Dig for gems, dodge the duds.', rules: 'Choose how many duds hide among 25 crates. Each gem you uncover raises the multiplier. Cash out any time — hit a dud and the bet is lost.', level: 15, minBet: 50, maxBet: 1000, patron: 220, seats: 2, rtp: 0.97, flavor: 'Nerve' },
  { id: 'keno', name: 'Sky Keno', building: 'keno', tagline: 'Pick numbers, hope they fall.', rules: 'Pick 1–10 numbers from 40. Ten balls are drawn; the more you catch, the more you win. The paytable depends on how many you picked.', level: 17, minBet: 100, maxBet: 2000, patron: 400, seats: 3, rtp: 0.95, flavor: 'Luck' },
  { id: 'crash', name: 'Airship Ascent', building: 'crash_pad', tagline: 'Cash out before it pops.', rules: 'The airship climbs and the multiplier rises. Cash out before the balloon bursts. Set an auto cash-out to play it safe.', level: 19, minBet: 250, maxBet: 4000, patron: 750, seats: 3, rtp: 0.97, flavor: 'Nerve' },
  { id: 'baccarat', name: 'Baccarat', building: 'baccarat', tagline: 'Player, Banker or Tie.', rules: 'Back Player (1:1), Banker (0.95:1) or Tie (8:1). Pair side bets pay 11:1. Cards are drawn by the classic tableau.', level: 21, minBet: 500, maxBet: 8000, patron: 1400, seats: 4, rtp: 0.989, flavor: 'Choice' },
  { id: 'derby', name: 'Sky Derby', building: 'derby', tagline: 'Six flyers, one finish line.', rules: 'Back a flyer to win, or to place (finish top two). Odds reflect form; the race decides. Watch it from the rail.', level: 23, minBet: 1000, maxBet: 16000, patron: 2600, seats: 4, rtp: 0.95, flavor: 'Read' },
  { id: 'holdem', name: 'Casino Hold’em', building: 'holdem', tagline: 'Your hand against the dealer.', rules: 'Ante, see two cards and the flop, then call (2× ante) or fold. The dealer needs a pair of fours to qualify. Ante pays up to 100:1 for a royal.', level: 25, minBet: 2500, maxBet: 32000, patron: 5000, seats: 4, rtp: 0.987, flavor: 'Skill' },
];

export const GAME: Record<GameId, GameDef> = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameDef>;
export const GAME_IDS = GAMES.map((g) => g.id);
export const GAME_BY_BUILDING: Record<string, GameDef> = Object.fromEntries(GAMES.map((g) => [g.building, g]));

/** Table levels. */
export const MAX_TABLE_LEVEL = 10;
/** Bet limit multiplier per table level. */
export const levelBetMult = (level: number): number => 2 ** (level - 1);
/** Patron take multiplier per table level. */
export const levelTakeMult = (level: number): number => 1.5 ** (level - 1);

/** Mastery: plays needed for each star (five stars, then grandmaster stars every 5000). */
export const MASTERY_AT = [25, 100, 300, 1000, 2500];
export const MASTERY_STARS = 5;
export function masteryStar(plays: number): number {
  let n = 0;
  for (const t of MASTERY_AT) if (plays >= t) n++;
  if (plays >= MASTERY_AT[MASTERY_AT.length - 1]) n += Math.floor((plays - MASTERY_AT[MASTERY_AT.length - 1]) / 5000);
  return n;
}
export function nextStarAt(plays: number): number {
  for (const t of MASTERY_AT) if (plays < t) return t;
  const last = MASTERY_AT[MASTERY_AT.length - 1];
  return last + (Math.floor((plays - last) / 5000) + 1) * 5000;
}
/** Win-profit bonus from mastery: +0.6% per star for the first five, +0.2% per grandmaster star. */
export function masteryBonus(stars: number): number {
  return Math.min(stars, 5) * 0.006 + Math.max(0, stars - 5) * 0.002;
}
