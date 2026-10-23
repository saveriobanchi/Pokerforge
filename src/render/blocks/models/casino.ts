import type { Canvas, Face, Tex, V3 } from '../iso';
import { Paint, type TexLib } from '../tex';
import { lanternTex } from './buildings';

/**
 * Casino buildings in the same Minecraft-style block idiom as the rest of
 * the island, textured from the CC0 packs (felt from Kenney's cotton,
 * mahogany, gold, steel, marble) plus faces painted here (reels, wheels,
 * cards, pips, neon signs). `f` is the animation phase in [0, 1).
 */
type Ctx = { c: Canvas; L: TexLib };
const TAU = Math.PI * 2;
const F = (t: Tex, o: Partial<Face> = {}): Face => ({ tex: t, ...o });

/** Derived materials (deep felts, velvet) registered once per texture library. */
const ready = new WeakSet<TexLib>();
function mats(L: TexLib): void {
  if (ready.has(L)) return;
  ready.add(L);
  const felt = (base: string, k: [number, number, number], seed: number) => {
    const p = new Paint(16, 16, L.get(base)).tint(k);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hsh(x, y, seed) > 0.82) { const [r, g, b] = p.get(x, y); p.set(x, y, [r * 1.12, g * 1.12, b * 1.12, 255].map((v) => Math.min(255, v)) as [number, number, number, number]); }
    return p;
  };
  L.put('gen/felt_green', felt('k/Tiles/cotton_green', [0.62, 0.72, 0.62], 1));
  L.put('gen/felt_red', felt('k/Tiles/cotton_red', [0.86, 0.36, 0.44], 2));
  L.put('gen/felt_blue', felt('k/Tiles/cotton_blue', [0.6, 0.7, 0.85], 3));
  L.put('gen/cloth', felt('k/Tiles/cotton_tan', [1, 1, 1], 4));
  L.put('gen/mahogany', new Paint(16, 16, L.get('a/maple_planks')).tint([0.78, 0.5, 0.42]));
}

function blk({ c, L }: Ctx, a: V3, b: V3, top: string | Tex, side: string | Tex = top, side2: string | Tex = side, id = 5, o: Partial<Face> = {}): void {
  mats(L);
  const t = (n: string | Tex) => F(typeof n === 'string' ? L.get(n) : n, o);
  c.box(a, b, t(top), t(side), t(side2), id);
}
const glowBox = ({ c }: Ctx, a: V3, b: V3, top: Tex, side: Tex = top, side2: Tex = side, tint?: [number, number, number]) =>
  c.box(a, b, F(top, { glow: true, uv: [0, 0, top.w, top.h], tint }), F(side, { glow: true, uv: [0, 0, side.w, side.h], tint }), F(side2, { glow: true, uv: [0, 0, side2.w, side2.h], tint }), 6);
/** A face texture stretched over a whole box side. */
const whole = (t: Tex, o: Partial<Face> = {}): Face => F(t, { uv: [0, 0, t.w, t.h], ...o });

const hsh = (a: number, b: number, c = 0) => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

// ───────────────────────── palette & materials ─────────────────────────

export const MAT = {
  felt: 'gen/felt_green',
  feltRed: 'gen/felt_red',
  feltBlue: 'gen/felt_blue',
  cloth: 'gen/cloth',
  mahogany: 'gen/mahogany',
  dark: 'as/dark wood plank',
  gold: 'as/default_gold_block',
  bronze: 'as/default_bronze_block',
  steel: 'as/default_steel_block',
  marble: 'a/marble',
  marbleB: 'a/marble_bricks',
  obsidian: 'as/default_obsidian_block',
  oak: 'a/oak_planks',
  slate: 'a/slate_tiles',
};

// ───────────────────────── tiny pixel font (3×5) ─────────────────────────

const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '$': '011110010011110', '!': '010010010000010', ' ': '000000000000000', '×': '000101010101000', '♠': '010111111010111', '♥': '101111111111010',
};

/** Draw text into a painter at (x, y) in the 3×5 font. */
export function text(p: Paint, s: string, x: number, y: number, col: number, shadow?: number): void {
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') {
      if (shadow !== undefined) p.set(x + i + 1, y + j + 1, shadow);
      p.set(x + i, y + j, col);
    }
    x += 4;
  }
}
export const textWidth = (s: string) => s.length * 4 - 1;

/** A sign panel: dark board, bright border, centred text. */
export function signTex(s: string, w: number, h: number, bg: number, fg: number, border: number, f = 0): Paint {
  const p = new Paint(w, h).rect(0, 0, w, h, bg).frame(0, 0, w, h, border);
  // marquee bulbs chase around the border
  const per = 2 * (w + h - 2);
  for (let k = 0; k < per; k += 3) {
    const on = (Math.floor(k / 3) + Math.floor(f * 6)) % 2 === 0;
    const idx = k;
    const [x, y] = idx < w ? [idx, 0] : idx < w + h - 1 ? [w - 1, idx - w + 1] : idx < 2 * w + h - 2 ? [w - 1 - (idx - (w + h - 2)), h - 1] : [0, h - 1 - (idx - (2 * w + h - 3))];
    p.set(x, y, on ? 0xfff6c0 : border);
  }
  text(p, s, Math.floor((w - textWidth(s)) / 2), Math.floor((h - 5) / 2), fg, 0x1a0a14);
  return p;
}

// ───────────────────────── painted faces ─────────────────────────

/** Die face 16×16 with n pips. */
export function pipTex(n: number, body = 0xf4f0e8, pip = 0x1a1a24): Paint {
  const p = new Paint().rect(0, 0, 16, 16, body).frame(0, 0, 16, 16, 0xc8c0b4);
  const spots: Record<number, [number, number][]> = {
    1: [[7, 7]], 2: [[3, 3], [11, 11]], 3: [[3, 3], [7, 7], [11, 11]], 4: [[3, 3], [11, 3], [3, 11], [11, 11]],
    5: [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]], 6: [[3, 3], [11, 3], [3, 7], [11, 7], [3, 11], [11, 11]],
  };
  for (const [x, y] of spots[n]) p.rect(x, y, 2, 2, n === 1 ? 0xc81828 : pip);
  return p;
}

/** Felt with a faint printed layout (lines in gold). */
function feltTex(L: TexLib, base: string, draw?: (p: Paint) => void): Paint {
  mats(L);
  const p = new Paint(16, 16, L.get(base));
  draw?.(p);
  return p;
}

/** Card lying on felt (top view), 16×16 painter region. */
function cardOn(p: Paint, x: number, y: number, red: boolean, back = false): void {
  p.rect(x, y, 4, 6, back ? 0xb82838 : 0xf8f4ec).frame(x, y, 4, 6, back ? 0x6a1020 : 0xb8b0a0);
  if (!back) { p.set(x + 1, y + 1, red ? 0xd82838 : 0x1a1a24); p.set(x + 2, y + 4, red ? 0xd82838 : 0x1a1a24); }
  else p.set(x + 1, y + 2, 0xf0c050);
}

/** Chip edge: coloured with white dashes. */
export function chipEdge(col: number): Paint {
  const p = new Paint().rect(0, 0, 16, 16, col);
  for (let x = 0; x < 16; x += 4) p.rect(x, 0, 2, 16, 0xf8f4ec);
  return p;
}
function chipTop(col: number): Paint {
  const p = new Paint().rect(0, 0, 16, 16, col);
  p.frame(0, 0, 16, 16, 0xf8f4ec).frame(4, 4, 8, 8, 0xf8f4ec);
  return p;
}
export const CHIP_COLS = [0xd83a3a, 0x3a7ad8, 0x2a9a4a, 0x1a1a24, 0x9a4ad8, 0xe8b440];

