import { type Rand, shuffle } from '../rng';
import { type Card, Hand, best, category, eval5, rankOf, shoe, suitOf } from './cards';

// ───────────────────────── video poker: jacks or better (9/6) ─────────────────────────

export const VP_PAYS: { name: string; pay: number }[] = [
  { name: 'Royal Flush', pay: 800 },
  { name: 'Straight Flush', pay: 50 },
  { name: 'Four of a Kind', pay: 25 },
  { name: 'Full House', pay: 9 },
  { name: 'Flush', pay: 6 },
  { name: 'Straight', pay: 4 },
  { name: 'Three of a Kind', pay: 3 },
  { name: 'Two Pair', pay: 2 },
  { name: 'Jacks or Better', pay: 1 },
];

export interface VpRound { deck: Card[]; hand: Card[]; held: boolean[]; phase: 'deal' | 'draw' | 'done'; bet: number; result: { name: string; mult: number } | null }

export function vpDeal(r: Rand, bet: number): VpRound {
  const deck = shoe(r, 1);
  return { deck, hand: deck.splice(0, 5), held: [false, false, false, false, false], phase: 'draw', bet, result: null };
}

/** Name and return multiple (stake included) of a final hand; 0 if nothing. */
export function vpScore(hand: Card[]): { name: string; mult: number } {
  const cat = category(eval5(hand));
  const name = (n: string) => VP_PAYS.find((p) => p.name === n)!;
  const pick = (n: string) => ({ name: n, mult: name(n).pay });
  switch (cat) {
    case Hand.Royal: return pick('Royal Flush');
    case Hand.StraightFlush: return pick('Straight Flush');
    case Hand.Quads: return pick('Four of a Kind');
    case Hand.FullHouse: return pick('Full House');
    case Hand.Flush: return pick('Flush');
    case Hand.Straight: return pick('Straight');
    case Hand.Trips: return pick('Three of a Kind');
    case Hand.TwoPair: return pick('Two Pair');
    case Hand.Pair: {
      const counts = new Map<number, number>();
      for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
      for (const [rk, n] of counts) if (n === 2 && rk >= 9) return pick('Jacks or Better');
      return { name: 'Low Pair', mult: 0 };
    }
    default: return { name: 'No Win', mult: 0 };
  }
}

export function vpDraw(rd: VpRound): void {
  if (rd.phase !== 'draw') return;
  for (let i = 0; i < 5; i++) if (!rd.held[i]) rd.hand[i] = rd.deck.shift()!;
  rd.phase = 'done';
  rd.result = vpScore(rd.hand);
}

/**
 * A simple but strong hold strategy (a condensed Jacks-or-Better chart): made
 * hands first, then four to a flush or outside straight, high pairs/cards.
 */
export function vpAdvice(hand: Card[]): boolean[] {
  const ranks = hand.map(rankOf), suits = hand.map(suitOf);
  const hold = (pred: (i: number) => boolean) => hand.map((_, i) => pred(i));
  const made = vpScore(hand);
  const counts = new Map<number, number[]>();
  ranks.forEach((r, i) => counts.set(r, [...(counts.get(r) ?? []), i]));
  const cat = category(eval5(hand));
  if (cat >= Hand.Straight && cat !== Hand.Trips) return hold(() => true);
  if (cat === Hand.Quads) return hold((i) => (counts.get(ranks[i])?.length ?? 0) === 4);
  // four to a royal
  for (let s = 0; s < 4; s++) {
    const idx = hand.map((_, i) => i).filter((i) => suits[i] === s && ranks[i] >= 8);
    if (idx.length === 4) return hold((i) => idx.includes(i));
  }
  if (cat === Hand.Trips) return hold((i) => (counts.get(ranks[i])?.length ?? 0) === 3);
  if (cat === Hand.TwoPair) return hold((i) => (counts.get(ranks[i])?.length ?? 0) === 2);
  if (made.mult > 0) return hold((i) => (counts.get(ranks[i])?.length ?? 0) === 2);
  // four to a flush
  for (let s = 0; s < 4; s++) {
    const idx = hand.map((_, i) => i).filter((i) => suits[i] === s);
    if (idx.length === 4) return hold((i) => idx.includes(i));
  }
  // three to a royal
  for (let s = 0; s < 4; s++) {
    const idx = hand.map((_, i) => i).filter((i) => suits[i] === s && ranks[i] >= 8);
    if (idx.length === 3) return hold((i) => idx.includes(i));
  }
  // low pair
  for (const [, idx] of counts) if (idx.length === 2) return hold((i) => idx.includes(i));
  // four to an outside straight
  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  for (let lo = 0; lo <= 8; lo++) {
    const run = [lo, lo + 1, lo + 2, lo + 3];
    if (run.every((r) => uniq.includes(r)) && lo >= 1 && lo + 3 <= 11) {
      const used = new Set<number>();
      return hold((i) => { if (run.includes(ranks[i]) && !used.has(ranks[i])) { used.add(ranks[i]); return true; } return false; });
    }
  }
  // high cards (jack or better), at most two, suited preferred
  const high = hand.map((_, i) => i).filter((i) => ranks[i] >= 9).sort((a, b) => ranks[a] - ranks[b]);
  if (high.length) {
    const pick = high.slice(0, 2);
    return hold((i) => pick.includes(i));
  }
  return hold(() => false);
}

