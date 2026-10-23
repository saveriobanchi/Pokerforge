import { type Canvas, type Face, type Tex } from '../iso';
import { Paint, type TexLib } from '../tex';

export type Floor = 'grass' | 'stone' | 'carpet' | 'marble' | 'gold';

const h = (a: number, b: number, c = 0) => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Hanging vine strip texture (16×48), painted in the pack's greens. */
function vineTex(L: TexLib, seed: number): Paint {
  const key = 'gen/vine' + seed;
  const p = new Paint(16, 48);
  const leaf = [0x3d6b2c, 0x4f8a32, 0x6aa63c, 0x86bf4a];
  for (let s = 0; s < 3; s++) {
    let x = 2 + Math.floor(h(s, seed, 1) * 12);
    const len = 14 + Math.floor(h(s, seed, 2) * 32);
    for (let y = 0; y < len; y++) {
      if (h(y, s, seed) > 0.75) x += h(y, s, seed + 1) > 0.5 ? 1 : -1;
      x = Math.max(1, Math.min(14, x));
      p.set(x, y, leaf[0]);
      if (y % 3 === 0) { p.set(x - 1, y, leaf[2]); p.set(x + 1, y, leaf[1]); }
      if (y % 5 === 2) { p.set(x + 1, y + 1, leaf[3]); p.set(x - 1, y + 1, leaf[1]); }
    }
  }
  L.put(key, p);
  return p;
}

/** Tile column: the floor block at z ∈ [−1, 0] and `depth − 1` blocks under it. */
export function column(c: Canvas, L: TexLib, floor: Floor, depth: number, v: number, x = 0, y = 0, sunk = 0): void {
  const top: Record<Floor, [string, string]> = {
    grass: ['a/grass_top', 'a/grass_side'],
    stone: ['a/limestone_bricks', 'a/limestone_bricks'],
    carpet: ['k/Tiles/cotton_red', 'a/limestone_bricks'],
    marble: ['a/marble_bricks', 'a/marble_bricks2'],
    gold: ['as/default_gold_block', 'a/marble_bricks2'],
  };
  const [tt, ts] = top[floor];
  const face = (n: string, tint?: [number, number, number]): Face => ({ tex: L.get(n), tint });
  // gentle meadow colour drift across the island so tiles don't repeat
  const g = floor === 'grass' ? (h(Math.floor(x / 2), Math.floor(y / 2), 5) - 0.5) * 0.12 : 0;
  const tint: [number, number, number] = [1 + g * 0.6, 1 + g * 0.2, 1 - g];
  c.box([x, y, -1], [x + 1, y + 1, -sunk], face(sunk ? 'a/dirt' : tt, tint), face(ts, tint), face(ts, tint), 1, Math.floor(h(x, y, 77) * 4));
  for (let k = 1; k < depth; k++) {
    const z = -1 - k;
    let n: string;
    if (floor !== 'grass' && k === 1) n = 'a/dirt';
    else if (k <= (floor === 'grass' ? 1 : 1)) n = 'a/dirt';
    else if (k === 2) n = h(x, y, v) > 0.5 ? 'b/old_dirt' : 'a/dirt';
    else {
      const r = h(x * 7 + k, y * 3 + v, 11);
      n = k > 4 ? (r > 0.7 ? 'a/basalt' : 'a/slate') : r > 0.86 ? 'a/stone_generic_ore_nuggets' : r > 0.78 ? 'a/stone_generic_ore_crystalline' : r > 0.45 ? 'b/stone' : 'b/andesite';
    }
    c.box([x, y, z], [x + 1, y + 1, z + 1], face(n), face(n), face(n), 1);
  }
  // overgrown rim: grass tufts leaning over the two visible edges
  if (floor === 'grass' && !sunk) {
    const tuft = ['grass', 'grass2', 'grass3', 'fern2', 'sedge'];
    for (let i = 0; i < 4; i++) {
      const t = 0.12 + h(x, y, i + 30) * 0.76;
      const side = i % 2;
      const p: [number, number, number] = side === 0 ? [x + t, y + 0.97, 0] : [x + 0.97, y + t, 0];
      if (h(x, y, i + 40) < 0.4) continue;
      c.sprite(p, { tex: L.get('a/plants/' + tuft[Math.floor(h(x, y, i + 50) * tuft.length)]) }, 1, 2, 0.2);
    }
  }
  // vines and roots hanging over the two visible faces
  if (floor === 'grass') {
    for (let side = 0; side < 2; side++) {
      if (h(x * 5 + side, y * 9, v) < 0.45) continue;
      const vt = vineTex(L, Math.floor(h(x, y, side + v) * 6));
      const len = Math.min(depth, 1 + Math.floor(h(x, y, side) * 2.5));
      if (side === 0) c.quad([x, y + 1.01, 0], [1, 0, 0], [0, 0, -len * 1.5], { tex: vt, uv: [0, 0, 16, 48] }, [0.86, 0.84, 0.86], 1, 0.01);
      else c.quad([x + 1.01, y + 1, 0], [0, -1, 0], [0, 0, -len * 1.5], { tex: vt, uv: [0, 0, 16, 48] }, [0.66, 0.66, 0.76], 1, 0.01);
    }
  }
}

