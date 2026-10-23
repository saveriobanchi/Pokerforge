/**
 * Renown perks: one point per level (and from goals). Spent here, they bend
 * the house a little toward you.
 */
export type PerkBranch = 'fortune' | 'house' | 'craft';

export interface PerkDef {
  id: string;
  name: string;
  branch: PerkBranch;
  max: number;
  /** Renown level needed for the first rank. */
  level: number;
  desc: (rank: number) => string;
}

export const PERKS: PerkDef[] = [
  // Fortune — your own play
  { id: 'favor', name: 'Lady’s Favor', branch: 'fortune', max: 5, level: 2, desc: (r) => `Win profits +${r}%` },
  { id: 'highroller', name: 'High Roller', branch: 'fortune', max: 5, level: 3, desc: (r) => `Bet limits +${r * 20}%` },
  { id: 'scholar', name: 'Quick Study', branch: 'fortune', max: 5, level: 2, desc: (r) => `Renown XP +${r * 10}%` },
  { id: 'second', name: 'Second Chance', branch: 'fortune', max: 3, level: 6, desc: (r) => `${r * 2}% of losing bets are half refunded` },
  { id: 'finder', name: 'Treasure Hunter', branch: 'fortune', max: 4, level: 4, desc: (r) => `Lucky tokens turn up ${r * 25}% more often` },
  { id: 'nightowl', name: 'Night Owl', branch: 'fortune', max: 3, level: 8, desc: (r) => `At night: XP +${r * 15}%, win profits +${r}%` },
  // House — the casino
  { id: 'host', name: 'Gracious Host', branch: 'house', max: 5, level: 3, desc: (r) => `Patrons’ take +${r * 15}%` },
  { id: 'lights', name: 'Bright Lights', branch: 'house', max: 5, level: 4, desc: (r) => `Patrons arrive ${r * 12}% faster` },
  { id: 'tills', name: 'Deep Tills', branch: 'house', max: 4, level: 5, desc: (r) => `Tills hold ${r * 50}% more` },
  { id: 'loyal', name: 'Loyalty Club', branch: 'house', max: 4, level: 5, desc: (r) => `Comps +${(r * 0.5).toFixed(1)}% of every wager` },
  { id: 'builder', name: 'Master Carpenter', branch: 'house', max: 5, level: 7, desc: (r) => `Table upgrades cost ${r * 6}% less` },
  { id: 'wellspring', name: 'Wishing Wellspring', branch: 'house', max: 3, level: 2, desc: (r) => `The well holds ${r * 4} more and pays ${r * 50}% more` },
  // Craft — game-specific skills
  { id: 'cardsense', name: 'Card Sense', branch: 'craft', max: 1, level: 5, desc: () => 'Blackjack, video poker and hold’em suggest the best play' },
  { id: 'counter', name: 'Card Counter', branch: 'craft', max: 1, level: 9, desc: () => 'Blackjack and baccarat show the running count of the shoe' },
  { id: 'jackpot', name: 'Jackpot Fever', branch: 'craft', max: 3, level: 4, desc: (r) => `Slots feed the jackpot ${r * 30}% faster` },
  { id: 'streak', name: 'Hot Hand', branch: 'craft', max: 3, level: 6, desc: (r) => `Coin streak bonus ×${1 + r}; dice wins of 10× or more +${r * 5}%` },
  { id: 'scout', name: 'Race Scout', branch: 'craft', max: 1, level: 23, desc: () => 'Sky Derby shows each flyer’s true chance' },
];
export const PERK: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
export const PERK_BRANCHES: { id: PerkBranch; name: string }[] = [
  { id: 'fortune', name: 'Fortune' },
  { id: 'house', name: 'House' },
  { id: 'craft', name: 'Craft' },
];
/** Endless perk once everything else is bought: +0.5% to win profits and patron take per rank. */
export const FORTUNE_PERK = { id: 'fortune', name: 'Fortune’s Child', desc: (r: number) => `Win profits and patrons’ take +${(r * 0.5).toFixed(1)}%` };