// ───────────────────────── baccarat ─────────────────────────

export const BAC_DECKS = 8;
export type BacBet = 'player' | 'banker' | 'tie' | 'ppair' | 'bpair';
export const BAC_PAYS: Record<BacBet, number> = { player: 2, banker: 1.95, tie: 9, ppair: 12, bpair: 12 };
export interface BacRound { shoe: Card[]; count: number; player: Card[]; banker: Card[]; winner: 'player' | 'banker' | 'tie' | null; history: ('player' | 'banker' | 'tie')[] }

export const bacValue = (c: Card): number => { const r = rankOf(c); return r === 12 ? 1 : r >= 8 ? 0 : r + 2; };
export const bacTotal = (cards: Card[]): number => cards.reduce((a, c) => a + bacValue(c), 0) % 10;

export function bacNew(r: Rand, prev?: BacRound): BacRound {
  const keep = prev && prev.shoe.length > 52;
  return { shoe: keep ? prev!.shoe : shoe(r, BAC_DECKS), count: keep ? prev!.count : 0, player: [], banker: [], winner: null, history: prev?.history.slice(-20) ?? [] };
}

export function bacPlay(rd: BacRound): void {
  const draw = () => { const c = rd.shoe.pop()!; const v = bacValue(c); rd.count += v <= 3 ? 1 : v >= 8 || v === 0 ? -1 : 0; return c; };
  rd.player = [draw(), draw()];
  rd.banker = [draw(), draw()];
  const p = bacTotal(rd.player), b = bacTotal(rd.banker);
  if (p < 8 && b < 8) {
    let third: Card | null = null;
    if (p <= 5) { third = draw(); rd.player.push(third); }
    const bt = bacTotal(rd.banker);
    if (third === null) { if (bt <= 5) rd.banker.push(draw()); }
    else {
      const t = bacValue(third);
      const drawB = bt <= 2 || (bt === 3 && t !== 8) || (bt === 4 && t >= 2 && t <= 7) || (bt === 5 && t >= 4 && t <= 7) || (bt === 6 && (t === 6 || t === 7));
      if (drawB) rd.banker.push(draw());
    }
  }
  const pt = bacTotal(rd.player), bt = bacTotal(rd.banker);
  rd.winner = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
  rd.history.push(rd.winner);
  if (rd.history.length > 24) rd.history.shift();
}

/** Return for a bet once the round is played (tie pushes player/banker). */
export function bacReturn(rd: BacRound, bet: BacBet, amount: number): number {
  if (bet === 'ppair') return rankOf(rd.player[0]) === rankOf(rd.player[1]) ? amount * BAC_PAYS.ppair : 0;
  if (bet === 'bpair') return rankOf(rd.banker[0]) === rankOf(rd.banker[1]) ? amount * BAC_PAYS.bpair : 0;
  if (bet === 'tie') return rd.winner === 'tie' ? amount * BAC_PAYS.tie : 0;
  if (rd.winner === 'tie') return amount;
  return rd.winner === bet ? amount * BAC_PAYS[bet] : 0;
}

// ───────────────────────── casino hold'em ─────────────────────────

/** Ante pays (profit multiple) by your hand when you win. */
export const HOLDEM_ANTE: Record<number, number> = { [Hand.Royal]: 100, [Hand.StraightFlush]: 20, [Hand.Quads]: 10, [Hand.FullHouse]: 3, [Hand.Flush]: 2 };
export interface HoldemRound { deck: Card[]; you: Card[]; dealer: Card[]; board: Card[]; ante: number; phase: 'flop' | 'done'; called: boolean; outcome: string; ret: number }

