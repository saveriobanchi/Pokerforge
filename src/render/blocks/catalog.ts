import { CONTEXT_ID, DECOR_SETS, columnPiece, decor, fallTex, topPiece, type TopKind } from './models/terrain';
import { BUILDINGS } from '../../core/content/buildings';
import { TOKENS } from '../../core/content/tokens';
import * as B from './models/buildings';
import * as K from './models/casino';
import * as N from './models/nature';
import * as I from './icons';
import { Canvas, type Tex } from './iso';
import { type Loader, Paint, TexLib } from './tex';

/**
 * Everything the game draws, as bake jobs for the block renderer. Each job
 * renders one or more images; scripts/bake-art.mjs runs them in parallel
 * (injecting a PNG loader for the CC0 texture packs) and packs the results.
 */

/** Art pixels per world pixel (16×16 textures land at 2×2 world px per texel). */
export const ART_R = 1;

export interface Image { w: number; h: number; data: Uint8ClampedArray; ax: number; ay: number }
type Draw = (c: Canvas, L: TexLib, f: number, v: string) => void;

export interface SpriteSpec {
  frames: number;
  fps: number;
  make: Draw;
  variants?: Record<string, number>;
  main?: string;
  lamp?: boolean;
  /** Smoke source in block units on the footprint (x, y, z). */
  smoke?: [number, number, number];
  /** Quarter turns added to a d0…d3 variant's direction when baked. */
  turnOffset?: number;
}

const sway = (f: number) => Math.sin(f * Math.PI * 2);

export const SPRITES: Record<string, SpriteSpec> = {
  // nature & garden decor (from Aetherforge)
  tree: { frames: 2, fps: 1.2, make: (c, L, f) => N.tree(c, L, 'oak', 1, sway(f), 10) },
  hedge: { frames: 1, fps: 1, make: (c, L) => B.hedge(c, L) },
  flower_bed: { frames: 1, fps: 1, make: (c, L) => B.flowerBed(c, L) },
  bench: { frames: 1, fps: 1, main: 'd0', variants: { d0: 1, d1: 1 }, make: (c, L, _f, v) => B.bench(c, L, Number(v.slice(1))) },
  lamp_post: { frames: 1, fps: 1, make: (c, L) => B.lampPost(c, L) },
  fountain: { frames: 4, fps: 6, make: (c, L, f) => B.fountain(c, L, f) },
  gazebo: { frames: 1, fps: 1, make: (c, L) => B.gazebo(c, L) },
  statue: { frames: 1, fps: 1, make: (c, L) => B.statue(c, L) },
  star_arch: { frames: 4, fps: 3, make: (c, L, f) => B.starArch(c, L, f) },
  crystal_lamp: { frames: 4, fps: 3, make: (c, L, f) => B.crystalLamp(c, L, f) },
  banner: { frames: 4, fps: 4, make: (c, L, f) => B.bannerPole(c, L, f) },
  palm: { frames: 2, fps: 1.2, make: (c, L, f) => K.palmPlanter(c, L, f, (cc, LL, seed, sw) => N.palm(cc, LL, seed, sw * 0.5, 0)) },
  // casino decor
  velvet_rope: { frames: 1, fps: 1, main: 'd0', variants: { d0: 1, d1: 1 }, make: (c, L, _f, v) => K.velvetRope(c, L, Number(v.slice(1))) },
  neon_sign: { frames: 4, fps: 3, make: (c, L, f) => K.neonSign(c, L, f) },
  chip_tower: { frames: 4, fps: 2, make: (c, L, f) => K.chipTower(c, L, f) },
  dice_statue: { frames: 1, fps: 1, make: (c, L) => K.diceStatue(c, L) },
  golden_cat: { frames: 4, fps: 4, make: (c, L, f) => K.goldenCat(c, L, f) },
  monument: { frames: 2, fps: 1, make: (c, L, f) => K.aceMonument(c, L, f) },
  // services
  well: { frames: 4, fps: 3, make: (c, L, f) => K.wishingWell(c, L, f, B.well) },
  cashier: { frames: 4, fps: 3, make: (c, L, f) => K.cashier(c, L, f), lamp: true },
  bar: { frames: 4, fps: 3, make: (c, L, f) => K.bar(c, L, f) },
  hotel: { frames: 4, fps: 1, make: (c, L, f) => K.hotel(c, L, f) },
  dock: { frames: 4, fps: 2, make: (c, L, f) => K.dock(c, L, f) },
  vault: { frames: 6, fps: 3, make: (c, L, f) => K.vault(c, L, f) },
  stage: { frames: 6, fps: 4, make: (c, L, f) => K.stage(c, L, f) },
  // tables
  coin_stand: { frames: 8, fps: 8, make: (c, L, f) => K.coinStand(c, L, f), lamp: true },
  slots: { frames: 6, fps: 8, make: (c, L, f) => K.slots(c, L, f), lamp: true },
  dice_table: { frames: 6, fps: 6, make: (c, L, f) => K.diceTable(c, L, f), lamp: true },
  scratch_kiosk: { frames: 4, fps: 3, make: (c, L, f) => K.scratchKiosk(c, L, f), lamp: true },
  blackjack: { frames: 4, fps: 2, make: (c, L, f) => K.blackjack(c, L, f), lamp: true },
  roulette: { frames: 8, fps: 8, make: (c, L, f) => K.roulette(c, L, f), lamp: true },
  plinko: { frames: 8, fps: 8, make: (c, L, f) => K.plinko(c, L, f), lamp: true },
  fortune_wheel: { frames: 8, fps: 6, make: (c, L, f) => K.fortuneWheel(c, L, f), lamp: true },
  video_poker: { frames: 4, fps: 2, make: (c, L, f) => K.videoPoker(c, L, f), lamp: true },
  gem_mine: { frames: 5, fps: 4, make: (c, L, f) => K.gemMine(c, L, f), lamp: true },
  keno: { frames: 4, fps: 3, make: (c, L, f) => K.keno(c, L, f), lamp: true },
  crash_pad: { frames: 8, fps: 4, make: (c, L, f) => K.crashPad(c, L, f), lamp: true },
  baccarat: { frames: 2, fps: 1, make: (c, L, f) => K.baccarat(c, L, f), lamp: true },
  derby: { frames: 8, fps: 6, make: (c, L, f) => K.derby(c, L, f), lamp: true },
  holdem: { frames: 4, fps: 2, make: (c, L, f) => K.holdem(c, L, f), lamp: true },
  pokerforge: { frames: 1, fps: 6, main: 'st0', variants: { st0: 1, st1: 1, st2: 1, st3: 6 }, make: (c, L, f, v) => K.pokerforge(c, L, Number(v.slice(2)), f) },
};