/** A short stack of chips standing at (x, y). */
function chips({ c }: Ctx, x: number, y: number, z: number, n: number, col: number, r = 0.07): void {
  const h = 0.035;
  for (let i = 0; i < n; i++) c.box([x - r, y - r, z + i * h], [x + r, y + r, z + (i + 1) * h], whole(chipTop(col)), whole(chipEdge(col)), whole(chipEdge(col), { tint: [0.85, 0.85, 0.95] }), 6);
}

/** Slot reel strip (vertical): symbols scrolled by f. */
const REEL_SYMS: [number, number][] = [[0xd82838, 0x2a8a2a], [0xf0d040, 0xb89a10], [0xf0b020, 0x8a5a10], [0x2a2a2a, 0xe8e8e8], [0xd82838, 0xf8e070], [0x8ad8f8, 0xffffff]];
function reelTex(f: number, seed: number): Paint {
  const p = new Paint(6, 16).rect(0, 0, 6, 16, 0xf8f4ec);
  const off = Math.floor(f * 16 * 2 + seed * 5) % 16;
  for (let k = 0; k < 4; k++) {
    const [a, b] = REEL_SYMS[(k + seed) % REEL_SYMS.length];
    const y = (k * 5 + off) % 16;
    p.rect(1, y, 4, 3, a).set(2, y, b);
  }
  return p;
}

/** Top view of a roulette wheel rotated by f. */
function rouletteTex(f: number): Paint {
  const p = new Paint();
  const rot = f * TAU / 2;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy);
    if (d > 8) continue;
    if (d > 7) { p.set(x, y, 0x6a3a1a); continue; }
    if (d < 2) { p.set(x, y, d < 1 ? 0xf0d060 : 0xb88a3a); continue; }
    const a = (Math.atan2(dy, dx) + rot + TAU * 2) % TAU;
    const seg = Math.floor((a / TAU) * 37);
    if (d > 4.5) p.set(x, y, seg === 0 ? 0x2a9a4a : seg % 2 ? 0xc82828 : 0x1a1a1e);
    else p.set(x, y, Math.floor(a * 4 / TAU) % 2 ? 0x8a5a2a : 0xa8743a);
  }
  // the ball, opposite way round
  const ba = -f * TAU;
  p.set(Math.round(8 + Math.cos(ba) * 5.6), Math.round(8 + Math.sin(ba) * 5.6), 0xffffff);
  return p;
}

/** Face of an upright fortune wheel rotated by f (32×32). */
function fortuneTex(f: number): Paint {
  const p = new Paint(32, 32);
  const cols = [0xd84a3a, 0xf0c040, 0x3a8ad8, 0x4ab84a, 0xa04ad8, 0xf08a2a];
  const rot = f * TAU / 3;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16, d = Math.hypot(dx, dy);
    if (d > 16) continue;
    if (d > 14.6) { p.set(x, y, (Math.floor((Math.atan2(dy, dx) + TAU) / TAU * 24) % 2) ? 0xfff2b0 : 0xb8862a); continue; }
    if (d < 2.5) { p.set(x, y, 0xf0d060); continue; }
    const a = (Math.atan2(dy, dx) + rot + TAU * 2) % TAU;
    const seg = Math.floor((a / TAU) * 12);
    const edge = ((a / TAU) * 12) % 1 < 0.08;
    p.set(x, y, edge ? 0xf8f4ec : cols[seg % cols.length]);
  }
  return p;
}

/** Plinko board face (16×32): pegs, pockets, a ball falling by f. */
function plinkoTex(f: number): Paint {
  const p = new Paint(16, 32).rect(0, 0, 16, 32, 0x1a2a4a);
  for (let r = 0; r < 7; r++) for (let k = 0; k <= r; k++) p.set(Math.round(8 - r + k * 2), 4 + r * 3, 0xd8e0f0);
  const pk = [0xd84a3a, 0xf08a2a, 0xf0d040, 0x4ab84a, 0xf0d040, 0xf08a2a, 0xd84a3a];
  for (let i = 0; i < 7; i++) p.rect(1 + i * 2, 27, 2, 3, pk[i]);
  const y = Math.floor(f * 26);
  const x = 8 + Math.round(Math.sin(f * 17) * Math.min(5, y / 4));
  p.rect(x, 2 + y, 1, 1, 0xff6ac8).set(x, 1 + y, 0xffb8e8);
  return p;
}

/** Keno board: 8×5 numbers, some lit (seeded by frame). */
function kenoTex(f: number): Paint {
  const p = new Paint(32, 20).rect(0, 0, 32, 20, 0x14182a).frame(0, 0, 32, 20, 0xb8862a);
  const fr = Math.floor(f * 4);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) {
    const lit = hsh(r * 8 + k, fr, 7) < 0.25;
    p.rect(2 + k * 4 - 0, 2 + r * 4, 3, 3, lit ? 0xffd040 : 0x3a3a5a);
  }
  return p;
}

/** Video poker screen: five cards. */
function pokerScreen(f: number): Paint {
  const p = new Paint(24, 14).rect(0, 0, 24, 14, 0x1a2a8a).frame(0, 0, 24, 14, 0x6a7ad8);
  for (let k = 0; k < 5; k++) {
    const held = hsh(k, Math.floor(f * 2), 3) < 0.4;
    p.rect(2 + k * 4, 3, 3, 6, 0xf8f4ec);
    p.set(3 + k * 4, 4, k % 2 ? 0xd82838 : 0x1a1a24);
    if (held) p.rect(2 + k * 4, 10, 3, 1, 0xffd040);
  }
  return p;
}

/** Crash board: big multiplier digits. */
function crashScreen(f: number): Paint {
  const p = new Paint(24, 12).rect(0, 0, 24, 12, 0x101420).frame(0, 0, 24, 12, 0x3a4a6a);
  const m = (1 + f * 4).toFixed(1);
  text(p, m + '×', 3, 4, f > 0.85 ? 0xff5a4a : 0x6aff8a);
  return p;
}

/** Striped awning cloth. */
function stripes(a: number, b: number, w = 4): Paint {
  const p = new Paint();
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) p.set(x, y, Math.floor(x / w) % 2 ? a : b);
  return p;
}

/** Window face, lit (warm) or dark. */
function windowTex(L: TexLib, lit: boolean): Paint {
  const p = new Paint(16, 16, L.get(MAT.marbleB));
  p.rect(4, 3, 8, 10, lit ? 0xffd88a : 0x2a3a5a).frame(3, 2, 10, 12, 0xb8862a).rect(7, 3, 1, 10, 0xb8862a).rect(4, 8, 8, 1, 0xb8862a);
  if (lit) p.rect(5, 4, 2, 2, 0xfff2c8);
  return p;
}

// ───────────────────────── shared parts ─────────────────────────

/** A table on four legs with a felt top and a wooden rail. */
function table(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, h: number, felt: Tex, rail: string = MAT.mahogany, legs: string = MAT.dark): void {
  const l = 0.07;
  for (const [x, y] of [[x0 + 0.04, y0 + 0.04], [x1 - 0.04 - l, y0 + 0.04], [x0 + 0.04, y1 - 0.04 - l], [x1 - 0.04 - l, y1 - 0.04 - l]]) blk(ctx, [x, y, 0], [x + l, y + l, h - 0.08], legs);
  blk(ctx, [x0, y0, h - 0.08], [x1, y1, h], rail);
  ctx.c.box([x0 + 0.06, y0 + 0.06, h], [x1 - 0.06, y1 - 0.06, h + 0.02], whole(felt), F(ctx.L.get(rail)), F(ctx.L.get(rail)), 5);
  // raised rail on the two far edges and the near edges
  blk(ctx, [x0, y0, h], [x1, y0 + 0.06, h + 0.06], rail);
  blk(ctx, [x0, y0, h], [x0 + 0.06, y1, h + 0.06], rail);
  blk(ctx, [x0, y1 - 0.06, h], [x1, y1, h + 0.05], rail);
  blk(ctx, [x1 - 0.06, y0, h], [x1, y1, h + 0.05], rail);
}

