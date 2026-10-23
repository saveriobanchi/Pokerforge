/**
 * Minimal pixel-art raster toolkit. Everything in the game's art is drawn
 * through this: exact integer pixels, palette ramps, iso faces with mapped
 * material patterns. Light comes from the upper left.
 */

export type RGBA = number; // 0xRRGGBBAA

export function rgb(hex: number, a = 255): RGBA {
  return ((hex << 8) | a) >>> 0;
}

export function mix(c1: RGBA, c2: RGBA, t: number): RGBA {
  const r = ((c1 >>> 24) & 255) * (1 - t) + ((c2 >>> 24) & 255) * t;
  const g = ((c1 >>> 16) & 255) * (1 - t) + ((c2 >>> 16) & 255) * t;
  const b = ((c1 >>> 8) & 255) * (1 - t) + ((c2 >>> 8) & 255) * t;
  const a = (c1 & 255) * (1 - t) + (c2 & 255) * t;
  return ((Math.round(r) << 24) | (Math.round(g) << 16) | (Math.round(b) << 8) | Math.round(a)) >>> 0;
}

export function withAlpha(c: RGBA, a: number): RGBA {
  return ((c & 0xffffff00) | Math.max(0, Math.min(255, Math.round(a)))) >>> 0;
}

/** Deterministic hash noise in [0,1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1). */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = s(xf), v = s(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** 4×4 Bayer matrix threshold in [0,1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  /** Set a pixel; alpha < 255 blends over what is there. */
  px(x: number, y: number, c: RGBA): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = c & 255;
    if (!a) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    if (a === 255) {
      d[i] = c >>> 24; d[i + 1] = (c >>> 16) & 255; d[i + 2] = (c >>> 8) & 255; d[i + 3] = 255;
      return;
    }
    const t = a / 255;
    const da = d[i + 3] / 255;
    const oa = t + da * (1 - t);
    d[i] = ((c >>> 24) * t + d[i] * da * (1 - t)) / oa;
    d[i + 1] = (((c >>> 16) & 255) * t + d[i + 1] * da * (1 - t)) / oa;
    d[i + 2] = (((c >>> 8) & 255) * t + d[i + 2] * da * (1 - t)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Overwrite pixel including alpha (no blending). */
  set(x: number, y: number, c: RGBA): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    d[i] = c >>> 24; d[i + 1] = (c >>> 16) & 255; d[i + 2] = (c >>> 8) & 255; d[i + 3] = c & 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Filled polygon (pixel centres), optional per-pixel shader. */
  poly(pts: [number, number][], c: RGBA | ((x: number, y: number) => RGBA)): void {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.ceil(xs[k] - 0.5), xb = Math.floor(xs[k + 1] - 0.5);
        for (let x = xa; x <= xb; x++) this.px(x, y, typeof c === 'number' ? c : c(x, y));
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | ((x: number, y: number, d: number) => RGBA)): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) this.px(x, y, typeof c === 'number' ? c : c(x, y, d));
      }
    }
  }

  /** Copy another canvas onto this one at (x,y). */
  blit(src: PixelCanvas, x: number, y: number, flipX = false): void {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const c = src.get(flipX ? src.w - 1 - i : i, j);
      if (c & 255) this.px(x + i, y + j, c);
    }
  }

  /**
   * Selective outline: transparent pixels adjacent to opaque ones get a darker
   * version of the neighbour colour (no universal black lines).
   */
  outline(darken = 0.55, onlyBottom = false): void {
    const out: [number, number, RGBA][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      const nbs: [number, number][] = onlyBottom ? [[0, -1], [1, 0], [-1, 0]] : [[0, -1], [0, 1], [1, 0], [-1, 0]];
      for (const [dx, dy] of nbs) {
        const c = this.get(x + dx, y + dy);
        if ((c & 255) > 200) {
          out.push([x, y, mix(c, rgb(0x120c18), darken)]);
          break;
        }
      }
    }
    for (const [x, y, c] of out) this.set(x, y, c);
  }

  toImageData(): ImageData {
    return new ImageData(new Uint8ClampedArray(this.data), this.w, this.h);
  }

  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    c.getContext('2d')!.putImageData(this.toImageData(), 0, 0);
    return c;
  }
}

// ───────────────────────── iso geometry ─────────────────────────
// A tile is 32×32 iso units. Screen: sx = u − v, sy = (u + v)/2 − z.