const SIZE: Record<string, number> = { pokerforge: 3, derby: 2, holdem: 2 };

/**
 * Rotatable buildings are baked facing all four ways (d0…d3), the model
 * turned a quarter at a time.
 */
for (const [type, sp] of Object.entries(SPRITES)) {
  if (!BUILDINGS[type]?.rotatable) continue;
  const hadDirs = !!sp.variants?.d0;
  if (sp.variants && !hadDirs) continue;
  if (hadDirs) continue; // draws its own directions (ropes, benches)
  const base = sp.make, n = sp.frames;
  sp.variants = { d0: n, d1: n, d2: n, d3: n };
  sp.main = 'd0';
  sp.turnOffset = 0;
  sp.make = (c, L, f, v) => { c.turn = Number(v.slice(1)) % 4; base(c, L, f, '_'); };
}

// ───────────────────────── rendering ─────────────────────────

let lib: TexLib | null = null;
/** The bake script injects the PNG loader before running jobs. */
export function setLoader(load: Loader): void { lib = new TexLib(load); }
function L(): TexLib { if (!lib) throw new Error('texture loader not set'); return lib; }

interface Frame { size?: number; S?: number; above?: number; below?: number }

/** Fresh canvas big enough for a footprint; returns it with the anchor (footprint centre at z = 0). */
function canvas(o: Frame = {}): { c: Canvas; ax: number; ay: number } {
  const size = o.size ?? 1, S = o.S ?? 1, above = o.above ?? 7, below = o.below ?? 1;
  const W = Math.ceil((64 * size + 64 * above + 64) * S), H = Math.ceil((32 * size + 32 * (above + below) + 96) * S);
  const ox = Math.round(W / 2 - 16 * above * S * 0.5), oy = Math.round((32 * above + 48) * S);
  const c = new Canvas(W, H, ox, oy);
  c.S = S;
  c.tsize = size;
  const [ax, ay] = c.proj(size / 2, size / 2, 0);
  return { c, ax, ay };
}

function image(c: Canvas, ax: number, ay: number, drop = -999): Image {
  const data = new Uint8ClampedArray(c.col);
  if (drop !== -999) for (let k = 0; k < c.w * c.h; k++) if (c.id[k] === drop && c.dep[k] > -1e8) data[k * 4 + 3] = 0;
  return { w: c.w, h: c.h, data, ax, ay };
}

/** Crop images of equal size to the union of their opaque pixels (anchors adjusted). */
export function cropSet(imgs: Image[]): Image[] {
  const { w, h } = imgs[0];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const im of imgs) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (im.data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return imgs.map((im) => ({ ...im, w: 1, h: 1, data: new Uint8ClampedArray(4) }));
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  return imgs.map((im) => {
    const d = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) d.set(im.data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * nw * 4);
    return { w: nw, h: nh, data: d, ax: im.ax - x0, ay: im.ay - y0 };
  });
}

/** An object on its footprint: casts shadows on itself and on the (virtual) ground. */
function object(draw: (c: Canvas) => void, o: Frame = {}): { img: Image; c: Canvas; ax: number; ay: number } {
  const { c, ax, ay } = canvas(o);
  c.castOn = true;
  draw(c);
  c.castOn = false;
  c.finish({ ground: true });
  return { img: image(c, ax, ay), c, ax, ay };
}

export type JobOut = [string, Image][];
export interface Meta { lights: [number, number, number, number][]; smoke?: [number, number]; smoke4?: [number, number][]; lights4?: [number, number][][] }
export const META: Record<string, Meta> = {};

/** Offset in world px of a block-space point from the footprint centre. */
function px(size: number, p: [number, number, number]): [number, number] {
  const x = p[0] - size / 2, y = p[1] - size / 2;
  return [Math.round((x - y) * 32), Math.round((x + y) * 16 - p[2] * 32)];
}

/** Night glows for the runtime, derived from the point lights a model places. */
function lightsOf(c: Canvas, size: number): [number, number, number, number][] {
  return c.lights.map((l) => {
    const m = Math.max(...l.c, 1), k = 255 / m;
    const col = (Math.round(l.c[0] * k) << 16) | (Math.round(l.c[1] * k) << 8) | Math.round(l.c[2] * k);
    const [x, y] = px(size, l.p);
    return [x, y, col, Math.round(l.r * 16)];
  });
}

export const JOBS: Record<string, () => JobOut> = {};