function stool(ctx: Ctx, x: number, y: number): void {
  blk(ctx, [x - 0.03, y - 0.03, 0], [x + 0.03, y + 0.03, 0.32], MAT.steel);
  blk(ctx, [x - 0.08, y - 0.08, 0.32], [x + 0.08, y + 0.08, 0.38], MAT.feltRed, MAT.feltRed);
}

function lamp(ctx: Ctx, p: V3, col: [number, number, number] = [130, 95, 40], r = 1.3): void {
  const lt = lanternTex();
  ctx.c.box([p[0] - 0.08, p[1] - 0.08, p[2]], [p[0] + 0.08, p[1] + 0.08, p[2] + 0.18], F(lt, { glow: true, uv: [4, 3, 12, 11] }), F(lt, { glow: true, uv: [3, 3, 13, 12] }), F(lt, { glow: true, uv: [3, 3, 13, 12] }), 6);
  ctx.c.light([p[0], p[1], p[2] + 0.1], col, r);
}

function floorSlab(ctx: Ctx, tex: string, inset = 0.02, h = 0.06): void {
  blk(ctx, [inset, inset, 0], [1 - inset, 1 - inset, h], tex);
}

// ───────────────────────── games ─────────────────────────

/** Coin toss: a striped booth with a giant coin spinning on the counter. */
export function coinStand(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.15, 0.3, 0], [0.85, 0.75, 0.55], MAT.oak, 'a/beech_planks');
  blk(ctx, [0.12, 0.27, 0.55], [0.88, 0.78, 0.62], MAT.mahogany);
  for (const [x, y] of [[0.15, 0.3], [0.78, 0.3]]) blk(ctx, [x, y, 0.62], [x + 0.07, y + 0.07, 1.35], 'a/oak_log_side');
  const aw = stripes(0xd84a3a, 0xf0e2c4);
  for (let k = 0; k < 3; k++) c.box([0.08 + k * 0.02, 0.22 + k * 0.05, 1.35 + k * 0.06], [0.92 - k * 0.02, 0.48 + k * 0.03, 1.41 + k * 0.06], F(aw), F(aw), F(aw, { tint: [0.85, 0.85, 0.95] }), 6);
  // the coin: a disc seen edge-on as it spins
  const w = Math.abs(Math.cos(f * TAU));
  const coin = new Paint(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x + 0.5 - 8) / Math.max(0.12, w), dy = y + 0.5 - 8;
    const d = Math.hypot(dx, dy);
    if (d > 7) continue;
    coin.set(x, y, d > 5.8 ? 0xb8862a : w < 0.3 ? 0xd8a83a : (dx + dy < -3 ? 0xfff2b0 : 0xf0c850));
  }
  if (w > 0.5) { coin.rect(7, 5, 2, 6, 0xb8862a); }
  c.sprite([0.5, 0.52, 0.62 + Math.abs(Math.sin(f * TAU)) * 0.25], { tex: coin }, 6, 2, 0.5);
  chips(ctx, 0.3, 0.6, 0.62, 3, CHIP_COLS[0]);
  chips(ctx, 0.72, 0.62, 0.62, 2, CHIP_COLS[1]);
}

/** Lucky Reels: a red-and-gold cabinet with lit reels and a lever. */
export function slots(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.18, 0.26, 0], [0.82, 0.76, 0.12], MAT.dark);
  blk(ctx, [0.2, 0.3, 0.12], [0.8, 0.72, 1.05], MAT.feltRed, MAT.feltRed, MAT.feltRed);
  blk(ctx, [0.18, 0.28, 1.05], [0.82, 0.74, 1.12], MAT.gold);
  // reel window on the front (+y face)
  for (let r = 0; r < 3; r++) c.quad([0.27 + r * 0.16, 0.725, 0.85], [0.14, 0, 0], [0, 0, -0.32], F(reelTex(f, r * 2 + 1), { glow: true }), [1, 1, 1], 7, 0.02);
  c.quad([0.24, 0.722, 0.88], [0.52, 0, 0], [0, 0, -0.38], F(new Paint().frame(0, 0, 16, 16, 0xe8b440).frame(1, 1, 14, 14, 0x8a5a10)), [1, 1, 1], 7, 0.01);
  // button deck
  blk(ctx, [0.2, 0.72, 0.36], [0.8, 0.82, 0.44], MAT.gold);
  for (let k = 0; k < 3; k++) glowBox(ctx, [0.28 + k * 0.17, 0.75, 0.44], [0.36 + k * 0.17, 0.8, 0.47], new Paint().rect(0, 0, 16, 16, [0xff5a5a, 0x5aff8a, 0xffd040][k]));
  // marquee
  c.box([0.2, 0.36, 1.12], [0.8, 0.66, 1.42], F(L.get(MAT.gold)), whole(signTex('777', 20, 10, 0x2a0a1a, 0xffd040, 0xe8b440, f), { glow: true }), F(L.get(MAT.gold)), 6);
  c.light([0.5, 0.75, 1.25], [150, 60, 60], 1.4);
  // lever on the right side (+x)
  const pull = Math.max(0, Math.sin(f * TAU)) * 0.25;
  blk(ctx, [0.82, 0.48, 0.6], [0.9, 0.56, 0.68], MAT.steel);
  blk(ctx, [0.88, 0.49, 0.64], [0.92, 0.55, 1.0 - pull], MAT.steel);
  blk(ctx, [0.86, 0.47, 1.0 - pull], [0.94, 0.57, 1.08 - pull], 'k/Tiles/redstone', 'k/Tiles/redstone', 'k/Tiles/redstone', 6, { tint: [1.3, 0.6, 0.6] });
}

/** Sky Dice: a green felt table with two tumbling dice. */
export function diceTable(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  table(ctx, 0.08, 0.12, 0.92, 0.88, 0.62, feltTex(L, MAT.felt, (p) => { p.frame(2, 2, 12, 12, 0xd8c070); p.rect(4, 7, 8, 1, 0xd8c070); }));
  const t = f * TAU;
  const ds: [number, number, number][] = [[0.42, 0.45, 2], [0.58, 0.55, 5]];
  ds.forEach(([x, y, n], i) => {
    const hop = Math.abs(Math.sin(t + i * 1.3)) * 0.12;
    const face = [n, (n % 6) + 1, ((n + 2) % 6) + 1].map((k) => pipTex(k));
    const spin = Math.floor(f * 4 + i) % 3;
    c.box([x - 0.07, y - 0.07, 0.64 + hop], [x + 0.07, y + 0.07, 0.78 + hop], whole(face[spin]), whole(face[(spin + 1) % 3]), whole(face[(spin + 2) % 3]), 6);
  });
  chips(ctx, 0.22, 0.28, 0.64, 4, CHIP_COLS[2]);
  chips(ctx, 0.78, 0.72, 0.64, 3, CHIP_COLS[4]);
  // stick
  blk(ctx, [0.15, 0.7, 0.68], [0.6, 0.73, 0.7], MAT.oak);
}

