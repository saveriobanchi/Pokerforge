import type { RGB, Tex } from './iso';

/**
 * Texture library over the vendored CC0 packs (art/cc0). Names are
 * "<pack>/<file>" without extension, e.g. "a/grass_top", "a/plants/fern",
 * "b/old_grass_side", "as/copper ingot", "k/Tiles/water". A loader that reads
 * PNG files is injected (Node at bake time).
 */
const PACKS: Record<string, string> = { a: 'blocks-a', b: 'blocks-b', as: 'assorted', k: 'kenney-voxel' };

export type Loader = (relPath: string) => Tex;

export class TexLib {
  private cache = new Map<string, Tex>();
  constructor(private load: Loader) {}

  get(name: string): Tex {
    let t = this.cache.get(name);
    if (!t) {
      const i = name.indexOf('/');
      const pack = PACKS[name.slice(0, i)];
      if (!pack) throw new Error('unknown pack in ' + name);
      t = this.load(`${pack}/${name.slice(i + 1)}.png`);
      // Kenney's tiles are 128×128: average them down to the 16-texel grid every block uses
      if (t.w > 16 && t.w === t.h && t.w % 16 === 0) t = downsample(t, t.w / 16);
      this.cache.set(name, t);
    }
    return t;
  }

  /** Register a texture made in code (custom machine faces etc.). */
  put(name: string, t: Tex): Tex {
    this.cache.set(name, t);
    return t;
  }
}

/** A small pixel painter for composing extra 16×16 faces in the packs' palette. */
export class Paint implements Tex {
  readonly data: Uint8ClampedArray;
  constructor(readonly w = 16, readonly h = 16, from?: Tex) {
    this.data = new Uint8ClampedArray(w * h * 4);
    if (from) this.blit(from, 0, 0);
  }
  static hex(c: number, a = 255): [number, number, number, number] {
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255, a];
  }
  set(x: number, y: number, c: number | [number, number, number, number]): this {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const v = typeof c === 'number' ? Paint.hex(c) : c;
    this.data.set(v, (y * this.w + x) * 4);
    return this;
  }
  get(x: number, y: number): [number, number, number, number] {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  rect(x: number, y: number, w: number, h: number, c: number | [number, number, number, number]): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }
  /** Rectangle outline. */
  frame(x: number, y: number, w: number, h: number, c: number): this {
    for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c); }
    for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c); }
    return this;
  }
  /** Copy a texture (or a region) onto this one at (dx, dy); transparent texels are skipped. */
  blit(t: Tex, dx: number, dy: number, sx = 0, sy = 0, sw = t.w, sh = t.h): this {
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * t.w + sx + x) * 4;
      if (t.data[si + 3] < 128) continue;
      this.set(dx + x, dy + y, [t.data[si], t.data[si + 1], t.data[si + 2], 255]);
    }
    return this;
  }
  /** Draw from a string map: each char indexes `pal` ('.' = keep). */
  draw(rows: string[], pal: Record<string, number>, dx = 0, dy = 0): this {
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && ch !== ' ' && pal[ch] !== undefined) this.set(dx + x, dy + y, pal[ch]); }));
    return this;
  }
  /** Multiply colours (tinting a base texture). */
  tint(k: RGB): this {
    for (let i = 0; i < this.data.length; i += 4) { this.data[i] *= k[0]; this.data[i + 1] *= k[1]; this.data[i + 2] *= k[2]; }
    return this;
  }
}

function downsample(t: Tex, k: number): Tex {
  const w = t.w / k, h = t.h / k;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const s = ((y * k + j) * t.w + x * k + i) * 4;
      for (let c = 0; c < 4; c++) acc[c] += t.data[s + c];
    }
    for (let c = 0; c < 4; c++) data[(y * w + x) * 4 + c] = acc[c] / (k * k);
  }
  return { w, h, data };
}