for (const [type, sp] of Object.entries(SPRITES)) {
  JOBS['sprite:' + type] = () => {
    const size = SIZE[type] ?? 1;
    const sets = sp.variants ?? { _: sp.frames };
    const keys: string[] = [], imgs: Image[] = [];
    let lights: Meta['lights'] = [];
    const lights4: Meta['lights'][] = [];
    for (const [v, n] of Object.entries(sets)) for (let i = 0; i < n; i++) {
      const r = object((c) => sp.make(c, L(), i / n, v), { size });
      if (v === (sp.main ?? '_') && i === 0) lights = lightsOf(r.c, size);
      if (/^d[0-3]$/.test(v) && i === 0) lights4[Number(v[1])] = lightsOf(r.c, size);
      // the last forge stage glows brightest; prefer the richest light set
      if (r.c.lights.length > lights.length) lights = lightsOf(r.c, size);
      keys.push(`${type}:${v}:${i}`);
      imgs.push(r.img);
    }
    const out = cropSet(imgs);
    const turned = (d: number) => { const c = new Canvas(1, 1, 0, 0); c.tsize = size; c.turn = (d + (sp.turnOffset ?? 0)) % 4; return px(size, c.rp(sp.smoke!)); };
    META[type] = { lights, smoke: sp.smoke ? px(size, sp.smoke) : undefined, smoke4: sp.smoke && sp.variants?.d3 ? [0, 1, 2, 3].map(turned) : undefined, lights4: lights4.length === 4 && lights.length ? lights4.map((l) => l.map(([x, y]) => [x, y] as [number, number])) : undefined };
    return [...keys.map((k, i) => [k, out[i]] as [string, Image]), [`meta:${type}`, { w: 1, h: 1, data: new Uint8ClampedArray(4), ax: 0, ay: 0, meta: META[type] } as Image]];
  };
}

// ───────────────────────── terrain ─────────────────────────

export const DEPTHS = [1, 2, 3, 4, 5, 6, 7];
export const COL_VARIANTS = 3;
export const TOP_VARIANTS = 2;
for (const d of DEPTHS) JOBS[`col:${d}`] = () => {
  const out: JobOut = [];
  for (let v = 0; v < COL_VARIANTS; v++) {
    const { c, ax, ay } = canvas({ above: 1, below: d + 2 });
    columnPiece(c, L(), d, v);
    c.finish({ rim: 1, outline: 0 });
    out.push([`col:${d}:${v}`, cropSet([image(c, ax, ay)])[0]]);
  }
  return out;
};
const FLOORS: TopKind[] = ['grass', 'stone', 'carpet', 'marble', 'gold'];
for (const fl of FLOORS) JOBS[`top:${fl}`] = () => {
  const out: JobOut = [];
  for (let mask = 0; mask < 16; mask++) for (let v = 0; v < TOP_VARIANTS; v++) {
    const { c, ax, ay } = canvas({ above: 2, below: 5 });
    topPiece(c, L(), fl, mask, v);
    c.finish({ outline: 0 });
    out.push([`top:${fl}:${mask}:${v}`, cropSet([image(c, ax, ay, CONTEXT_ID)])[0]]);
  }
  return out;
};

export const DECOR_KINDS = [...new Set(Object.values(DECOR_SETS).flat())];
export { DECOR_SETS };
export const DECOR_VARIANTS = 4;
JOBS['decor'] = () => {
  const out: JobOut = [];
  for (const k of DECOR_KINDS) for (let v = 0; v < DECOR_VARIANTS; v++) {
    const r = object((c) => decor(c, L(), k, v), { above: 2 });
    out.push([`decor:${k}:${v}`, cropSet([r.img])[0]]);
  }
  return out;
};

/** Waterfall frames: a screen-facing strip anchored at its lip (x centre, top). */
JOBS['fall'] = () => Array.from({ length: 6 }, (_, i): [string, Image] => {
  const t = fallTex(i / 6);
  const S = 2, w = t.w * S, hh = t.h * S;
  const data = new Uint8ClampedArray(w * hh * 4);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) data.set(t.data.subarray(((y >> 1) * t.w + (x >> 1)) * 4, ((y >> 1) * t.w + (x >> 1)) * 4 + 4), (y * w + x) * 4);
  return [`fall:${i}`, { w, h: hh, data, ax: w / 2, ay: 0 }];
});

JOBS['islets'] = () => {
  const out: JobOut = [];
  for (let i = 0; i < 5; i++) {
    const { c, ax, ay } = canvas({ size: 3, S: 0.5, above: 4, below: 6 });
    c.at(1, 1);
    N.islet(c, L(), i * 7 + 3, i % 2 === 0);
    c.at(0, 0);
    c.finish({ haze: false, outline: 0.4 });
    // far away: fade toward the sky haze, more toward the bottom
    const im = image(c, ax, ay);
    for (let k = 0; k < im.w * im.h; k++) {
      if (!im.data[k * 4 + 3]) continue;
      const t = 0.32 + 0.25 * (Math.floor(k / im.w) / im.h);
      im.data[k * 4] += (200 - im.data[k * 4]) * t; im.data[k * 4 + 1] += (214 - im.data[k * 4 + 1]) * t; im.data[k * 4 + 2] += (238 - im.data[k * 4 + 2]) * t;
    }
    out.push([`islet:${i}`, cropSet([im])[0]]);
  }
  return out;
};

/** Trader airship frames (the world floats it beside a trading post). */
JOBS['ship'] = () => {
  const imgs = [0, 1, 2, 3].map((i) => {
    // floats beyond the island: no ground shadow
    const { c, ax, ay } = canvas({ size: 2, above: 4 });
    B.airship(c, L(), i / 4);
    c.finish({});
    return image(c, ax, ay);
  });
  return cropSet(imgs).map((im, i) => [`ship:${i}`, im]);
};

// ───────────────────────── icons ─────────────────────────

type Cube = { cube: [string | Tex, (string | Tex)?, (string | Tex)?]; h?: number; tint?: [number, number, number]; glow?: boolean };

const TAU2 = Math.PI * 2;
const disc = (p: Paint, cx: number, cy: number, r: number, col: number, hi?: number, lo?: number) => {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy > r * r) continue;
    const s = (dx + dy) / (r * 1.4);
    p.set(x, y, hi !== undefined && s < -0.45 ? hi : lo !== undefined && s > 0.45 ? lo : col);
  }
  return p;
};
const ring = (p: Paint, cx: number, cy: number, r0: number, r1: number, a: number, b: number) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d >= r0 && d <= r1) p.set(x, y, (Math.atan2(y - cy, x - cx) * 3 + d) % 2 < 1 ? a : b);
  }
  return p;
};