/** Scratch kiosk: a little booth with a glass counter and a sign. */
export function scratchKiosk(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.15, 0.25, 0], [0.85, 0.75, 0.5], MAT.cloth, 'a/beech_planks');
  c.box([0.18, 0.28, 0.5], [0.82, 0.72, 0.62], F(L.get('a/glass')), F(L.get('a/glass')), F(L.get('a/glass')), 6);
  // cards fanned on the counter
  const cards = new Paint(16, 16).rect(0, 0, 16, 16, 0x3a2a4a);
  for (let k = 0; k < 3; k++) { cards.rect(2 + k * 5, 4, 4, 7, [0xc8962a, 0xc8c8d8, 0xf0c040][k]); cards.rect(3 + k * 5, 6, 2, 2, 0xf8f4ec); }
  c.box([0.2, 0.3, 0.62], [0.8, 0.7, 0.64], whole(cards), F(L.get(MAT.oak)), F(L.get(MAT.oak)), 6);
  for (const x of [0.17, 0.77]) blk(ctx, [x, 0.27, 0.5], [x + 0.06, 0.33, 1.25], MAT.gold);
  c.box([0.1, 0.22, 1.25], [0.9, 0.42, 1.5], F(L.get(MAT.gold)), whole(signTex('SCRATCH', 32, 9, 0x1a3a1a, 0x8aff7a, 0x3a9a3a, f), { glow: true }), F(L.get(MAT.gold)), 6);
  c.light([0.5, 0.45, 1.35], [60, 140, 60], 1.2);
}

/** Blackjack: felt half-moon table, cards, a shoe and chips. */
export function blackjack(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  const felt = feltTex(L, MAT.felt, (p) => {
    for (let x = 1; x < 15; x++) p.set(x, Math.round(10 - Math.sin((x / 15) * Math.PI) * 5), 0xd8c070);
    cardOn(p, 3, 9, true); cardOn(p, 9, 9, false); cardOn(p, 6, 2, false, f > 0.5);
  });
  table(ctx, 0.05, 0.12, 0.95, 0.88, 0.6, felt);
  blk(ctx, [0.72, 0.2, 0.62], [0.88, 0.32, 0.72], MAT.dark); // card shoe
  c.box([0.74, 0.22, 0.72], [0.86, 0.3, 0.74], F(new Paint().rect(0, 0, 16, 16, 0xb82838)), F(L.get(MAT.dark)), F(L.get(MAT.dark)), 6);
  chips(ctx, 0.2, 0.25, 0.62, 5, CHIP_COLS[0]);
  chips(ctx, 0.32, 0.25, 0.62, 4, CHIP_COLS[3]);
  chips(ctx, 0.5, 0.75, 0.62, 2 + Math.floor(f * 3), CHIP_COLS[1]);
  for (const x of [0.2, 0.5, 0.8]) stool(ctx, x, 0.98);
}

/** Roulette: the wheel at the back, a betting layout at the front. */
export function roulette(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  const layout = feltTex(L, MAT.felt, (p) => {
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) p.rect(2 + k * 2, 3 + r * 3, 2, 2, (r + k) % 2 ? 0xc82828 : 0x1a1a1e);
    p.rect(1, 3, 1, 8, 0x2a9a4a).frame(1, 2, 14, 10, 0xd8c070);
  });
  table(ctx, 0.05, 0.1, 0.95, 0.9, 0.58, layout);
  // wheel bowl
  blk(ctx, [0.18, 0.12, 0.6], [0.62, 0.56, 0.7], MAT.mahogany);
  c.quad([0.2, 0.14, 0.705], [0.4, 0, 0], [0, 0.4, 0], F(rouletteTex(f)), [1.05, 1.03, 0.95], 6, 0.02, true);
  blk(ctx, [0.38, 0.32, 0.7], [0.42, 0.36, 0.8], MAT.gold);
  chips(ctx, 0.75, 0.7, 0.6, 3, CHIP_COLS[5]);
  chips(ctx, 0.62, 0.78, 0.6, 2, CHIP_COLS[0]);
  for (const x of [0.25, 0.7]) stool(ctx, x, 0.98);
}

/** Plinko: an upright pegboard with a ball dropping. */
export function plinko(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.15, 0.35, 0], [0.85, 0.7, 0.2], MAT.dark);
  blk(ctx, [0.18, 0.42, 0.2], [0.82, 0.58, 1.9], MAT.gold);
  c.quad([0.22, 0.585, 1.85], [0.56, 0, 0], [0, 0, -1.6], F(plinkoTex(f), { glow: true }), [1, 1, 1], 7, 0.02);
  c.box([0.12, 0.38, 1.9], [0.88, 0.62, 2.05], F(L.get(MAT.gold)), whole(signTex('PLINKO', 26, 7, 0x2a0a3a, 0xff8ae8, 0xe8b440, f), { glow: true }), F(L.get(MAT.gold)), 6);
  c.light([0.5, 0.7, 1.2], [140, 60, 160], 1.5);
}

/** Fortune wheel: a big upright wheel on a post. */
export function fortuneWheel(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.2, 0.3, 0], [0.8, 0.7, 0.18], MAT.marbleB);
  blk(ctx, [0.44, 0.44, 0.18], [0.56, 0.56, 0.95], MAT.gold);
  c.quad([0.08, 0.6, 1.95], [0.84, 0, 0], [0, 0, -1.68], F(fortuneTex(f), { glow: false, uv: [0, 0, 32, 32] }), [1.05, 1.02, 1], 7, 0.04);
  blk(ctx, [0.47, 0.58, 1.95], [0.53, 0.64, 2.1], MAT.gold); // pointer
  c.light([0.5, 0.7, 1.1], [140, 110, 40], 1.6);
}

/** Video poker: a bar-top machine with a blue screen and buttons. */
export function videoPoker(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.12, 0.2, 0], [0.88, 0.8, 0.55], MAT.dark, MAT.mahogany);
  blk(ctx, [0.2, 0.3, 0.55], [0.8, 0.62, 1.2], MAT.obsidian);
  c.quad([0.24, 0.625, 1.1], [0.52, 0, 0], [0, 0, -0.38], F(pokerScreen(f), { glow: true, uv: [0, 0, 24, 14] }), [1, 1, 1], 7, 0.02);
  blk(ctx, [0.2, 0.62, 0.55], [0.8, 0.75, 0.62], MAT.steel);
  for (let k = 0; k < 5; k++) glowBox(ctx, [0.24 + k * 0.11, 0.66, 0.62], [0.31 + k * 0.11, 0.72, 0.65], new Paint().rect(0, 0, 16, 16, 0xffd040));
  c.box([0.2, 0.3, 1.2], [0.8, 0.62, 1.38], F(L.get(MAT.gold)), whole(signTex('POKER', 22, 8, 0x0a1a4a, 0x8ad8ff, 0xe8b440, f), { glow: true }), F(L.get(MAT.gold)), 6);
  stool(ctx, 0.5, 0.95);
  c.light([0.5, 0.75, 0.9], [60, 80, 160], 1.2);
}

/** Gem mines: a timbered mine mouth with ore and a cart of gems. */
export function gemMine(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.05, 0.05, 0], [0.95, 0.6, 1.0], 'b/stone', 'b/stone', 'b/cobblestone');
  blk(ctx, [0.0, 0.0, 1.0], [1.0, 0.62, 1.15], 'a/gravel');
  c.quad([0.3, 0.605, 0.75], [0.4, 0, 0], [0, 0, -0.75], F(new Paint().rect(0, 0, 16, 16, 0x0e0a10)), [1, 1, 1], 6, 0.01);
  for (const x of [0.22, 0.7]) blk(ctx, [x, 0.6, 0], [x + 0.08, 0.68, 0.85], 'a/oak_log_side');
  blk(ctx, [0.18, 0.6, 0.85], [0.82, 0.68, 0.93], 'a/oak_log_side');
  for (const [x, z, t] of [[0.08, 0.3, 'k/Tiles/stone_diamond'], [0.85, 0.55, 'k/Tiles/redstone_emerald'], [0.12, 0.75, 'k/Tiles/greystone_ruby']] as [number, number, string][]) c.quad([x, 0.605, z + 0.15], [0.12, 0, 0], [0, 0, -0.15], F(L.get(t)), [1.1, 1.1, 1.1], 6, 0.015);
  // cart on rails
  c.quad([0.2, 0.62, 0.005], [0, 0.38, 0], [0.6, 0, 0], F(L.get('k/Tiles/track_straight')), [1, 1, 1], 4, 0, true);
  blk(ctx, [0.32, 0.7, 0.06], [0.68, 0.95, 0.32], MAT.steel, 'a/oak_planks');
  for (let k = 0; k < 5; k++) {
    const g = ['as/default_diamond', 'as/emerald', 'as/ruby', 'as/default_mese_crystal', 'as/crystal'][k];
    c.sprite([0.38 + k * 0.06, 0.82, 0.3 + Math.abs(Math.sin(f * TAU + k)) * 0.03], { tex: L.get(g), glow: k === Math.floor(f * 5) }, 6, 1);
  }
  lamp(ctx, [0.86, 0.66, 0.62]);
}