export const PLANTS = ['grass', 'grass2', 'grass3', 'fern', 'aster', 'dandelion', 'forget_me_not', 'lupine', 'oxeye_daisy', 'orchid_ground', 'pimpernel', 'mushroom_red', 'mushroom_brown', 'goldenrod', 'sedge', 'horsetail'];

/** A small cluster of plant sprites on the ground around (cx, cy). */
export function plants(c: Canvas, L: TexLib, cx: number, cy: number, seed: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const name = PLANTS[Math.floor(h(seed, i, 3) * PLANTS.length)];
    c.sprite([cx + (h(seed, i, 4) - 0.5) * 0.5, cy + (h(seed, i, 5) - 0.5) * 0.5, 0], { tex: L.get('a/plants/' + name) }, 2);
  }
}

/** Animated water face (16×16), painted in the pack's blues; frame f scrolls the ripples. */
export function waterTex(L: TexLib, f: number, falling = false): Paint {
  const key = `gen/water${falling ? 'f' : ''}${f}`;
  const p = new Paint();
  const pal = [0x2a5a9a, 0x3a78b8, 0x4a92cc, 0x6ab2e0, 0xb8e6f4, 0xffffff];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const yy = falling ? (y - f * 4 + 64) % 16 : y;
    const n = h(falling ? x : (x + f) % 16, yy, 3);
    let i = falling ? (x % 5 === 1 ? 3 : x % 5 === 3 ? 2 : 1) : 2;
    if (n > 0.86) i = 4; else if (n > 0.7) i = 3; else if (n < 0.15) i = 1;
    if (falling && h(x, yy, 9) > 0.93) i = 5;
    p.set(x, y, pal[i]);
  }
  L.put(key, p);
  return p;
}

/** A pond tile: a sunken grass block filled with water, a grassy lip around it. */
export function pond(c: Canvas, L: TexLib, x: number, y: number, depth: number, f = 0): void {
  column(c, L, 'grass', depth, 0, x, y, 0.1875);
  const w = { tex: waterTex(L, f) };
  c.quad([x, y, -0.09], [1, 0, 0], [0, 1, 0], w, [1.02, 1.02, 1.06], 7, 0, true);
  const lip = { tex: L.get('a/grass_top') };
  c.box([x, y, -0.1875], [x + 1, y + 0.125, 0], lip, { tex: L.get('a/grass_side') }, { tex: L.get('a/grass_side') }, 1);
  c.box([x, y, -0.1875], [x + 0.125, y + 1, 0], lip, { tex: L.get('a/grass_side') }, { tex: L.get('a/grass_side') }, 1);
}

/** Waterfall pouring off the +y edge of tile (x, y) down `len` blocks: layered sheets, foam at lip and edges. */
export function waterfall(c: Canvas, L: TexLib, x: number, y: number, len: number, f = 0): void {
  const sheet = { tex: waterTex(L, f, true) };
  c.quad([x + 0.2, y + 1.04, -0.2], [0.6, 0, 0], [0, 0, -len], { ...sheet, uv: [0, 0, 10, len * 16] }, [1.0, 1.0, 1.04], 8, 0.05);
  c.quad([x + 0.28, y + 1.07, -0.25], [0.44, 0, 0], [0, 0, -len * 0.9], { tex: waterTex(L, (f + 2) % 4, true), uv: [3, 5, 11, 5 + len * 16] }, [1.08, 1.1, 1.12], 8, 0.06);
  const foam = new Paint(16, 4);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) if (h(i, j, f) > 0.35 - j * 0.1) foam.set(i, j, j < 2 ? 0xffffff : 0xd8f0f8);
  c.quad([x + 0.16, y + 1.08, -0.16], [0.68, 0, 0], [0, 0, -0.18], { tex: foam }, [1, 1, 1], 8, 0.08);
}