function painted(): Record<string, () => Tex> {
  return {
    flour: () => new Paint().draw([
      '................',
      '......aaaa......',
      '.....abbbba.....',
      '......acca......',
      '.....abbbba.....',
      '....abbbbbba....',
      '...abbbbbbbba...',
      '...abbddbbbba...',
      '...abdeedbbba...',
      '...abbddbbbba...',
      '...abbbbbbbca...',
      '....abbbbbca....',
      '.....aaaaaa.....',
    ], { a: 0x6a5a48, b: 0xf0ead8, c: 0xc8bca0, d: 0xd8a848, e: 0xf8d880 }, 0, 1),
    egg: () => new Paint().draw([
      '................',
      '................',
      '.......aa.......',
      '......abba......',
      '.....abbbba.....',
      '.....abcbba.....',
      '....abcbbbba....',
      '....abbbbbba....',
      '....abbbbbda....',
      '....abbbbdda....',
      '.....abbdda.....',
      '......aaaa......',
    ], { a: 0x6a4a30, b: 0xf4e4c8, c: 0xffffff, d: 0xd8bc98 }, 0, 1),
    cloth: () => new Paint().draw([
      '................',
      '................',
      '...aaaaaaaaaa...',
      '..abbbbbbbbbba..',
      '..abcbbcbbcbba..',
      '..adddddddddda..',
      '..abbbbbbbbbba..',
      '..abcbbcbbcbba..',
      '..adddddddddda..',
      '..abbbbbbbbbba..',
      '..abcbbcbbcbba..',
      '..adddddddddda..',
      '...aaaaaaaaaa...',
    ], { a: 0x2a3a5a, b: 0x5a8ad0, c: 0x9ac0f0, d: 0x3a5a9a }, 0, 1),
    pie: () => new Paint().draw([
      '................',
      '................',
      '................',
      '.....aaaaaa.....',
      '...aabbcbbbaa...',
      '..abbcbbbcbbba..',
      '..abdbbcbbdbba..',
      '.abbbbdbbbbbbba.',
      '.abcbbbbbcbbbba.',
      '.eaabbbbbbbbaae.',
      '.efeaaaaaaaaefe.',
      '..eeffffffffee..',
      '....eeeeeeee....',
    ], { a: 0x8a4a1a, b: 0xd89a4a, c: 0xf0c880, d: 0x8a1a3a, e: 0x6a6a7a, f: 0xc8c8d8 }, 0, 1),
    settler: () => new Paint().draw([
      '......aaaa......',
      '.....abbbba.....',
      '.....abccba.....',
      '.....acccca.....',
      '......acca......',
      '....aaddddaa....',
      '...adddddddda...',
      '...adaddddada...',
      '...acaddddaca...',
      '.....aeeeea.....',
      '.....aeaaea.....',
      '.....afa.afa....',
    ], { a: 0x2a1a12, b: 0x8a5a2a, c: 0xf0c8a0, d: 0x4a8a4a, e: 0x5a4a3a, f: 0x3a2a1a }, 0, 2),
    house: () => new Paint().draw([
      '.......aa.......',
      '......abba......',
      '.....abbbba.....',
      '....abbbbbba....',
      '...abbbbbbbba...',
      '..aaaaaaaaaaaa..',
      '...cddddddddc...',
      '...cdeedddffc...',
      '...cdeeddfffc...',
      '...cddddddffc...',
      '...cddddddffc...',
      '...cccccccccc...',
    ], { a: 0x5a1a12, b: 0xc84a2a, c: 0x5a3a22, d: 0xe8d0a0, e: 0x8ad0ff, f: 0x7a4a2a }, 0, 2),
    star: () => new Paint().draw([
      '.......a........',
      '......aba.......',
      '......aba.......',
      '.....abbba......',
      'aaaaaabcbaaaaaa.',
      '.abbbbcccbbbba..',
      '..abbbcccbbba...',
      '...abbbcbbba....',
      '....abbbbba.....',
      '...abbbabbba....',
      '..abbaa.aabba...',
      '..aaa.....aaa...',
    ], { a: 0x7a4a0a, b: 0xffd040, c: 0xfff6c0 }, 0, 2),
    wool: () => {
      const p = new Paint();
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const n = ((x * 7 + y * 13 + ((x * y) % 5)) % 9) / 9;
        p.set(x, y, n > 0.75 ? 0xffffff : n < 0.2 ? 0xd0ccc4 : 0xece8e0);
      }
      return p;
    },
    jar: () => new Paint().draw([
      '................',
      '....aaaaaaaa....',
      '....abbbbbba....',
      '...cccccccccc...',
      '...cddddddddc...',
      '...cdeeeeeedc...',
      '...cdeffeeedc...',
      '...cdeffeeedc...',
      '...cdeeeeeedc...',
      '...cdeeeeeedc...',
      '...cdeeeeeedc...',
      '...cddddddddc...',
      '...cccccccccc...',
    ], { a: 0x6a4a2a, b: 0xc89a64, c: 0x5a6a78, d: 0xb8e0f0, e: 0xffb83a, f: 0xfff0b0 }, 0, 1),
    preserves: () => new Paint().draw([
      '................',
      '....aaaaaaaa....',
      '...abbbbbbbba...',
      '...cccccccccc...',
      '...cddddddddc...',
      '...cdeeffeedc...',
      '...cdeeeeeedc...',
      '...cdgggggedc...',
      '...cdghhhhgdc...',
      '...cdgggggedc...',
      '...cdeeeeeedc...',
      '...cddddddddc...',
      '...cccccccccc...',
    ], { a: 0x8a2a2a, b: 0xd84a3a, c: 0x5a6a78, d: 0xb8e0f0, e: 0xc8402a, f: 0xff9a6a, g: 0xf0e2c4, h: 0x8a5a36 }, 0, 1),
    candle: () => new Paint().draw([
      '.......y........',
      '......yoy.......',
      '......yoy.......',
      '.......k........',
      '.....wwwww......',
      '.....wvvvw......',
      '.....wvvvw......',
      '.....wvvvw......',
      '.....wvvvw......',
      '.....wvvvw......',
      '.....wvvvw......',
      '....bbbbbbb.....',
      '...bcccccccb....',
      '....bbbbbbb.....',
    ], { y: 0xfff2a0, o: 0xff8a2a, k: 0x3a2418, w: 0xe8d8a8, v: 0xf8ecc8, b: 0x8a5a2a, c: 0xc8962a }, 0, 1),
    cider: () => new Paint().draw([
      '......aa........',
      '......bb........',
      '......cc........',
      '.....cddc.......',
      '....cddddc......',
      '....ceeeec......',
      '....cefffc......',
      '....cefeec......',
      '....ceeeec......',
      '....ceeeec......',
      '....ceeeec......',
      '....cccccc......',
    ], { a: 0x8a5a2a, b: 0xc89a64, c: 0x3a5a3a, d: 0x6a9a6a, e: 0xe89a3a, f: 0xffe0a0 }, 3, 2),
    orange: () => { const p = disc(new Paint(), 8, 9, 5.5, 0xf08a20, 0xffc060, 0xb85a10); p.rect(7, 2, 2, 2, 0x4a7a2a).rect(9, 2, 2, 1, 0x6aa63c); p.set(6, 7, 0xfff0c0); return p; },
    pear: () => { const p = disc(new Paint(), 8, 10, 4.8, 0xc8d040, 0xe8f080, 0x8a9a20); disc(p, 8, 6, 3, 0xc8d040, 0xe8f080, 0x8a9a20); p.rect(8, 1, 1, 3, 0x5a4428).rect(9, 2, 2, 1, 0x6aa63c); return p; },
    plum: () => { const p = disc(new Paint(), 6, 9, 3.6, 0x6a2a8a, 0x9a5ab8, 0x3a1a4a); disc(p, 10.5, 10, 3.6, 0x7a3a9a, 0xaa6ac8, 0x3a1a4a); return p.rect(8, 3, 1, 4, 0x5a4428).rect(9, 3, 2, 1, 0x6aa63c); },
    date: () => { const p = new Paint(); for (const [x, y] of [[5, 6], [9, 5], [7, 9], [11, 9], [4, 11]]) { p.rect(x, y, 3, 4, 0x8a4a1a); p.set(x, y, 0xc07a3a); p.set(x + 2, y + 3, 0x4a2008); } return p.rect(7, 2, 1, 4, 0x6a8a3a); },
    juice: () => new Paint().draw([
      '................',
      '...aaaaaaaaaa...',
      '...a........a...',
      '...abbbbbbbba...',
      '...abccccccba...',
      '...abccdcccba...',
      '...abcccccdba...',
      '...abccccccba...',
      '...abccccccba...',
      '...abccccccba...',
      '...abccccccba...',
      '....abbbbbba....',
      '....aaaaaaaa....',
    ], { a: 0x5a6a78, b: 0xb8e0f0, c: 0xf8a028, d: 0xffe0a0 }, 0, 1),
    basket: () => { const p = new Paint(); disc(p, 5, 6, 2.6, 0xc81828); disc(p, 9, 5, 2.8, 0xf08a20); disc(p, 12, 7, 2.4, 0x6a2a8a); disc(p, 7, 8, 2.4, 0xc8d040);
      for (let y = 8; y < 15; y++) for (let x = 2 + (y - 8) / 3; x < 14 - (y - 8) / 3; x++) p.set(Math.round(x), y, (Math.round(x) + y) % 3 ? 0xb8864a : 0x7a5228);
      return p.rect(2, 8, 12, 1, 0x5a3a1a); },
    coin: () => { const p = disc(new Paint(), 8, 8, 6.5, 0xe8b440, 0xfff0a0, 0x9a6a1a); disc(p, 8, 8, 4.2, 0xd8a03a); p.rect(7, 5, 2, 6, 0xfff0a0).rect(6, 6, 4, 1, 0xfff0a0).rect(6, 9, 4, 1, 0xfff0a0); return p; },
    up: () => new Paint().draw([
      '.......aa.......',
      '......abba......',
      '.....abbbba.....',
      '....abbbbbba....',
      '...aaabbbbaaa...',
      '.....abbbba.....',
      '.....abbbba.....',
      '.....abbbba.....',
      '.....aaaaaa.....',
      '................',
      '...cccccccccc...',
      '...cddddddddc...',
      '...cccccccccc...',
    ], { a: 0x2a5a1a, b: 0x8ae85a, c: 0x7a5a1a, d: 0xe8b440 }, 0, 1),
    sun: () => { const p = new Paint(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU2; p.set(Math.round(8 + Math.cos(a) * 6.5), Math.round(8 + Math.sin(a) * 6.5), 0xffd040); } return disc(p, 8, 8, 4.2, 0xffd040, 0xfff2a0, 0xe8962a); },
    cloud: () => { const p = new Paint(); disc(p, 6, 9, 3.6, 0xe8f0f8, 0xffffff, 0xa8b8c8); disc(p, 10, 8, 4.2, 0xe8f0f8, 0xffffff, 0xa8b8c8); return p.rect(3, 10, 11, 2, 0xe8f0f8); },
    rain: () => { const p = new Paint(); disc(p, 6, 6, 3.4, 0xc8d4e0, 0xe8f0f8, 0x8898a8); disc(p, 10, 5, 3.8, 0xc8d4e0, 0xe8f0f8, 0x8898a8); p.rect(3, 6, 11, 2, 0xc8d4e0); for (const [x, y] of [[4, 11], [8, 12], [12, 11], [6, 14], [10, 14]]) p.rect(x, y, 1, 2, 0x4a92cc); return p; },
    breeze: () => new Paint().draw([
      '................',
      '..........aa....',
      '...........a....',
      '.aaaaaaaaaa.....',
      '................',
      '...aaaaaaaaaaaa.',
      '..............a.',
      '.............a..',
      '..aaaaaaaa......',
      '..........a.....',
      '.........a......',
    ], { a: 0xd8eef8 }, 0, 2),
    fog: () => new Paint().rect(2, 4, 12, 2, 0xd8e0e8).rect(4, 7, 11, 2, 0xb8c4d0).rect(1, 10, 12, 2, 0xd8e0e8).rect(5, 13, 9, 2, 0xb8c4d0),
    stars: () => { const p = new Paint(); for (const [x, y, r] of [[5, 5, 2], [11, 9, 2], [4, 12, 1], [12, 3, 1]]) { p.rect(x - r, y, r * 2 + 1, 1, 0xfff2a0); p.rect(x, y - r, 1, r * 2 + 1, 0xfff2a0); p.set(x, y, 0xffffff); } return p.rect(8, 12, 6, 1, 0xffd040); },
    mist: () => { const p = new Paint(); disc(p, 5.5, 10, 3.6, 0xc8e6f2, 0xf2fbff, 0x8ec4dc); disc(p, 10.5, 9, 4.2, 0xd8f0f8, 0xffffff, 0x9acce0); disc(p, 8, 6, 3.2, 0xe8f8ff, 0xffffff, 0xb0d8ea); return p; },
    pebble: () => { const p = new Paint(); disc(p, 5, 10, 3, 0x8a8890, 0xb8b6c0, 0x5a5862); disc(p, 11, 11, 2.6, 0x9a9488, 0xc8c2b4, 0x6a6458); disc(p, 8, 5.5, 2.2, 0x7a7c88, 0xa8aab4, 0x4a4c58); return p; },
    dew: () => {
      const p = new Paint();
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 10;
        const inside = dy > 0 ? Math.hypot(dx, dy) < 4.6 : Math.abs(dx) < 4.6 * (1 + dy / 8) && dy > -8;
        if (inside) p.set(x, y, dx < -1.5 && dy < 1 ? 0xb8e6f4 : dx + dy > 4 ? 0x2a5a9a : 0x4a92cc);
      }
      p.set(6, 9, 0xffffff); p.set(6, 10, 0xffffff);
      return p;
    },
    twine: () => ring(disc(new Paint(), 8, 8, 6.5, 0xc8a86a), 8, 8, 1.5, 6.5, 0xa8884a, 0xd8b87a).rect(7, 7, 2, 2, 0x5a4428),
    wire: () => ring(new Paint(), 8, 8, 2.5, 6.5, 0xd08a4a, 0xf0b07a).rect(13, 7, 3, 1, 0xd08a4a),
    coil: () => ring(new Paint(), 8, 8, 2, 6.8, 0xffd060, 0xfff2b0).rect(6, 6, 4, 4, 0x8ad0ff),
    lens: () => { const p = disc(new Paint(), 8, 8, 6.5, 0xc8962a); disc(p, 8, 8, 5, 0x8ad0e8, 0xe0f6ff, 0x5a9ab8); p.set(6, 5, 0xffffff); p.set(5, 6, 0xffffff); return p; },
    gear: () => B.gearTex(0xd8a04a, 0x7a4a1a, 0),
    sack: () => { const p = disc(new Paint(), 8, 10, 5.5, 0xa07a4a, 0xc89a64, 0x6a4a2a); p.rect(6, 2, 4, 3, 0xa07a4a).rect(5, 4, 6, 1, 0x5a3a20).rect(7, 1, 2, 1, 0xc89a64); return p; },
    book: () => new Paint().draw([
      '................',
      '..aaaaaaaaaaa...',
      '..abbbbbbbbbba..',
      '..abbbbddbbbbac.',
      '..abbbdeedbbbac.',
      '..abbbbddbbbbac.',
      '..abbbbbbbbbbac.',
      '..abdddddddbbac.',
      '..abbbbbbbbbbac.',
      '..abbbbbbbbbbac.',
      '..abbbbbbbbbbac.',
      '..abbbbbbbbbbac.',
      '..aaaaaaaaaaaac.',
      '...cccccccccccc.',
      '................',
    ], { a: 0x3a2418, b: 0x8a3a2a, c: 0xf0e2c4, d: 0xe0b040, e: 0xfff2b0 }),
    eye: () => new Paint().draw([
      '................',
      '................',
      '................',
      '.....aaaaaa.....',
      '...aabbbbbbaa...',
      '..abbbccccbbba..',
      '.abbbcddddcbbba.',
      '.abbbcdedddbbba.',
      '.abbbcddddcbbba.',
      '..abbbccccbbba..',
      '...aabbbbbbaa...',
      '.....aaaaaa.....',
    ], { a: 0x2a2030, b: 0xf0ece0, c: 0x4a8ad0, d: 0x24406a, e: 0xffffff }),
    compass: () => {
      const p = disc(new Paint(), 8, 8, 7, 0xc8962a, 0xffd060, 0x7a5a1a);
      disc(p, 8, 8, 5.5, 0xf0e2c4);
      for (let i = 0; i < 4; i++) { p.set(8 - 1 + (i === 1 ? 1 : 0), 4 + i, 0xc83a2a); p.set(7 + (i === 1 ? 1 : 0), 12 - i, 0x5a5a62); }
      p.set(7, 7, 0x3a3440); p.set(8, 8, 0x3a3440);
      return p;
    },
  };
}