/** Sky Keno: a lit number board above a glass ball cage. */
export function keno(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.1, 0.4, 0], [0.9, 0.55, 0.3], MAT.dark);
  for (const x of [0.12, 0.8]) blk(ctx, [x, 0.42, 0.3], [x + 0.08, 0.5, 1.9], MAT.gold);
  c.box([0.1, 0.4, 1.15], [0.9, 0.52, 1.9], F(L.get(MAT.gold)), whole(kenoTex(f), { glow: true }), F(L.get(MAT.dark)), 6);
  // ball cage
  c.box([0.3, 0.6, 0.0], [0.7, 0.95, 0.06], F(L.get(MAT.gold)), F(L.get(MAT.gold)), F(L.get(MAT.gold)), 5);
  for (let k = 0; k < 7; k++) {
    const a = f * TAU + k;
    c.sprite([0.5 + Math.cos(a) * 0.12, 0.78 + Math.sin(a) * 0.08, 0.08 + ((k * 0.13 + f) % 1) * 0.35], { tex: new Paint(3, 3).rect(0, 0, 3, 3, CHIP_COLS[k % 6]).rect(0, 0, 1, 1, 0xffffff) }, 6, 2, 0.5);
  }
  c.box([0.3, 0.6, 0.06], [0.7, 0.95, 0.55], F(L.get('a/glass'), { tint: [0.9, 1, 1.05] }), F(L.get('a/glass')), F(L.get('a/glass')), 6);
  c.light([0.5, 0.6, 1.5], [150, 120, 40], 1.6);
}

/** Airship ascent: a launch pad, a tethered balloon bobbing, a big multiplier board. */
export function crashPad(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.08, 0.08, 0], [0.92, 0.92, 0.1], MAT.steel, 'as/default_tin_block');
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; glowBox(ctx, [0.5 + Math.cos(a) * 0.36 - 0.025, 0.5 + Math.sin(a) * 0.36 - 0.025, 0.1], [0.5 + Math.cos(a) * 0.36 + 0.025, 0.5 + Math.sin(a) * 0.36 + 0.025, 0.13], new Paint().rect(0, 0, 16, 16, k === Math.floor(f * 8) ? 0xffffff : 0xffb040)); }
  const z = 0.7 + Math.sin(f * TAU) * 0.12 + f * 0.25;
  c.quad([0.5, 0.5, 0.1], [0, 0, 0.001], [0, 0, z], F(new Paint().rect(7, 0, 1, 16, 0x6a4a2a)), [1, 1, 1], 6, 0.1);
  const cloth = stripes(0xd84a3a, 0xf0e2c4, 3);
  const prof = [0.12, 0.2, 0.24, 0.24, 0.2, 0.12];
  for (let k = 0; k < prof.length; k++) { const r = prof[k]; c.box([0.5 - r, 0.5 - r, z + 0.2 + k * 0.1], [0.5 + r, 0.5 + r, z + 0.3 + k * 0.1], F(cloth), F(cloth), F(cloth, { tint: [0.9, 0.9, 0.95] }), 6); }
  blk(ctx, [0.42, 0.42, z], [0.58, 0.58, z + 0.12], 'a/maple_planks');
  // board
  blk(ctx, [0.05, 0.05, 0.1], [0.1, 0.1, 1.2], MAT.steel);
  c.box([0.0, 0.0, 1.2], [0.4, 0.12, 1.45], F(L.get(MAT.steel)), whole(crashScreen(f), { glow: true }), F(L.get(MAT.steel)), 6);
  c.light([0.5, 0.5, 0.4], [150, 90, 30], 1.4);
}

/** Baccarat: an elegant red-felt table with a gold rail. */
export function baccarat(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  const felt = feltTex(L, MAT.feltRed, (p) => {
    p.frame(2, 2, 12, 12, 0xe8c870);
    cardOn(p, 3, 5, f > 0.5); cardOn(p, 9, 5, true);
    p.rect(4, 12, 8, 1, 0xe8c870);
  });
  table(ctx, 0.05, 0.1, 0.95, 0.9, 0.6, felt, MAT.gold, MAT.dark);
  chips(ctx, 0.22, 0.75, 0.62, 6, CHIP_COLS[5]);
  chips(ctx, 0.78, 0.25, 0.62, 4, CHIP_COLS[3]);
  for (const x of [0.2, 0.5, 0.8]) stool(ctx, x, 0.98);
  lamp(ctx, [0.5, 0.5, 1.5], [150, 100, 50], 1.6);
  blk(ctx, [0.49, 0.49, 1.68], [0.51, 0.51, 2.1], MAT.steel);
}

/** Sky Derby (2×2): an oval track with little flyers racing round, and a grandstand. */
export function derby(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.04, 0.04, 0], [1.96, 1.96, 0.06], 'a/grass_top', 'a/grass_side');
  // track
  const track = new Paint(16, 16, L.get('k/Tiles/dirt_sand'));
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    c.quad([1 + Math.cos(a) * 0.72 - 0.11, 1.15 + Math.sin(a) * 0.55 - 0.11, 0.065], [0.22, 0, 0], [0, 0.22, 0], F(track), [1, 1, 1], 4, 0, true);
  }
  // inner rail and posts
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    blk(ctx, [1 + Math.cos(a) * 0.48 - 0.02, 1.15 + Math.sin(a) * 0.36 - 0.02, 0.06], [1 + Math.cos(a) * 0.48 + 0.02, 1.15 + Math.sin(a) * 0.36 + 0.02, 0.26], 'a/limestone');
  }
  // flyers
  const cols = [0xe8b84a, 0xe8f0ff, 0xd8483a, 0xb8a0f0, 0x6ac85a, 0x5a8ad8];
  cols.forEach((col, i) => {
    const a = f * TAU + i * 0.28 + Math.sin(f * TAU * 2 + i) * 0.05;
    const bird = new Paint(6, 5).draw(['..a...', '.abbb.', 'abbbbc', '.bbb..', '..d...'], { a: 0xffffff, b: col, c: 0xf0a020, d: 0x3a2a1a });
    c.sprite([1 + Math.cos(a) * (0.6 + (i % 3) * 0.05), 1.15 + Math.sin(a) * (0.45 + (i % 3) * 0.04), 0.12 + Math.abs(Math.sin(f * TAU * 6 + i)) * 0.06], { tex: bird }, 6, 2, 0.5);
  });
  // grandstand at the back
  for (let k = 0; k < 3; k++) blk(ctx, [0.1, 0.1 + k * 0.08, 0.06], [1.9, 0.18 + k * 0.08, 0.3 + (2 - k) * 0.18], MAT.marbleB, MAT.feltRed);
  for (const x of [0.12, 1.8]) blk(ctx, [x, 0.1, 0.06], [x + 0.08, 0.18, 1.1], MAT.gold);
  const aw = stripes(0x2a7a4a, 0xf0e2c4);
  c.box([0.06, 0.06, 1.1], [1.94, 0.4, 1.18], F(aw), F(aw), F(aw), 6);
  c.box([0.6, 0.06, 1.18], [1.4, 0.18, 1.4], F(L.get(MAT.gold)), whole(signTex('DERBY', 22, 8, 0x0a2a1a, 0xffd040, 0xe8b440, f), { glow: true }), F(L.get(MAT.gold)), 6);
}