export interface IsoOrigin { x: number; y: number }

export function iso(o: IsoOrigin, u: number, v: number, z = 0): [number, number] {
  return [o.x + (u - v), o.y + (u + v) / 2 - z];
}

export type Shade = (s: number, t: number, x: number, y: number) => RGBA;

/**
 * Fill a parallelogram face given by origin p0 and edge vectors e1, e2 in
 * screen space; the shader receives local coords s,t ∈ [0,1].
 */
export function face(c: PixelCanvas, p0: [number, number], e1: [number, number], e2: [number, number], shade: Shade | RGBA): void {
  const pts: [number, number][] = [p0, [p0[0] + e1[0], p0[1] + e1[1]], [p0[0] + e1[0] + e2[0], p0[1] + e1[1] + e2[1]], [p0[0] + e2[0], p0[1] + e2[1]]];
  if (typeof shade === 'number') { c.poly(pts, shade); return; }
  const det = e1[0] * e2[1] - e1[1] * e2[0];
  c.poly(pts, (x, y) => {
    const px = x + 0.5 - p0[0], py = y + 0.5 - p0[1];
    let s = (px * e2[1] - py * e2[0]) / det;
    let t = (e1[0] * py - e1[1] * px) / det;
    s = Math.max(0, Math.min(0.999, s));
    t = Math.max(0, Math.min(0.999, t));
    return shade(s, t, x, y);
  });
}

export interface BoxShades { top: Shade | RGBA; left: Shade | RGBA; right: Shade | RGBA }

/**
 * Iso box centred at (cu, cv) with half-extents (hu, hv), from z0 to z0+h.
 * Left face = +v side (faces down-left), right face = +u side (down-right).
 */
export function box(c: PixelCanvas, o: IsoOrigin, cu: number, cv: number, hu: number, hv: number, z0: number, h: number, sh: BoxShades): void {
  const u0 = cu - hu, u1 = cu + hu, v0 = cv - hv, v1 = cv + hv;
  // left face: v = v1, u from u0..u1, z from z0..z0+h
  const lf = iso(o, u0, v1, z0 + h);
  face(c, lf, [(u1 - u0), (u1 - u0) / 2], [0, h], sh.left);
  // right face: u = u1, v from v0..v1
  const rf = iso(o, u1, v0, z0 + h);
  face(c, rf, [-(v1 - v0), (v1 - v0) / 2], [0, h], sh.right);
  // top
  const tp = iso(o, u0, v0, z0 + h);
  face(c, tp, [(u1 - u0), (u1 - u0) / 2], [-(v1 - v0), (v1 - v0) / 2], sh.top);
}

/** Vertical cylinder (ellipse cross-section 2:1). */
export function cylinder(c: PixelCanvas, o: IsoOrigin, cu: number, cv: number, r: number, z0: number, h: number, ramp: RGBA[], topShade?: (d: number, x: number, y: number) => RGBA): void {
  const [cx, cy] = iso(o, cu, cv, z0);
  const rx = r * 1.414;
  const ry = rx / 2;
  // body
  for (let y = Math.floor(cy - h - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (Math.abs(dx) > 1) continue;
      const yb = cy + ry * Math.sqrt(1 - dx * dx);
      const yt = cy - h;
      if (y + 0.5 > yb || y + 0.5 < yt) continue;
      // lighting: left lit
      const l = 0.5 - dx * 0.45;
      const idx = Math.max(0, Math.min(ramp.length - 1, Math.floor(l * ramp.length + (bayer(x, y) - 0.5) * 0.6)));
      c.px(x, y, ramp[idx]);
    }
  }
  // top ellipse
  c.ellipse(cx, cy - h, rx, ry, (x, y, d) => (topShade ? topShade(d, x, y) : ramp[Math.min(ramp.length - 1, ramp.length - 1 - (d > 0.7 ? 1 : 0))]));
}

export function ramp(...hex: number[]): RGBA[] {
  return hex.map((h) => rgb(h));
}

/** Pick from a ramp with a lightness value in [0,1] and ordered dithering. */
export function shadeRamp(r: RGBA[], l: number, x: number, y: number, dither = 0.5): RGBA {
  const v = l * (r.length - 1) + (bayer(x, y) - 0.5) * dither;
  return r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
}
