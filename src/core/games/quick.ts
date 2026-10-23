import { type Rand, randInt, shuffle, weighted } from '../rng';

// ───────────────────────── coin toss ─────────────────────────

export const COIN_PAY = 1.96;
/** Streak bonus on cashing out after this many wins in a row (×2 with five, ×3 with ten). */
export const COIN_STREAK = 5;
export const COIN_MAX_RIDE = 10;

export function toss(r: Rand): 'heads' | 'tails' {
  return r() < 0.5 ? 'heads' : 'tails';
}

// ───────────────────────── dice ─────────────────────────

/** Rolls are 0.00–99.99; a target is in hundredths (100 … 9800). */
export const DICE_EDGE = 0.98;
export function diceChance(target: number, over: boolean): number {
  return over ? (9999 - target) / 10000 : target / 10000;
}
export function diceMult(target: number, over: boolean): number {
  return Math.floor((DICE_EDGE / diceChance(target, over)) * 10000) / 10000;
}
export function rollDice(r: Rand): number {
  return randInt(r, 10000);
}
export function diceWins(roll: number, target: number, over: boolean): boolean {
  return over ? roll > target : roll < target;
}

// ───────────────────────── airship ascent (crash) ─────────────────────────

export const CRASH_EDGE = 0.97;
/** The multiplier the balloon bursts at (≥ 1.00, two decimals). P(burst ≥ x) = 0.97 / x. */
export function crashPoint(r: Rand): number {
  const u = r();
  return Math.max(1, Math.floor((CRASH_EDGE / (1 - u)) * 100) / 100);
}
/** Multiplier shown t seconds into a flight. */
export const crashCurve = (t: number): number => Math.floor(Math.exp(0.11 * t) * 100) / 100;
/** Seconds until the curve reaches m. */
export const crashTime = (m: number): number => Math.log(m) / 0.11;

// ───────────────────────── gem mines ─────────────────────────

export const MINES_CELLS = 25;
export const MINES_EDGE = 0.97;
export function minesMult(mines: number, gems: number): number {
  if (gems === 0) return 1;
  let m = MINES_EDGE;
  for (let i = 0; i < gems; i++) m *= (MINES_CELLS - i) / (MINES_CELLS - mines - i);
  return Math.floor(m * 100) / 100;
}
export function layMines(r: Rand, mines: number): number[] {
  return shuffle(r, Array.from({ length: MINES_CELLS }, (_, i) => i)).slice(0, mines).sort((a, b) => a - b);
}

// ───────────────────────── plinko ─────────────────────────

export type Risk = 'low' | 'medium' | 'high';
export const PLINKO_ROWS = [8, 12, 16];
export const PLINKO: Record<number, Record<Risk, number[]>> = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};
/** A ball's path: one bounce per row (0 left, 1 right); the pocket is the count of rights. */
export function dropBall(r: Rand, rows: number): { path: number[]; pocket: number } {
  const path: number[] = [];
  for (let i = 0; i < rows; i++) path.push(r() < 0.5 ? 0 : 1);
  return { path, pocket: path.reduce((a, b) => a + b, 0) };
}
export function plinkoRtp(rows: number, risk: Risk): number {
  const m = PLINKO[rows][risk];
  let c = 1, total = 0;
  for (let k = 0; k <= rows; k++) {
    total += m[k] * c;
    c = (c * (rows - k)) / (k + 1);
  }
  return total / 2 ** rows;
}

// ───────────────────────── fortune wheel ─────────────────────────

/** Thirty segments per risk, spread around the wheel. */
const WHEEL_DEF: Record<Risk, [number, number][]> = {
  low: [[0, 9], [1.2, 13], [1.5, 7], [3, 1]],
  medium: [[0, 16], [1.5, 6], [2, 5], [3, 2], [4, 1]],
  high: [[0, 27], [2, 1], [7, 1], [20, 1]],
};
function spread(def: [number, number][]): number[] {
  // interleave so equal segments are spaced around the rim (deterministic)
  const n = def.reduce((a, d) => a + d[1], 0);
  const slots: (number | null)[] = Array(n).fill(null);
  const sorted = [...def].sort((a, b) => a[1] - b[1]);
  for (const [m, count] of sorted) {
    for (let i = 0; i < count; i++) {
      let p = Math.floor(((i + 0.5) * n) / count + m * 7) % n;
      while (slots[p] !== null) p = (p + 1) % n;
      slots[p] = m;
    }
  }
  return slots as number[];
}
export const WHEEL: Record<Risk, number[]> = { low: spread(WHEEL_DEF.low), medium: spread(WHEEL_DEF.medium), high: spread(WHEEL_DEF.high) };
export function spinWheel(r: Rand, risk: Risk): { index: number; mult: number } {
  const seg = WHEEL[risk];
  const index = randInt(r, seg.length);
  return { index, mult: seg[index] };
}
export const wheelRtp = (risk: Risk): number => WHEEL[risk].reduce((a, b) => a + b, 0) / WHEEL[risk].length;

// ───────────────────────── keno ─────────────────────────

