import type { Rand } from '../rng';
import { type Card, rankOf, shoe } from './cards';

/**
 * Six-deck blackjack: dealer stands on soft 17 and peeks for blackjack,
 * blackjack pays 3:2, double on any two cards, split once (split aces take
 * one card each). Rounds are plain objects so they survive a reload.
 */
export const BJ_DECKS = 6;
export const BJ_RESHUFFLE = 0.25; // reshuffle when a quarter of the shoe is left

export interface BjHand { cards: Card[]; bet: number; done: boolean; doubled: boolean; fromSplit: boolean }
export interface BjRound {
  shoe: Card[];
  /** Hi-lo running count since the last shuffle. */
  count: number;
  hands: BjHand[];
  active: number;
  dealer: Card[];
  phase: 'bet' | 'play' | 'done';
  /** Per hand: result after settling. */
  results: { outcome: 'win' | 'lose' | 'push' | 'blackjack'; ret: number }[];
}

export const cardValue = (c: Card): number => {
  const r = rankOf(c);
  return r === 12 ? 11 : r >= 8 ? 10 : r + 2;
};

export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let t = 0, aces = 0;
  for (const c of cards) { t += cardValue(c); if (rankOf(c) === 12) aces++; }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
export const isBlackjack = (h: BjHand | Card[]): boolean => {
  const cards = Array.isArray(h) ? h : h.cards;
  return cards.length === 2 && handTotal(cards).total === 21 && (Array.isArray(h) || !h.fromSplit);
};

const hiLo = (c: Card): number => { const v = cardValue(c); return v <= 6 ? 1 : v >= 10 ? -1 : 0; };

export function newRound(r: Rand, prev?: BjRound): BjRound {
  const keep = prev && prev.shoe.length > BJ_DECKS * 52 * BJ_RESHUFFLE;
  return { shoe: keep ? prev!.shoe : shoe(r, BJ_DECKS), count: keep ? prev!.count : 0, hands: [], active: 0, dealer: [], phase: 'bet', results: [] };
}

function draw(rd: BjRound): Card {
  const c = rd.shoe.pop()!;
  rd.count += hiLo(c);
  return c;
}

/** Deal a hand for `bet`. Returns true if the round finished at once (a blackjack either side). */
export function deal(rd: BjRound, bet: number): boolean {
  rd.hands = [{ cards: [draw(rd), 0], bet, done: false, doubled: false, fromSplit: false }];
  rd.dealer = [draw(rd)];
  rd.hands[0].cards[1] = draw(rd);
  rd.dealer.push(draw(rd));
  // the hole card is not counted until revealed
  rd.count -= hiLo(rd.dealer[1]);
  rd.active = 0;
  rd.phase = 'play';
  rd.results = [];
  if (isBlackjack(rd.dealer) || isBlackjack(rd.hands[0])) { finish(rd); return true; }
  return false;
}

export function canDouble(rd: BjRound): boolean {
  const h = rd.hands[rd.active];
  return rd.phase === 'play' && !!h && h.cards.length === 2 && !h.done;
}
export function canSplit(rd: BjRound): boolean {
  const h = rd.hands[rd.active];
  return rd.phase === 'play' && rd.hands.length === 1 && !!h && h.cards.length === 2 && cardValue(h.cards[0]) === cardValue(h.cards[1]);
}

function advance(rd: BjRound): void {
  while (rd.active < rd.hands.length && rd.hands[rd.active].done) rd.active++;
  if (rd.active >= rd.hands.length) finish(rd);
}

export function hit(rd: BjRound): void {
  const h = rd.hands[rd.active];
  if (!h || rd.phase !== 'play') return;
  h.cards.push(draw(rd));
  if (handTotal(h.cards).total >= 21) h.done = true;
  advance(rd);
}

export function stand(rd: BjRound): void {
  const h = rd.hands[rd.active];
  if (!h || rd.phase !== 'play') return;
  h.done = true;
  advance(rd);
}

