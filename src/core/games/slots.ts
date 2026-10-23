import { type Rand, randInt } from '../rng';

/**
 * Lucky Reels: three reels, a 3×3 window, up to five lines.
 * Symbols: C cherry, L lemon, B bell, R bar, 7 seven, D diamond (wild,
 * doubles), K crown (jackpot), S star (scatter: free spins).
 */
export type Sym = 'C' | 'L' | 'B' | 'R' | '7' | 'D' | 'K' | 'S';
export const SYMS: Sym[] = ['C', 'L', 'B', 'R', '7', 'D', 'K', 'S'];
export const SYM_NAME: Record<Sym, string> = { C: 'Cherry', L: 'Lemon', B: 'Bell', R: 'Bar', '7': 'Seven', D: 'Diamond', K: 'Crown', S: 'Star' };

export const STRIPS: string[] = [
  'CLBLRCL7BLCDLBRLCSLBC7LRBKLCBLRS',
  'LCBRLC7LBDLCRBLSCLB7RLCBLKRCLBLS',
  'CBLRCL7LBCDRLBCSLR7BLCLKBRLCLBSL',
];

/** Paylines as row indices per reel (0 top, 1 middle, 2 bottom). */
export const LINES: number[][] = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
export const LINE_CHOICES = [1, 3, 5];

/** Three of a kind (wilds substitute for C..7). */
export const PAYS: Partial<Record<Sym, number>> = { C: 3, L: 4, B: 10, R: 25, '7': 80, D: 200 };
/** Cherry on reel one pays 1×; cherries on reels one and two pay 2×. */
export const FREE_SPINS = 6;

export interface SpinResult {
  stops: number[];
  /** window[reel][row] */
  window: Sym[][];
  lines: { line: number; mult: number; sym: Sym }[];
  /** Total multiple of the line bet won (not counting jackpot). */
  total: number;
  jackpotLines: number;
  scatter: number;
  freeSpins: number;
}

export function windowAt(stops: number[]): Sym[][] {
  return stops.map((p, r) => {
    const s = STRIPS[r], n = s.length;
    return [s[(p - 1 + n) % n], s[p], s[(p + 1) % n]] as Sym[];
  });
}

/** Multiple of the line bet a line pays, and whether it is a crown jackpot. */
export function linePay(a: Sym, b: Sym, c: Sym): { mult: number; sym: Sym; jackpot: boolean } {
  if (a === 'K' && b === 'K' && c === 'K') return { mult: 0, sym: 'K', jackpot: true };
  const wild = (s: Sym) => s === 'D';
  const syms = [a, b, c];
  const nW = syms.filter(wild).length;
  if (nW === 3) return { mult: PAYS.D!, sym: 'D', jackpot: false };
  const base = syms.find((s) => !wild(s))!;
  if (base !== 'K' && base !== 'S' && syms.every((s) => s === base || wild(s))) return { mult: PAYS[base]! * 2 ** nW, sym: base, jackpot: false };
  // cherries count from the left; a wild may stand in for a cherry
  const ch = (s: Sym) => s === 'C' || wild(s);
  if (a === 'C' && ch(b)) return { mult: 2 * (wild(b) ? 2 : 1), sym: 'C', jackpot: false };
  if (a === 'C') return { mult: 1, sym: 'C', jackpot: false };
  return { mult: 0, sym: a, jackpot: false };
}

export function evaluate(stops: number[], lines: number): SpinResult {
  const window = windowAt(stops);
  const out: SpinResult = { stops, window, lines: [], total: 0, jackpotLines: 0, scatter: 0, freeSpins: 0 };
  for (let i = 0; i < lines; i++) {
    const L = LINES[i];
    const p = linePay(window[0][L[0]], window[1][L[1]], window[2][L[2]]);
    if (p.jackpot) { out.jackpotLines++; out.lines.push({ line: i, mult: 0, sym: 'K' }); continue; }
    if (p.mult > 0) { out.lines.push({ line: i, mult: p.mult, sym: p.sym }); out.total += p.mult; }
  }
  for (const reel of window) for (const s of reel) if (s === 'S') out.scatter++;
  if (out.scatter >= 3) out.freeSpins = FREE_SPINS;
  return out;
}

export function spin(r: Rand, lines: number): SpinResult {
  return evaluate(STRIPS.map((s) => randInt(r, s.length)), lines);
}

/**
 * Exact return per line (excluding the jackpot) including the value of free
 * spins, plus the per-spin chance of a crown line.
 */
export function theory(): { line: number; withFree: number; trigger: number; crown: number } {
  const n = STRIPS.map((s) => s.length);
  let sum = 0, trig = 0, crown = 0, count = 0;
  for (let a = 0; a < n[0]; a++) for (let b = 0; b < n[1]; b++) for (let c = 0; c < n[2]; c++) {
    const r = evaluate([a, b, c], 1);
    sum += r.total;
    if (r.freeSpins) trig++;
    if (r.jackpotLines) crown++;
    count++;
  }
  const line = sum / count, trigger = trig / count;
  // free spins pay `line` per line each and can retrigger: E = line / (1 − trigger·F)
  const withFree = line / (1 - trigger * FREE_SPINS);
  return { line, withFree, trigger, crown: crown / count };
}