const tex = (t: string | Tex): Tex => (typeof t === 'string' ? L().get(t) : t);

/** Pixel art upscaled by an integer factor, tinted, with a 1 px dark outline. */
function flatImage(t0: Tex, k: number, tint: [number, number, number] = [1, 1, 1]): Image {
  const w = t0.w * k + 2, hh = t0.h * k + 2;
  const data = new Uint8ClampedArray(w * hh * 4);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < t0.w * k && y < t0.h * k && t0.data[(Math.floor(y / k) * t0.w + Math.floor(x / k)) * 4 + 3] >= 128;
  for (let y = -1; y <= t0.h * k; y++) for (let x = -1; x <= t0.w * k; x++) {
    const o = ((y + 1) * w + x + 1) * 4;
    if (solid(x, y)) {
      const i = (Math.floor(y / k) * t0.w + Math.floor(x / k)) * 4;
      data[o] = t0.data[i] * tint[0]; data[o + 1] = t0.data[i + 1] * tint[1]; data[o + 2] = t0.data[i + 2] * tint[2]; data[o + 3] = 255;
    } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
      data[o] = 30; data[o + 1] = 20; data[o + 2] = 36; data[o + 3] = 255;
    }
  }
  const [img] = cropSet([{ w, h: hh, data, ax: 0, ay: 0 }]);
  img.ax = Math.round(img.w / 2); img.ay = Math.round(img.h / 2);
  return img;
}

