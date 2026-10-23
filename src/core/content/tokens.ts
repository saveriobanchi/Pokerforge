/**
 * Lucky tokens: rare finds that drop from bets (more often on big wins and
 * scratch cards). Four sets of four; a complete set grants a lasting bonus.
 * Duplicates become gems.
 */
export interface TokenDef { id: string; name: string; set: string }
export interface TokenSet { id: string; name: string; bonus: string; tokens: string[] }

export const TOKEN_SETS: TokenSet[] = [
  { id: 'charms', name: 'Lucky Charms', bonus: 'Win profits +2%', tokens: ['clover', 'horseshoe', 'rabbit_foot', 'ladybug'] },
  { id: 'relics', name: 'Gambler’s Relics', bonus: 'Bet limits +25%', tokens: ['golden_dice', 'ace_spades', 'red_chip', 'marked_card'] },
  { id: 'night', name: 'Night Sky', bonus: 'Patrons’ take +20%', tokens: ['moon', 'star', 'comet', 'owl'] },
  { id: 'treasure', name: 'Sky Treasure', bonus: 'Comps +1% and XP +15%', tokens: ['pearl', 'ruby', 'emerald', 'crown'] },
];

const NAMES: Record<string, string> = {
  clover: 'Four-Leaf Clover', horseshoe: 'Horseshoe', rabbit_foot: 'Rabbit’s Foot', ladybug: 'Ladybug',
  golden_dice: 'Golden Dice', ace_spades: 'Ace of Spades', red_chip: 'Red Chip', marked_card: 'Marked Card',
  moon: 'Crescent Moon', star: 'Wishing Star', comet: 'Comet', owl: 'Night Owl',
  pearl: 'Cloud Pearl', ruby: 'Ruby', emerald: 'Emerald', crown: 'Little Crown',
};

export const TOKENS: TokenDef[] = TOKEN_SETS.flatMap((s) => s.tokens.map((t) => ({ id: t, name: NAMES[t], set: s.id })));
export const TOKEN: Record<string, TokenDef> = Object.fromEntries(TOKENS.map((t) => [t.id, t]));

/** Base chance per bet; multiplied for big wins and scratch cards. */
export const TOKEN_CHANCE = 0.006;
