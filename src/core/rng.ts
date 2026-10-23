/**
 * Seeded randomness. Every gamble and every patron draws from one stream
 * stored in the save, so identical inputs replay identically (tested).
 */
export type Rand = () => number;

/** mulberry32 step on a 32-bit state; returns [value in 0..1, next state]. */
export function step(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** A standalone generator (tests, previews). */
export function makeRand(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    const [v, n] = step(s);
    s = n;
    return v;
  };
}

export const randInt = (r: Rand, n: number): number => Math.floor(r() * n);

export function shuffle<T>(r: Rand, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick from weighted entries. */
export function weighted<T>(r: Rand, entries: { w: number; v: T }[]): T {
  const total = entries.reduce((a, e) => a + e.w, 0);
  let t = r() * total;
  for (const e of entries) {
    if (t < e.w) return e.v;
    t -= e.w;
  }
  return entries[entries.length - 1].v;
}