/** Casino Hold'em room (2×2): a long oval table with chairs and a pendant lamp. */
export function holdem(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.05, 0.05, 0], [1.95, 1.95, 0.05], MAT.feltRed, MAT.dark);
  const felt = new Paint(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = (x + 0.5 - 16) / 15, dy = (y + 0.5 - 16) / 11;
    const d = dx * dx + dy * dy;
    if (d > 1.0) continue;
    felt.set(x, y, d > 0.82 ? ((x + y) % 3 ? 0x3a1a10 : 0x4a2416) : (hsh(x, y, 2) > 0.85 ? 0x1e6a3a : 0x22783f));
  }
  for (let k = 0; k < 5; k++) { felt.rect(8 + k * 3, 14, 2, 4, 0xf8f4ec); felt.set(8 + k * 3, 15, k % 2 ? 0xd82838 : 0x1a1a24); }
  felt.rect(15, 21, 3, 2, 0xe8b440);
  // pedestal and top
  blk(ctx, [0.85, 0.85, 0.05], [1.15, 1.15, 0.55], MAT.dark);
  c.box([0.2, 0.35, 0.55], [1.8, 1.65, 0.62], whole(felt), F(L.get('a/maple_planks')), F(L.get('a/maple_planks')), 5);
  for (const [x, y] of [[0.5, 0.3], [1.0, 0.25], [1.5, 0.3], [0.15, 1.0], [1.85, 1.0], [0.5, 1.7], [1.0, 1.75], [1.5, 1.7]] as [number, number][]) {
    blk(ctx, [x - 0.1, y - 0.1, 0.05], [x + 0.1, y + 0.1, 0.35], MAT.feltRed, MAT.dark);
  }
  chips(ctx, 0.6, 0.6, 0.62, 5, CHIP_COLS[0]);
  chips(ctx, 1.4, 1.35, 0.62, 4, CHIP_COLS[3]);
  chips(ctx, 1.0, 1.45, 0.62, 2 + Math.floor(f * 4), CHIP_COLS[5]);
  blk(ctx, [0.98, 0.98, 1.4], [1.02, 1.02, 2.3], MAT.steel);
  lamp(ctx, [1.0, 1.0, 1.25], [160, 120, 60], 2.2);
}

// ───────────────────────── services ─────────────────────────

/** Wishing well with coins glinting in it. */
export function wishingWell(c: Canvas, L: TexLib, f = 0, wellModel: (c: Canvas, L: TexLib, f: number) => void): void {
  mats(L);
  wellModel(c, L, f);
  for (let k = 0; k < 4; k++) {
    const glint = (Math.floor(f * 4) + k) % 4 === 0;
    c.sprite([0.35 + (k % 2) * 0.25, 0.35 + Math.floor(k / 2) * 0.25, 0.41], { tex: new Paint(3, 2).rect(0, 0, 3, 2, glint ? 0xfff6c0 : 0xe8b440), glow: glint }, 6, 2, 0.4);
  }
}

/** Cashier cage: brass bars over a counter, stacks of chips behind. */
export function cashier(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.1, 0.1, 0], [0.9, 0.9, 0.55], MAT.mahogany, MAT.dark);
  blk(ctx, [0.08, 0.08, 0.55], [0.92, 0.92, 0.6], MAT.marble);
  const bars = new Paint();
  for (let x = 0; x < 16; x += 3) bars.rect(x, 0, 1, 16, 0xd8a83a);
  bars.rect(0, 0, 16, 1, 0xd8a83a);
  for (const [o, e] of [[[0.1, 0.88, 0.6], [0.8, 0, 0]], [[0.88, 0.88, 0.6], [0, -0.78, 0]]] as [V3, V3][]) c.quad([o[0], o[1], o[2] + 0.7], e, [0, 0, -0.7], F(bars), [1, 1, 1], 6, 0.01);
  for (let k = 0; k < 4; k++) chips(ctx, 0.25 + (k % 2) * 0.2, 0.25 + Math.floor(k / 2) * 0.2, 0.6, 3 + ((k + Math.floor(f * 4)) % 4), CHIP_COLS[k]);
  blk(ctx, [0.08, 0.08, 1.3], [0.92, 0.92, 1.38], MAT.gold);
  c.box([0.2, 0.75, 1.38], [0.8, 0.9, 1.6], F(L.get(MAT.gold)), whole(signTex('CASHIER', 30, 8, 0x1a1408, 0xffd040, 0xb8862a, f), { glow: true }), F(L.get(MAT.gold)), 6);
  lamp(ctx, [0.5, 0.5, 1.05]);
}

/** Sky Bar: a counter with stools, shelves of bottles, an awning. */
export function bar(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  floorSlab(ctx, MAT.slate);
  blk(ctx, [0.08, 0.08, 0.06], [0.92, 0.25, 1.1], MAT.dark); // back shelf
  for (let k = 0; k < 5; k++) for (let s = 0; s < 2; s++) c.sprite([0.16 + k * 0.17, 0.27, 0.45 + s * 0.35], { tex: L.get(k % 2 ? 'as/glass bottle' : 'as/glass bottle 2') }, 6, 1);
  blk(ctx, [0.1, 0.45, 0.06], [0.9, 0.62, 0.55], MAT.mahogany, MAT.dark);
  blk(ctx, [0.08, 0.43, 0.55], [0.92, 0.64, 0.6], MAT.marble);
  c.sprite([0.3, 0.53, 0.6], { tex: L.get('as/mug') }, 6, 1);
  for (const x of [0.25, 0.5, 0.75]) stool(ctx, x, 0.82);
  const aw = stripes(0x3a6ad8, 0xf0e2c4);
  for (const x of [0.08, 0.86]) blk(ctx, [x, 0.08, 1.1], [x + 0.06, 0.14, 1.45], MAT.gold);
  c.box([0.04, 0.04, 1.45], [0.96, 0.5, 1.52], F(aw), F(aw), F(aw), 6);
  c.box([0.25, 0.04, 1.52], [0.75, 0.14, 1.72], F(L.get(MAT.gold)), whole(signTex('BAR', 16, 8, 0x0a1a3a, 0x8ae8ff, 0x3a6ad8, f), { glow: true }), F(L.get(MAT.gold)), 6);
  c.light([0.5, 0.4, 1.1], [60, 100, 160], 1.4);
}

/** Cloud Hotel: a little marble tower with lit windows. */
export function hotel(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  const floors = 3;
  for (let k = 0; k < floors; k++) {
    const lit = hsh(k, 3, Math.floor(f * 2)) > 0.3;
    c.box([0.12, 0.12, k * 0.7], [0.88, 0.88, (k + 1) * 0.7], F(L.get(MAT.marbleB)), F(windowTex(L, lit)), F(windowTex(L, !lit)), 5);
    blk(ctx, [0.1, 0.1, (k + 1) * 0.7 - 0.04], [0.9, 0.9, (k + 1) * 0.7], MAT.gold);
  }
  c.quad([0.4, 0.885, 0.4], [0.2, 0, 0], [0, 0, -0.4], F(new Paint().rect(0, 0, 16, 16, 0x5a2a1a).rect(2, 2, 12, 14, 0x8a4a2a).set(11, 9, 0xe8b440)), [1, 1, 1], 6, 0.01);
  const aw = stripes(0xb82838, 0xf0e2c4);
  c.box([0.3, 0.88, 0.42], [0.7, 1.0, 0.48], F(aw), F(aw), F(aw), 6);
  for (let k = 0; k < 3; k++) blk(ctx, [0.06 + k * 0.08, 0.06 + k * 0.08, 2.1 + k * 0.1], [0.94 - k * 0.08, 0.94 - k * 0.08, 2.2 + k * 0.1], k === 2 ? MAT.gold : MAT.slate);
  c.box([0.2, 0.86, 1.6], [0.8, 0.92, 1.9], F(L.get(MAT.gold)), whole(signTex('HOTEL', 22, 9, 0x2a0a14, 0xff9ac8, 0xe8b440, f), { glow: true }), F(L.get(MAT.gold)), 6);
  c.light([0.5, 0.9, 1.0], [150, 110, 60], 1.6);
  c.light([0.5, 0.9, 1.8], [160, 60, 110], 1.2);
}