function cubeImage(d: Cube, S: number): Image {
  const { c } = canvas({ S, above: 2, below: 1 });
  const top = tex(d.cube[0]), side = tex(d.cube[1] ?? d.cube[0]), side2 = tex(d.cube[2] ?? d.cube[1] ?? d.cube[0]);
  const f = (t: Tex) => ({ tex: t, tint: d.tint, glow: d.glow });
  const z = d.h ?? 1;
  c.box([0, 0, 0], [1, 1, z], f(top), f(side), f(side2), 1);
  c.finish({ ao: 0, rim: 1.12, haze: false, outline: 0.7 });
  const [img] = cropSet([image(c, 0, 0)]);
  img.ax = Math.round(img.w / 2); img.ay = Math.round(img.h / 2);
  return img;
}

const UI: Record<string, () => Image> = {
  build: () => flatImage(L().get('as/default_tool_steelpick'), 2),
  stash: () => cubeImage({ cube: [new Paint(16, 16, L().get('a/oak_planks')).frame(0, 0, 16, 16, 0x4a2e1e), new Paint(16, 16, L().get('a/oak_planks')).frame(0, 0, 16, 16, 0x4a2e1e).rect(0, 6, 16, 1, 0x4a2e1e).rect(6, 5, 4, 4, 0xa8b0bc)] }, 0.5),
  craft: () => { const r = object((c) => B.workbench(c, L(), 0), { S: 0.5, above: 2 }); return center(r.img); },
  journal: () => flatImage(painted().book(), 2),
  book: () => flatImage(painted().book(), 2),
  eye: () => flatImage(painted().eye(), 2),
  world: () => cubeImage({ cube: ['a/grass_top', 'a/grass_side'] }, 0.5),
  research: () => flatImage(painted().lens(), 2),
  sack: () => flatImage(painted().sack(), 2),
  gear: () => flatImage(B.gearTex(0xc8c0b0, 0x5a5462, 0), 2),
  compass: () => flatImage(painted().compass(), 2),
  marks: () => flatImage(painted().coin(), 2),
  upgrade: () => flatImage(painted().up(), 2),
  charm: () => flatImage(new Paint().draw(['................', '..aa......aa....', '.abba....abba...', 'abbbbaaaabbbba..', 'abbbbbbbbbbbba..', 'abbbcbbbbbbbba..', '.abbbbbbbbbba...', '..abbbbbbbba....', '...abbbbbba.....', '....abbbba......', '.....abba.......', '......aa........'], { a: 0x5a1a2a, b: 0xe85a7a, c: 0xffc0d0 }, 1, 2), 2),
  chapter: () => flatImage(painted().book(), 2),
  ambition: () => flatImage(painted().star(), 2),
  expand: () => cubeImage({ cube: ['a/grass_top', 'a/grass_side'] }, 0.5),
  leaf: () => cubeImage({ cube: ['a/oak_leaves'] }, 0.5),
  home: () => flatImage(painted().house(), 2),
  star: () => flatImage(painted().star(), 2),
  settler: () => flatImage(painted().settler(), 2),
  market: () => flatImage(painted().sack(), 2),
  w_clear: () => flatImage(painted().sun(), 2),
  w_calm: () => flatImage(painted().sun(), 2, [1, 0.95, 0.85]),
  w_breezy: () => flatImage(painted().breeze(), 2),
  w_rain: () => flatImage(painted().rain(), 2),
  w_fog: () => flatImage(painted().fog(), 2),
  w_starfall: () => flatImage(painted().stars(), 2),
  chips: () => flatImage(I.chipsIcon(), 2),
  gem: () => flatImage(I.gemTex(L()), 2),
  comp: () => flatImage(I.compTex(), 2),
  crown: () => flatImage(I.crownTex(), 2),
  lounge: () => flatImage(I.starTex(0xffd040, 0xfff6c0, 0x8a5a0a), 2),
  cards: () => flatImage(new Paint().blit(I.cardTex(-1), 0, 0, 3, 0, 13, 16), 2),
  dice: () => flatImage(I.dieTex(5), 2),
  clover: () => flatImage(I.tokenTex('clover', L()), 2),
  patron: () => flatImage(painted().settler(), 2),
  glamour: () => flatImage(I.starTex(0xff8ad8, 0xffe0f4, 0x8a2a6a), 2),
  island: () => {
    const { c } = canvas({ size: 3, S: 0.5, above: 4, below: 6 });
    c.at(1, 1); N.islet(c, L(), 3, true); c.at(0, 0);
    c.finish({ haze: false, outline: 0.6 });
    return center(image(c, 0, 0));
  },
};
function center(im: Image): Image { const [r] = cropSet([im]); r.ax = Math.round(r.w / 2); r.ay = Math.round(r.h / 2); return r; }