/** Terrain top kinds: the island's floors. */
export type TopKind = Floor;

/** Casino carpet: deep red with a gold lattice and little suit motifs. */
function carpetTex(L: TexLib): Paint {
  const p = new Paint(16, 16, L.get('k/Tiles/cotton_red')).tint([0.78, 0.3, 0.38]);
  for (let i = 0; i < 16; i++) { p.set(i, i, 0xc89a3a); p.set(15 - i, i, 0xc89a3a); }
  p.draw(['.a.', 'aaa', '.a.'], { a: 0xe8c060 }, 7, 2).draw(['.a.', 'aaa', '.a.'], { a: 0xe8c060 }, 7, 11);
  p.draw(['a.a', 'aaa', '.a.'], { a: 0x2a1424 }, 2, 6).draw(['.a.', 'aaa', 'a.a'], { a: 0x2a1424 }, 11, 6);
  return p;
}
/** Gold tile: gilded squares set in black marble. */
function goldTex(L: TexLib): Paint {
  const p = new Paint(16, 16, L.get('as/default_obsidian_block'));
  p.blit(L.get('as/default_gold_block'), 1, 1, 1, 1, 6, 6).blit(L.get('as/default_gold_block'), 9, 9, 9, 9, 6, 6);
  p.blit(L.get('a/marble'), 9, 1, 9, 1, 6, 6).blit(L.get('a/marble'), 1, 9, 1, 9, 6, 6);
  return p;
}

/** Top and side textures of a terrain kind. */
function tops(L: TexLib, kind: TopKind): [Tex, Tex] {
  const t = (n: string) => L.get(n);
  const lip = (top: Tex, base = 'a/limestone_bricks') => new Paint(16, 16, t(base)).blit(top, 0, 0, 0, 0, 16, 3);
  switch (kind) {
    case 'grass': return [t('a/grass_top'), t('a/grass_side')];
    case 'stone': return [t('a/limestone_bricks'), t('a/limestone_bricks')];
    case 'marble': return [t('a/marble_bricks'), t('a/marble_bricks2')];
    case 'carpet': { const c = carpetTex(L); return [c, lip(c)]; }
    case 'gold': { const g = goldTex(L); return [g, lip(t('as/default_gold_block'), 'a/marble_bricks2')]; }
  }
}

/** Rim plants growing over open edges, per kind. */
const RIM: Partial<Record<TopKind, string[]>> = {
  grass: ['grass', 'grass2'],
};

/** Neighbour context id: drawn so lighting sees the surroundings, then cut away. */
export const CONTEXT_ID = 99;

/**
 * In-game terrain top: the floor block of one tile (z ∈ [−1, 0]) with rim
 * plants and vines on its open front edges. `mask` bits mark missing
 * neighbours (1:+x 2:+y 4:−x 8:−y); present back neighbours are drawn as
 * context so edge highlights only appear on real island edges.
 */