/** Airship dock: a pier off the edge with mooring posts and a moored balloon. */
export function dock(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.05, 0.25, 0], [0.95, 0.75, 0.12], 'a/maple_planks', 'a/maple_log_side');
  for (const [x, y] of [[0.08, 0.22], [0.82, 0.22], [0.08, 0.68], [0.82, 0.68]]) blk(ctx, [x, y, 0], [x + 0.1, y + 0.1, 0.5], 'a/oak_log_top', 'a/oak_log_side');
  lamp(ctx, [0.87, 0.73, 0.5]);
  // moored balloon above the pier
  const z = 1.1 + Math.sin(f * TAU) * 0.06;
  const cloth = stripes(0xe8b440, 0x2a3a6a, 3);
  const prof = [0.14, 0.24, 0.3, 0.3, 0.24, 0.14];
  for (let k = 0; k < prof.length; k++) { const r = prof[k]; c.box([0.5 - r * 1.3, 0.5 - r, z + 0.3 + k * 0.1], [0.5 + r * 1.3, 0.5 + r, z + 0.4 + k * 0.1], F(cloth), F(cloth), F(cloth, { tint: [0.9, 0.9, 0.95] }), 6); }
  blk(ctx, [0.3, 0.38, z], [0.7, 0.62, z + 0.18], 'a/maple_planks');
  c.quad([0.5, 0.5, 0.12], [0, 0, 0.001], [0, 0, z - 0.12], F(new Paint().rect(7, 0, 1, 16, 0x6a4a2a)), [1, 1, 1], 6, 0.1);
}

/** Gold vault: a steel strongroom with a round door and gold bars. */
export function vault(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  const door = new Paint(16, 16, L.get(MAT.steel));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d < 6.5 && d > 5.5) door.set(x, y, 0x5a5a6a); if (d < 1.5) door.set(x, y, 0xe8b440); }
  const a = f * TAU;
  for (let k = 0; k < 3; k++) { const b = a + (k * TAU) / 3; for (let r = 2; r < 5; r++) door.set(Math.round(8 + Math.cos(b) * r), Math.round(8 + Math.sin(b) * r), 0xe8b440); }
  c.box([0.1, 0.1, 0], [0.9, 0.9, 1.1], F(L.get(MAT.steel)), whole(door), F(L.get(MAT.steel), { tint: [0.9, 0.9, 1] }), 5);
  blk(ctx, [0.08, 0.08, 1.1], [0.92, 0.92, 1.18], MAT.gold);
  for (let k = 0; k < 3; k++) c.box([0.2 + k * 0.2, 0.3, 1.18], [0.35 + k * 0.2, 0.7, 1.28], F(L.get(MAT.gold)), F(L.get(MAT.gold)), F(L.get(MAT.gold), { tint: [0.9, 0.8, 0.6] }), 6);
  c.box([0.3, 0.42, 1.28], [0.5, 0.62, 1.38], F(L.get(MAT.gold)), F(L.get(MAT.gold)), F(L.get(MAT.gold)), 6);
}

/** Show stage: a raised platform with red curtains and spotlights. */
export function stage(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.04, 0.04, 0], [0.96, 0.96, 0.3], MAT.oak, MAT.dark);
  blk(ctx, [0.04, 0.04, 0.3], [0.96, 0.18, 1.6], MAT.feltRed);
  for (const x of [0.04, 0.84]) blk(ctx, [x, 0.04, 0.3], [x + 0.12, 0.6, 1.6], MAT.feltRed, MAT.feltRed, MAT.feltRed, 5, { tint: [0.85, 0.8, 0.8] });
  blk(ctx, [0.0, 0.0, 1.6], [1.0, 0.65, 1.75], MAT.gold);
  // a star performer: a glowing star turning
  const st = new Paint(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const a = Math.atan2(y - 7.5, x - 7.5) + f * TAU; const d = Math.hypot(x - 7.5, y - 7.5); if (d < 3 + 4 * Math.abs(Math.cos(a * 2.5))) st.set(x, y, d < 2.5 ? 0xfffff0 : 0xffd040); }
  c.sprite([0.5, 0.5, 0.55 + Math.sin(f * TAU) * 0.05], { tex: st, glow: true }, 6, 2, 0.5);
  for (const x of [0.15, 0.85]) { blk(ctx, [x - 0.04, 0.85, 0.3], [x + 0.04, 0.93, 0.5], MAT.steel); lamp(ctx, [x, 0.89, 0.5], [170, 150, 90], 1.8); }
}

// ───────────────────────── decor ─────────────────────────

export function palmPlanter(c: Canvas, L: TexLib, f: number, palm: (c: Canvas, L: TexLib, seed: number, sway: number) => void): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.3, 0.3, 0], [0.7, 0.7, 0.3], 'as/glazed terracotta', 'as/glazed terracotta', 'as/glazed terracotta', 5, { tint: [1.05, 0.85, 0.7] });
  blk(ctx, [0.32, 0.32, 0.3], [0.68, 0.68, 0.31], 'a/dirt');
  c.at(0, 0);
  palm(c, L, 4, Math.sin(f * TAU));
}

export function velvetRope(c: Canvas, L: TexLib, dir: number): void {
  mats(L);
  const ctx = { c, L };
  const along = dir % 2 === 0;
  const posts: [number, number][] = along ? [[0.08, 0.5], [0.92, 0.5]] : [[0.5, 0.08], [0.5, 0.92]];
  for (const [x, y] of posts) {
    blk(ctx, [x - 0.06, y - 0.06, 0], [x + 0.06, y + 0.06, 0.05], MAT.gold);
    blk(ctx, [x - 0.025, y - 0.025, 0.05], [x + 0.025, y + 0.025, 0.55], MAT.gold);
    blk(ctx, [x - 0.045, y - 0.045, 0.55], [x + 0.045, y + 0.045, 0.62], MAT.gold);
  }
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) / 8, sag = Math.sin(t * Math.PI) * 0.12;
    const x = along ? 0.08 + t * 0.84 : 0.5, y = along ? 0.5 : 0.08 + t * 0.84;
    blk(ctx, [x - (along ? 0.06 : 0.02), y - (along ? 0.02 : 0.06), 0.5 - sag], [x + (along ? 0.06 : 0.02), y + (along ? 0.02 : 0.06), 0.54 - sag], MAT.feltRed);
  }
}

export function neonSign(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.42, 0.42, 0], [0.58, 0.58, 0.08], MAT.slate);
  blk(ctx, [0.47, 0.47, 0.08], [0.53, 0.53, 1.0], MAT.steel);
  const on = f < 0.75;
  c.box([0.1, 0.45, 1.0], [0.9, 0.55, 1.45], F(L.get(MAT.obsidian)), whole(signTex(on ? 'OPEN' : 'OPEN', 24, 12, 0x1a0a20, on ? 0xff6ad8 : 0x6a2a5a, on ? 0xffd040 : 0x6a5a2a, f), { glow: true }), F(L.get(MAT.obsidian)), 6);
  c.light([0.5, 0.6, 1.2], [170, 60, 140], 1.5);
}