JOBS['icons'] = () => {
  const out: JobOut = [];
  for (const [name, f] of Object.entries(UI)) out.push([`ui:${name}`, f()]);
  for (const t of TOKENS) out.push([`tok:${t.id}`, flatImage(I.tokenTex(t.id, L()), 2)]);
  for (const sym of ['C', 'L', 'B', 'R', '7', 'D', 'K', 'S']) out.push([`sym:${sym}`, flatImage(I.symTex(sym, L()), 2)]);
  for (let i = 0; i < 6; i++) out.push([`chip:${i}`, flatImage(I.chipTex(i), 2)]);
  for (let n = 1; n <= 6; n++) out.push([`die:${n}`, rawImage(I.dieTex(n))]);
  for (let c = -1; c < 52; c++) out.push([`card:${c}`, rawImage(I.cardTex(c))]);
  for (let look = 0; look < 9; look++) for (let f = 0; f < 3; f++) {
    const im = flatImage(I.personTex(look, f), 1);
    im.ay = im.h - 1;
    out.push([`person:${look}:${f}`, im]);
  }
  return out;
};

/** A painted texture as-is (no outline, no scaling). */
function rawImage(p: Paint): Image { return { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data), ax: 0, ay: 0 }; }

// ───────────────────────── interface frames ─────────────────────────