/** Double: the caller has already taken the extra stake. */
export function double(rd: BjRound): void {
  const h = rd.hands[rd.active];
  if (!canDouble(rd)) return;
  h.bet *= 2;
  h.doubled = true;
  h.cards.push(draw(rd));
  h.done = true;
  advance(rd);
}

/** Split: the caller has already taken the second stake. */
export function split(rd: BjRound): void {
  if (!canSplit(rd)) return;
  const h = rd.hands[0];
  const aces = rankOf(h.cards[0]) === 12;
  const a: BjHand = { cards: [h.cards[0], draw(rd)], bet: h.bet, done: aces, doubled: false, fromSplit: true };
  const b: BjHand = { cards: [h.cards[1], draw(rd)], bet: h.bet, done: aces, doubled: false, fromSplit: true };
  for (const x of [a, b]) if (handTotal(x.cards).total === 21) x.done = true;
  rd.hands = [a, b];
  rd.active = 0;
  advance(rd);
}

function finish(rd: BjRound): void {
  rd.count += hiLo(rd.dealer[1]);
  const anyLive = rd.hands.some((h) => handTotal(h.cards).total <= 21) && !isBlackjack(rd.hands[0]);
  const dealerBj = isBlackjack(rd.dealer);
  if (anyLive && !dealerBj) {
    while (true) {
      const t = handTotal(rd.dealer);
      if (t.total > 17 || (t.total === 17)) break; // stands on all 17s
      rd.dealer.push(draw(rd));
    }
  }
  const d = handTotal(rd.dealer).total;
  rd.results = rd.hands.map((h) => {
    const p = handTotal(h.cards).total;
    if (isBlackjack(h)) return dealerBj ? { outcome: 'push', ret: h.bet } : { outcome: 'blackjack', ret: h.bet * 2.5 };
    if (dealerBj) return { outcome: 'lose', ret: 0 };
    if (p > 21) return { outcome: 'lose', ret: 0 };
    if (d > 21 || p > d) return { outcome: 'win', ret: h.bet * 2 };
    if (p === d) return { outcome: 'push', ret: h.bet };
    return { outcome: 'lose', ret: 0 };
  });
  rd.phase = 'done';
}

/** True count (running count per remaining deck), for the counter perk. */
export const trueCount = (rd: BjRound): number => rd.count / Math.max(0.5, rd.shoe.length / 52);

/**
 * Basic strategy for S17, double any two, no surrender, DAS: what to do with
 * the active hand against the dealer's up card.
 */
export function basic(rd: BjRound): 'hit' | 'stand' | 'double' | 'split' {
  const h = rd.hands[rd.active];
  const up = cardValue(rd.dealer[0]);
  const { total, soft } = handTotal(h.cards);
  const two = h.cards.length === 2;
  if (canSplit(rd)) {
    const v = cardValue(h.cards[0]);
    if (v === 11 || v === 8) return 'split';
    if (v === 9 && ![7, 10, 11].includes(up)) return 'split';
    if ((v === 7 || v === 2 || v === 3) && up <= 7) return 'split';
    if (v === 6 && up <= 6) return 'split';
    if (v === 4 && (up === 5 || up === 6)) return 'split';
  }
  if (soft && total <= 21) {
    if (total >= 19) return total === 19 && up === 6 && two ? 'double' : 'stand';
    if (total === 18) { if (up >= 3 && up <= 6 && two) return 'double'; return up >= 9 ? 'hit' : 'stand'; }
    if (two && ((total === 17 && up >= 3 && up <= 6) || ((total === 15 || total === 16) && up >= 4 && up <= 6) || ((total === 13 || total === 14) && up >= 5 && up <= 6))) return 'double';
    return 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return up <= 6 ? 'stand' : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (total === 11) return two ? 'double' : 'hit';
  if (total === 10) return two && up <= 9 ? 'double' : 'hit';
  if (total === 9) return two && up >= 3 && up <= 6 ? 'double' : 'hit';
  return 'hit';
}