export const KENO_NUMBERS = 40;
export const KENO_DRAWN = 10;
/** Return multiples by picks (index) and hits. */
export const KENO_PAY: number[][] = [
  [],
  [0, 3.8],
  [0, 1, 10],
  [0, 0.5, 3, 25],
  [0, 0, 2, 8, 90],
  [0, 0, 1, 4, 20, 400],
  [0, 0, 0.5, 3, 9, 70, 1000],
  [0, 0, 0.5, 1.5, 6, 30, 200, 2000],
  [0, 0, 0.3, 1, 4, 12, 90, 1000, 5000],
  [0, 0, 0, 1, 2.5, 8, 45, 400, 2500, 10000],
  [0, 0, 0, 0.5, 1.8, 5, 30, 200, 1000, 5000, 10000],
];
export function drawKeno(r: Rand): number[] {
  return shuffle(r, Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1)).slice(0, KENO_DRAWN);
}
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let v = 1;
  for (let i = 1; i <= k; i++) v = (v * (n - k + i)) / i;
  return v;
}
export function kenoRtp(picks: number): number {
  let t = 0;
  for (let h = 0; h <= picks; h++) t += KENO_PAY[picks][h] * choose(picks, h) * choose(KENO_NUMBERS - picks, KENO_DRAWN - h) / choose(KENO_NUMBERS, KENO_DRAWN);
  return t;
}

// ───────────────────────── roulette ─────────────────────────

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** European wheel order (for the animation). */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
/** Bet ids: 'n17', 'red', 'black', 'odd', 'even', 'low', 'high', 'd1'..'d3', 'c1'..'c3'. */
export function rouletteCovers(bet: string, n: number): boolean {
  if (bet.startsWith('n')) return Number(bet.slice(1)) === n;
  if (n === 0) return false;
  switch (bet) {
    case 'red': return RED.has(n);
    case 'black': return !RED.has(n);
    case 'odd': return n % 2 === 1;
    case 'even': return n % 2 === 0;
    case 'low': return n <= 18;
    case 'high': return n >= 19;
    case 'd1': return n <= 12;
    case 'd2': return n > 12 && n <= 24;
    case 'd3': return n > 24;
    case 'c1': return n % 3 === 1;
    case 'c2': return n % 3 === 2;
    case 'c3': return n % 3 === 0;
    default: return false;
  }
}
/** Return multiple (stake included) if the bet wins. */
export function roulettePays(bet: string): number {
  if (bet.startsWith('n')) return 36;
  if (bet.startsWith('d') || bet.startsWith('c')) return 3;
  return 2;
}
export const spinRoulette = (r: Rand): number => randInt(r, 37);

// ───────────────────────── scratch cards ─────────────────────────

export type TicketId = 'bronze' | 'silver' | 'gold';
export interface TicketDef { id: TicketId; name: string; price: number; prizes: [number, number][]; tokenMult: number }
/** Price is a multiple of the bet unit; prizes are [return multiple of price, chance]. */
export const TICKETS: TicketDef[] = [
  { id: 'bronze', name: 'Bronze Clover', price: 1, prizes: [[1, 0.15], [2, 0.08], [3, 0.05], [5, 0.03], [10, 0.015], [25, 0.004], [100, 0.0008]], tokenMult: 3 },
  { id: 'silver', name: 'Silver Horseshoe', price: 4, prizes: [[2, 0.08], [5, 0.03], [10, 0.02], [20, 0.008], [50, 0.003], [250, 0.0005]], tokenMult: 5 },
  { id: 'gold', name: 'Gold Crown', price: 20, prizes: [[3, 0.06], [10, 0.025], [50, 0.004], [200, 0.001], [1000, 0.0001]], tokenMult: 8 },
];
export const TICKET: Record<TicketId, TicketDef> = Object.fromEntries(TICKETS.map((t) => [t.id, t])) as Record<TicketId, TicketDef>;
export const ticketRtp = (t: TicketDef): number => t.prizes.reduce((a, [m, p]) => a + m * p, 0);

/** A card: the prize multiple won (0 = none) and nine panels showing prize tiers (indices into prizes). */
export function scratchCard(r: Rand, t: TicketDef): { win: number; tier: number; cells: number[] } {
  const u = r();
  let acc = 0, tier = -1;
  for (let i = 0; i < t.prizes.length; i++) { acc += t.prizes[i][1]; if (u < acc) { tier = i; break; } }
  const kinds = t.prizes.length;
  const cells: number[] = [];
  if (tier >= 0) cells.push(tier, tier, tier);
  // fill the rest so no other tier appears three times (and the winner not a fourth)
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  while (cells.length < 9) {
    const k = randInt(r, kinds);
    const cap = k === tier ? 3 : 2;
    if ((counts.get(k) ?? 0) >= cap) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    cells.push(k);
  }
  shuffle(r, cells);
  return { win: tier >= 0 ? t.prizes[tier][0] : 0, tier, cells };
}

// ───────────────────────── helpers ─────────────────────────

export { weighted };