export function holdemDeal(r: Rand, ante: number): HoldemRound {
  const deck = shoe(r, 1);
  const you = deck.splice(0, 2), dealer = deck.splice(0, 2), board = deck.splice(0, 5);
  return { deck, you, dealer, board, ante, phase: 'flop', called: false, outcome: '', ret: 0 };
}

const antePay = (cat: number): number => HOLDEM_ANTE[cat] ?? 1;

/** Finish the hand: fold (lose the ante) or call (stake 2× ante already taken). Sets outcome and total return. */
export function holdemFinish(rd: HoldemRound, call: boolean): void {
  rd.phase = 'done';
  rd.called = call;
  if (!call) { rd.outcome = 'Folded'; rd.ret = 0; return; }
  const me = best([...rd.you, ...rd.board]), dl = best([...rd.dealer, ...rd.board]);
  const dCat = category(dl.score);
  const qualifies = dCat > Hand.Pair || (dCat === Hand.Pair && pairRank(dl.five) >= 2);
  const ante = rd.ante, callBet = ante * 2;
  if (!qualifies) { rd.outcome = 'Dealer does not qualify'; rd.ret = ante * (1 + antePay(category(me.score))) + callBet; return; }
  if (me.score > dl.score) { rd.outcome = 'You win'; rd.ret = ante * (1 + antePay(category(me.score))) + callBet * 2; return; }
  if (me.score === dl.score) { rd.outcome = 'Push'; rd.ret = ante + callBet; return; }
  rd.outcome = 'Dealer wins'; rd.ret = 0;
}

function pairRank(five: Card[]): number {
  const counts = new Map<number, number>();
  for (const c of five) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  for (const [r, n] of counts) if (n === 2) return r;
  return -1;
}

/** Call with a pair or better, a flush draw, a queen or better in hand, or a straight draw with a six or better; fold the rest (~14% of hands). */
export function holdemAdvice(rd: HoldemRound): 'call' | 'fold' {
  const cards = [...rd.you, ...rd.board.slice(0, 3)];
  if (category(best(cards).score) >= Hand.Pair) return 'call';
  const suits = new Map<number, number>();
  for (const c of cards) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
  if ([...suits.values()].some((n) => n >= 4)) return 'call';
  const hi = Math.max(...rd.you.map(rankOf));
  if (hi >= 10) return 'call';
  const ranks = [...new Set(cards.map(rankOf))].sort((a, b) => a - b);
  for (let i = 0; i + 3 < ranks.length; i++) if (ranks[i + 3] - ranks[i] <= 4 && hi >= 4) return 'call';
  return 'fold';
}

// ───────────────────────── sky derby ─────────────────────────

export interface Flyer { name: string; color: number; strength: number }
export const FLYERS: Flyer[] = [
  { name: 'Brass Comet', color: 0xe8b84a, strength: 0 },
  { name: 'Cloud Nine', color: 0xe8f0ff, strength: 0 },
  { name: 'Red Baron', color: 0xd8483a, strength: 0 },
  { name: 'Moonmoth', color: 0xb8a0f0, strength: 0 },
  { name: 'Greenwing', color: 0x6ac85a, strength: 0 },
  { name: 'Old Tempest', color: 0x5a8ad8, strength: 0 },
];
export const DERBY_EDGE = 0.95;

export interface DerbyCard { field: { flyer: number; p: number; place: number }[] }

/** Today's field: random strengths → win chances (Plackett–Luce). */
export function derbyCard(r: Rand): DerbyCard {
  const order = shuffle(r, [0, 1, 2, 3, 4, 5]);
  const w = order.map(() => 0.4 + r() * 1.6);
  const tot = w.reduce((a, b) => a + b, 0);
  const p = w.map((x) => x / tot);
  const place = p.map((pi, i) => pi + p.reduce((a, pj, j) => (j === i ? a : a + pj * pi / (1 - pj)), 0));
  return { field: order.map((f, i) => ({ flyer: f, p: p[i], place: place[i] })) };
}

export const derbyOdds = (p: number): number => Math.max(1.05, Math.floor((DERBY_EDGE / p) * 100) / 100);

/** Run the race: the finishing order (indices into the card's field). */
export function derbyRun(r: Rand, card: DerbyCard): number[] {
  const left = card.field.map((_, i) => i);
  const out: number[] = [];
  while (left.length) {
    const tot = left.reduce((a, i) => a + card.field[i].p, 0);
    let u = r() * tot;
    let pick = left[left.length - 1];
    for (const i of left) { if (u < card.field[i].p) { pick = i; break; } u -= card.field[i].p; }
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}