export function topPiece(c: Canvas, L: TexLib, floor: TopKind, mask: number, v: number): void {
  const [tt, ts] = tops(L, floor);
  const f = (t: Tex): Face => ({ tex: t });
  const ctx = (x: number, y: number) => c.box([x, y, -1], [x + 1, y + 1, 0], f(tt), f(ts), f(ts), CONTEXT_ID);
  if (!(mask & 4)) ctx(-1, 0);
  if (!(mask & 8)) ctx(0, -1);
  if (!(mask & 12)) ctx(-1, -1);
  // seed by variant so neighbouring tiles differ
  const sx = v * 3 + 1, sy = v * 5 + mask;
  c.box([0, 0, -1], [1, 1, 0], f(tt), f(ts), f(ts), 1, v);
  const tuftN = RIM[floor] ?? [];
  if (tuftN.length) {
    // a few short plants on open edges (kept sparse so edges read clean)
    for (let i = 0; i < 4; i++) {
      const side = i % 2;
      if (!(mask & (side === 0 ? 2 : 1))) continue;
      if (h(sx, sy, i + 40) < 0.7) continue;
      const t = 0.2 + h(sx, sy, i + 30) * 0.6;
      const p: [number, number, number] = side === 0 ? [t, 0.97, 0] : [0.97, t, 0];
      c.sprite(p, { tex: L.get('a/plants/' + tuftN[Math.floor(h(sx, sy, i + 50) * tuftN.length)]) }, 1, 2, 0.2);
    }
  }
  if (floor === 'grass') {
    for (let side = 0; side < 2; side++) {
      if (!(mask & (side === 0 ? 2 : 1)) || h(sx + side, sy, 7) < 0.6) continue;
      const vt = vineTex(L, Math.floor(h(sx, sy, side) * 6));
      const len = 1 + Math.floor(h(sx, sy, side + 3) * 2.5);
      if (side === 0) c.quad([0, 1.01, 0], [1, 0, 0], [0, 0, -len * 1.5], { tex: vt, uv: [0, 0, 16, 48] }, [0.86, 0.84, 0.86], 1, 0.01);
      else c.quad([1.01, 1, 0], [0, -1, 0], [0, 0, -len * 1.5], { tex: vt, uv: [0, 0, 16, 48] }, [0.66, 0.66, 0.76], 1, 0.01);
    }
  }
}

/** In-game rock column under a tile top: `depth` blocks from z = −1 down. */
export function columnPiece(c: Canvas, L: TexLib, depth: number, v: number): void {
  const f = (n: string): Face => ({ tex: L.get(n) });
  for (let k = 1; k <= depth; k++) {
    const z = -1 - k;
    const r = h(v * 7 + k, v * 3 + depth, 11);
    const n = k === 1 ? 'a/dirt' : k === 2 ? (r > 0.5 ? 'b/old_dirt' : 'a/dirt') : k > 4 ? (r > 0.7 ? 'a/basalt' : 'a/slate') : r > 0.86 ? 'a/stone_generic_ore_nuggets' : r > 0.78 ? 'a/stone_generic_ore_crystalline' : r > 0.45 ? 'b/stone' : 'b/andesite';
    // the bottom block tapers so columns end in a rough point, not a flat cut
    const inset = k === depth && depth > 1 ? 0.125 + h(v, depth, 5) * 0.125 : 0;
    c.box([inset, inset, z], [1 - inset, 1 - inset, z + 1], f(n), f(n), f(n), 1);
  }
}

/** Decoration kinds that suit each terrain top. */
export const DECOR_SETS: Record<string, string[]> = {
  grass: ['tuft', 'flowers', 'bush', 'stone'],
};