export function chipTower(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.2, 0.2, 0], [0.8, 0.8, 0.1], MAT.marbleB);
  const stacks: [number, number, number][] = [[0.38, 0.38, 30], [0.62, 0.4, 22], [0.4, 0.62, 16], [0.62, 0.62, 26]];
  stacks.forEach(([x, y, n], i) => chips(ctx, x, y, 0.1, n + (i === Math.floor(f * 4) ? 1 : 0), CHIP_COLS[i], 0.1));
}

export function diceStatue(c: Canvas, L: TexLib): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.1, 0.1, 0], [0.9, 0.9, 0.2], MAT.marbleB);
  const big = (x: number, y: number, z: number, s: number, faces: [number, number, number]) =>
    c.box([x, y, z], [x + s, y + s, z + s], whole(pipTex(faces[0], 0xf0ece8)), whole(pipTex(faces[1], 0xf0ece8)), whole(pipTex(faces[2], 0xf0ece8)), 6);
  big(0.14, 0.4, 0.2, 0.42, [5, 6, 4]);
  big(0.5, 0.18, 0.2, 0.36, [2, 3, 1]);
}

export function goldenCat(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.15, 0.15, 0], [0.85, 0.85, 0.15], MAT.feltRed, MAT.gold);
  const g = MAT.gold;
  blk(ctx, [0.28, 0.3, 0.15], [0.72, 0.7, 0.75], g);
  blk(ctx, [0.25, 0.28, 0.75], [0.75, 0.72, 1.2], g);
  for (const x of [0.28, 0.62]) blk(ctx, [x, 0.38, 1.2], [x + 0.1, 0.5, 1.32], g);
  const face = new Paint(16, 16, L.get(g)).rect(3, 5, 3, 2, 0x1a1a24).rect(10, 5, 3, 2, 0x1a1a24).rect(7, 9, 2, 1, 0xd84a5a).rect(2, 11, 12, 1, 0xd84a3a);
  c.quad([0.25, 0.721, 1.2], [0.5, 0, 0], [0, 0, -0.45], F(face), [1, 1, 1], 6, 0.01);
  const wave = Math.sin(f * TAU) * 0.08;
  blk(ctx, [0.7, 0.5, 0.8 + wave], [0.82, 0.62, 1.25 + wave], g);
  c.quad([0.32, 0.705, 0.6], [0.36, 0, 0], [0, 0, -0.3], F(new Paint().rect(0, 0, 16, 16, 0xf8f4ec).frame(0, 0, 16, 16, 0xb8862a)), [1, 1, 1], 6, 0.01);
  c.light([0.5, 0.75, 0.9], [150, 120, 40], 1.2);
}

export function aceMonument(c: Canvas, L: TexLib, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.08, 0.08, 0], [0.92, 0.92, 0.25], MAT.marbleB);
  blk(ctx, [0.18, 0.18, 0.25], [0.82, 0.82, 0.45], MAT.marble);
  const card = new Paint(16, 24).rect(0, 0, 16, 24, 0xf8f4ec).frame(0, 0, 16, 24, 0xe8b440);
  card.draw(['......a.......', '.....aaa......', '....aaaaa.....', '...aaaaaaa....', '..aaaaaaaaa...', '..aaaaaaaaa...', '...aa.a.aa....', '......a.......', '.....aaa......'], { a: 0x1a1a24 }, 1, 7);
  text(card, 'A', 2, 2, 0x1a1a24);
  const tilt = Math.sin(f * TAU) * 0.02;
  c.box([0.25, 0.46, 0.45], [0.75, 0.54, 1.95 + tilt], F(L.get(MAT.gold)), whole(card), F(L.get(MAT.gold)), 6);
  c.light([0.5, 0.6, 1.2], [150, 120, 50], 1.6);
}

// ───────────────────────── the wonder ─────────────────────────

/** The Pokerforge (3×3), by stage (0 foundation … 3 complete). */
export function pokerforge(c: Canvas, L: TexLib, stageN: number, f = 0): void {
  mats(L);
  const ctx = { c, L };
  blk(ctx, [0.05, 0.05, 0], [2.95, 2.95, 0.25], MAT.marbleB);
  blk(ctx, [0.2, 0.2, 0.25], [2.8, 2.8, 0.4], MAT.gold);
  const suits = ['♠', '♥', '♦', '♣'];
  if (stageN === 0) {
    // scaffolding
    for (const [x, y] of [[0.4, 0.4], [2.4, 0.4], [0.4, 2.4], [2.4, 2.4]]) blk(ctx, [x, y, 0.4], [x + 0.12, y + 0.12, 1.6], 'a/oak_log_side');
    for (const z of [0.9, 1.5]) { blk(ctx, [0.4, 0.4, z], [2.52, 0.52, z + 0.06], MAT.oak); blk(ctx, [0.4, 0.4, z], [0.52, 2.52, z + 0.06], MAT.oak); }
    blk(ctx, [1.0, 1.0, 0.4], [2.0, 2.0, 0.8], MAT.marble);
    return;
  }
  const tiers = stageN === 1 ? 1 : stageN === 2 ? 2 : 3;
  let z = 0.4;
  for (let t = 0; t < tiers; t++) {
    const inset = 0.45 + t * 0.35, h = 1.1 - t * 0.15;
    c.box([inset, inset, z], [3 - inset, 3 - inset, z + h], F(L.get(MAT.marble)), F(windowTex(L, true)), F(windowTex(L, t % 2 === 0)), 5);
    blk(ctx, [inset - 0.06, inset - 0.06, z + h], [3.06 - inset, 3.06 - inset, z + h + 0.1], MAT.gold);
    // a suit emblem on each visible face
    const em = new Paint(16, 16).rect(0, 0, 16, 16, 0x1a0a20).frame(0, 0, 16, 16, 0xe8b440);
    text(em, suits[t % 4], 6, 5, t % 2 ? 0xff4a5a : 0xf8f4ec);
    c.quad([1.25, 3 - inset + 0.01, z + h * 0.75], [0.5, 0, 0], [0, 0, -0.5], F(em, { glow: true }), [1, 1, 1], 6, 0.01);
    c.quad([3 - inset + 0.01, 1.75, z + h * 0.75], [0, -0.5, 0], [0, 0, -0.5], F(em, { glow: true }), [1, 1, 1], 6, 0.01);
    z += h + 0.1;
  }
  if (stageN >= 3) {
    // the crown: a turning golden spade lit from within
    blk(ctx, [1.3, 1.3, z], [1.7, 1.7, z + 0.6], MAT.gold);
    const sp = new Paint(16, 16);
    sp.draw(['.......a........', '......aaa.......', '.....aaaaa......', '....aaaaaaa.....', '...aaaaaaaaa....', '..aaaaaaaaaaa...', '..aaaaaaaaaaa...', '...aaa.a.aaa....', '.......a........', '......aaa.......', '.....aaaaa......'], { a: f < 0.5 ? 0xfff2b0 : 0xffd040 }, 0, 2);
    c.sprite([1.5, 1.5, z + 0.6], { tex: sp, glow: true }, 6, 3, 0.5);
    c.light([1.5, 1.5, z + 0.9], [180, 150, 60], 3);
    for (let k = 0; k < 4; k++) { const a = f * TAU + (k * TAU) / 4; c.sprite([1.5 + Math.cos(a) * 0.9, 1.5 + Math.sin(a) * 0.9, z + 0.3], { tex: new Paint(3, 3).rect(0, 0, 3, 3, CHIP_COLS[k]).rect(1, 1, 1, 1, 0xffffff), glow: true }, 6, 2, 0.6); }
  }
  c.light([1.5, 3.0, 1.0], [150, 110, 50], 2.2);
}
