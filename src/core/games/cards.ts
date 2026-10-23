import { type Rand, shuffle } from '../rng';

/**
 * Cards are numbers 0..51: rank = c % 13 (0 = two … 8 = ten, 9 = jack,
 * 10 = queen, 11 = king, 12 = ace), suit = ⌊c / 13⌋ (♠ ♥ ♦ ♣).
 */
export type Card = number;
export const rankOf = (c: Card): number => c % 13;
export const suitOf = (c: Card): number => Math.floor(c / 13);
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const isRed = (c: Card): boolean => suitOf(c) === 1 || suitOf(c) === 2;
export const cardName = (c: Card): string => RANKS[rankOf(c)] + SUITS[suitOf(c)];

export function shoe(r: Rand, decks: number): Card[] {
  const a: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) a.push(c);
  return shuffle(r, a);
}

/** Hand categories, low to high. */
export const HAND_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
export const enum Hand { High, Pair, TwoPair, Trips, Straight, Flush, FullHouse, Quads, StraightFlush, Royal }

/**
 * Evaluate exactly five cards. Returns a comparable score: category × 15⁵ +
 * tie-break ranks (higher is better).
 */
export function eval5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // wheel A-2-3-4-5
  }
  const pack = (cat: number, ks: number[]) => ks.reduce((a, k) => a * 15 + k, cat) * 15 ** (5 - ks.length);
  if (straightHigh >= 0 && flush) return pack(straightHigh === 12 ? Hand.Royal : Hand.StraightFlush, [straightHigh]);
  if (groups[0][1] === 4) return pack(Hand.Quads, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(Hand.FullHouse, [groups[0][0], groups[1][0]]);
  if (flush) return pack(Hand.Flush, ranks);
  if (straightHigh >= 0) return pack(Hand.Straight, [straightHigh]);
  if (groups[0][1] === 3) return pack(Hand.Trips, groups.map((g) => g[0]));
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(Hand.TwoPair, groups.map((g) => g[0]));
  if (groups[0][1] === 2) return pack(Hand.Pair, groups.map((g) => g[0]));
  return pack(Hand.High, ranks);
}

export const category = (score: number): number => Math.floor(score / 15 ** 5);

/** Best five of any number of cards: score and the five cards. */
export function best(cards: Card[]): { score: number; five: Card[] } {
  let bestScore = -1, five: Card[] = [];
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  const rec = (start: number, depth: number) => {
    if (depth === 5) {
      const pick = idx.map((i) => cards[i]);
      const s = eval5(pick);
      if (s > bestScore) { bestScore = s; five = pick; }
      return;
    }
    for (let i = start; i <= n - (5 - depth); i++) { idx[depth] = i; rec(i + 1, depth + 1); }
  };
  rec(0, 0);
  return { score: bestScore, five };
}