/** Decorations scattered on free grass. */
export function decor(c: Canvas, L: TexLib, kind: string, v: number): void {
  const p = (n: string, x: number, y: number, s = 2) => c.sprite([x, y, 0], { tex: L.get('a/plants/' + n) }, 2, s);
  if (kind === 'tuft') { p(['grass', 'grass2', 'grass', 'fern'][v], 0.5, 0.5); return; }
  if (kind === 'flowers') { p(['dandelion', 'forget_me_not', 'oxeye_daisy', 'aster'][v], 0.5, 0.5); return; }
  if (kind === 'reeds') { const n = ['cattail', 'horsetail', 'sedge', 'cattail']; p(n[v], 0.45, 0.5); p(n[(v + 1) % 4], 0.6, 0.62); return; }
  if (kind === 'mushroom') { p(v % 2 ? 'mushroom_brown' : 'mushroom_red', 0.45, 0.5); if (v > 1) p('mushroom_brown', 0.62, 0.6); return; }
  if (kind === 'cactus') { p(['cactus_cholla', 'cactus_pricklypear', 'aloe', 'cactus_cholla'][v], 0.5, 0.5); return; }
  if (kind === 'dry') { p(['sagebrush', 'creosote', 'manzanita', 'sagebrush'][v], 0.5, 0.5); return; }
  if (kind === 'snowtuft') { c.sprite([0.5, 0.5, 0], { tex: L.get('a/plants/' + ['grass', 'grass2', 'grass3', 'fern'][v]), tint: [0.85, 0.95, 1.1] }, 2, 2); return; }
  c.castOn = true;
  if (kind === 'rock') {
    const fs: Face = { tex: L.get(v % 2 ? 'a/sandstone' : 'a/sandstone_tiles') };
    c.box([0.3, 0.35, 0], [0.66, 0.68, 0.22 + v * 0.04], fs, fs, fs, 4);
    if (v > 1) c.box([0.58, 0.5, 0], [0.78, 0.72, 0.12], fs, fs, fs, 4);
  } else if (kind === 'icerock') {
    const fs: Face = { tex: L.get(v % 2 ? 'a/ice_glacier' : 'b/stone'), tint: v % 2 ? [1, 1, 1.05] : [0.9, 0.95, 1.05] };
    const snow: Face = { tex: L.get('a/snow') };
    c.box([0.3, 0.35, 0], [0.64, 0.66, 0.22], snow, fs, fs, 4);
  } else if (kind === 'snowpine') {
    const lv: Face = { tex: L.get('a/pine_leaves') };
    const snow: Face = { tex: L.get('a/snow') };
    c.box([0.42, 0.42, 0], [0.58, 0.58, 0.2], { tex: L.get('a/pine_log_top') }, { tex: L.get('a/pine_log_side') }, { tex: L.get('a/pine_log_side') }, 2);
    c.box([0.25, 0.25, 0.2], [0.75, 0.75, 0.5], snow, lv, lv, 3);
    c.box([0.35, 0.35, 0.5], [0.65, 0.65, 0.75], snow, lv, lv, 3);
  } else if (kind === 'bush') {
    const w = (['oak', 'beech', 'maple', 'pine'] as const)[v];
    const lv: Face = { tex: L.get(`a/${w}_leaves`) };
    c.box([0.25, 0.25, 0], [0.75, 0.75, 0.5], lv, lv, lv, 3);
    if (v % 2) c.box([0.35, 0.35, 0.5], [0.65, 0.65, 0.68], lv, lv, lv, 3);
    if (v === 1) c.sprite([0.5, 0.76, 0.2], { tex: L.get('a/plants/mushroom_red') }, 4, 1);
  } else {
    const n = ['b/stone', 'a/cobblestone_mossy', 'b/andesite', 'a/granite'][v];
    const fs: Face = { tex: L.get(n) };
    c.box([0.3, 0.35, 0], [0.62, 0.65, 0.25], fs, fs, fs, 4);
    c.box([0.55, 0.5, 0], [0.75, 0.7, 0.14], fs, fs, fs, 4);
  }
  c.castOn = false;
}

/**
 * Waterfall strip for frame f (12×72 texels): a glassy ribbon with a white
 * lip, light streaks that slide down with the frames, darker edges, and a
 * soft fade into spray at the bottom (no noise speckle).
 */
export function fallTex(f: number): Tex {
  const W = 12, H = 72;
  const p = { w: W, h: H, data: new Uint8ClampedArray(W * H * 4) };
  const deep = [38, 92, 156], mid = [64, 136, 204], light = [130, 196, 238], foam = [236, 248, 255];
  const shift = Math.round(f * 24);
  // a few streaks per column, each a short light run that scrolls down
  const streak = (x: number, y: number) => {
    const yy = (y - shift + 240) % 24;
    const off = Math.floor(h(x, 7, 31) * 24);
    const d = (yy - off + 24) % 24;
    return d < 5 + Math.floor(h(x, 3, 31) * 4);
  };
  for (let y = 0; y < H; y++) {
    const fade = Math.max(0, (y - H * 0.55) / (H * 0.45)); // 0 → 1 over the lower part
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1;
      let c = edge ? deep : x % 4 === 1 ? light : mid;
      if (!edge && streak(x, y)) c = light;
      if (y < 2) c = foam;
      else if (y < 4 && h(x, y, 5) > 0.4) c = foam;
      let a = edge ? 170 : 215;
      if (y < 4) a = 255;
      // thin out into spray: fade alpha and drop alternating texels
      if (fade > 0) {
        a = Math.round(a * (1 - fade * 0.85));
        if ((x + y + Math.floor(f * 4)) % 2 && fade > 0.45) continue;
        if (fade > 0.6) c = foam;
      }
      if (a <= 8) continue;
      p.data.set([c[0], c[1], c[2], a], (y * W + x) * 4);
    }
  }
  return p;
}