/** Copy texels of a pack texture into a region, tinted (tiles if needed). */
function fillTex(p: Paint, t: Tex, x: number, y: number, w: number, hh: number, k: [number, number, number] = [1, 1, 1], ox = 0, oy = 0): void {
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
    const s = (((oy + j) % t.h) * t.w + ((ox + i) % t.w)) * 4;
    p.set(x + i, y + j, [t.data[s] * k[0], t.data[s + 1] * k[1], t.data[s + 2] * k[2], 255].map((v) => Math.min(255, v)) as [number, number, number, number]);
  }
}
/** Bevelled frame: light on top/left, dark on bottom/right. */
function bevel(p: Paint, x: number, y: number, w: number, hh: number, lo: number, hi: number): void {
  p.rect(x, y, w, 1, hi).rect(x, y, 1, hh, hi).rect(x, y + hh - 1, w, 1, lo).rect(x + w - 1, y, 1, hh, lo);
}

function img(p: Paint): Image { return { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data), ax: 0, ay: 0 }; }

const UITEX: Record<string, () => Paint> = {
  // 16×16, slice 5: slim oak frame with iron corner rivets around dark slate
  panel: () => {
    const p = new Paint(16, 16);
    fillTex(p, L().get('a/slate'), 0, 0, 16, 16, [0.27, 0.28, 0.34]);
    const wood = L().get('a/oak_planks');
    fillTex(p, wood, 0, 0, 16, 3, [0.9, 0.85, 0.8]); fillTex(p, wood, 0, 13, 16, 3, [0.7, 0.62, 0.58], 0, 8);
    fillTex(p, wood, 0, 0, 3, 16, [0.85, 0.8, 0.76], 4, 0); fillTex(p, wood, 13, 0, 3, 16, [0.72, 0.66, 0.62], 8, 0);
    p.frame(0, 0, 16, 16, 0x1a1210).frame(4, 4, 8, 8, 0x0e0e14);
    p.rect(1, 1, 14, 1, 0xd8a868).rect(4, 4, 8, 1, 0x1a1210);
    for (const [x, y] of [[1, 1], [12, 1], [1, 12], [12, 12]]) p.rect(x, y, 3, 3, 0x8a8a96).set(x, y, 0xd8d8e0);
    return p;
  },
  // 16×16, slice 4: plank button
  btn: () => {
    const p = new Paint(16, 16);
    fillTex(p, L().get('a/oak_planks'), 0, 0, 16, 16, [0.95, 0.88, 0.82]);
    p.frame(0, 0, 16, 16, 0x1a1210);
    bevel(p, 1, 1, 14, 14, 0x5a3a22, 0xe8bc80);
    return p;
  },
  btnp: () => {
    const p = new Paint(16, 16);
    fillTex(p, L().get('as/default_gold_block'), 0, 0, 16, 16, [1, 0.92, 0.8]);
    p.frame(0, 0, 16, 16, 0x2a1606);
    bevel(p, 1, 1, 14, 14, 0x8a5a16, 0xfff2b0);
    return p;
  },
  btnd: () => {
    const p = new Paint(16, 16);
    fillTex(p, L().get('b/stone'), 0, 0, 16, 16, [0.62, 0.62, 0.68]);
    p.frame(0, 0, 16, 16, 0x141418);
    bevel(p, 1, 1, 14, 14, 0x2a2a32, 0x9a9aa8);
    return p;
  },
  // 12×12, slice 3: Minecraft-style inset slot
  slot: () => {
    const p = new Paint(12, 12).rect(0, 0, 12, 12, 0x2c2b36);
    p.rect(0, 0, 12, 2, 0x16151c).rect(0, 0, 2, 12, 0x16151c).rect(0, 10, 12, 2, 0x6e6c7c).rect(10, 0, 2, 12, 0x6e6c7c);
    p.set(10, 0, 0x2c2b36); p.set(0, 10, 0x2c2b36); p.set(11, 0, 0x2c2b36); p.set(0, 11, 0x2c2b36);
    return p;
  },
  // 32×32, slice 10: the gold-trimmed build button
  big: () => {
    const p = new Paint(32, 32);
    fillTex(p, L().get('a/slate'), 0, 0, 32, 32, [0.4, 0.42, 0.5]);
    fillTex(p, L().get('as/default_gold_block'), 0, 0, 32, 5); fillTex(p, L().get('as/default_gold_block'), 0, 27, 32, 5, [0.8, 0.7, 0.6]);
    fillTex(p, L().get('as/default_gold_block'), 0, 0, 5, 32, [0.95, 0.9, 0.85]); fillTex(p, L().get('as/default_gold_block'), 27, 0, 5, 32, [0.8, 0.72, 0.62]);
    p.frame(0, 0, 32, 32, 0x2a1606).frame(5, 5, 22, 22, 0x2a1606);
    p.rect(1, 1, 30, 1, 0xfff2b0);
    return p;
  },
};

JOBS['uitex'] = () => Object.entries(UITEX).map(([k, f]) => [`uitex:${k}`, img(f())]);
