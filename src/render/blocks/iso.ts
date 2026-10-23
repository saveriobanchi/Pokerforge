/**
 * Isometric block rasteriser for the baked art. World units are blocks
 * (one block = one tile): screen = ((x − y)·32, (x + y)·16 − z·32) art
 * pixels, so a 16×16 texture lands on a block face at 2×2 pixels per texel,
 * exactly like Minecraft seen isometrically.
 *
 * Faces are textured quads drawn with a depth buffer that also records each
 * pixel's world position. `finish()` then lights the picture: ray-traced
 * cast shadows from the boxes of objects, screen-space ambient occlusion,
 * sun-catching rims on exposed edges, depth haze on deep cliffs, and a
 * pixel-art outline.
 */

export interface Tex { w: number; h: number; data: Uint8Array | Uint8ClampedArray }
export type V3 = [number, number, number];
export type RGB = [number, number, number];
/** Texture region in texels: [u0, v0, u1, v1]. */
export type UV = [number, number, number, number];

export interface Face {
  tex: Tex;
  uv?: UV;
  tint?: RGB;
  /** Emissive: ignores shading, shadow and occlusion. */
  glow?: boolean;
  /** Cut out texels darker than this luminance (0..255) — airy leaves. */
  cut?: number;
}

/** Face light, hue-shifted: warm sunlit top and left, cool violet shade on the right. */
export const SHADE = {
  top: [1.1, 1.03, 0.86] as RGB,
  left: [0.9, 0.8, 0.72] as RGB,
  right: [0.5, 0.52, 0.72] as RGB,
};
/** Direction toward the sun (shadows fall to the lower right of the screen). */
const SUN: V3 = (() => { const v: V3 = [-0.55, 0.35, 0.76]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const SHADOW: RGB = [0.56, 0.56, 0.78];
const HAZE: RGB = [196, 206, 232];

interface Caster { a: V3; b: V3 }

export class Canvas {
  readonly col: Uint8ClampedArray;
  readonly dep: Float32Array;
  readonly id: Int32Array;
  /** World position of each pixel's surface, and whether it faces up. */
  readonly wx: Float32Array;
  readonly wy: Float32Array;
  readonly wz: Float32Array;
  readonly up: Uint8Array;
  readonly lit: Uint8Array; // 0 normal, 1 emissive
  /** Boxes that cast shadows (objects; terrain doesn't). */
  casters: Caster[] = [];
  castOn = false;
  /** Warm point lights (lamps, fire): world position, colour, radius in blocks. */
  lights: { p: V3; c: RGB; r: number }[] = [];
  light(p0: V3, c: RGB, r: number): void { const p = this.turn ? this.rp(p0) : p0; this.lights.push({ p: [p[0] + this.tx, p[1] + this.ty, p[2]], c, r }); }
  /** Translation applied to everything drawn (block units). */
  tx = 0;
  ty = 0;
  at(x: number, y: number): this { this.tx = x; this.ty = y; return this; }

  /**
   * Quarter turns applied to everything drawn, about the centre of a
   * `tsize`-block footprint: the same model, facing another way.
   */
  turn = 0;
  tsize = 1;
  private inBox = false;
  /** A point turned with the model. */
  rp(p: V3): V3 {
    const s = this.tsize;
    switch (this.turn & 3) {
      case 1: return [s - p[1], p[0], p[2]];
      case 2: return [s - p[0], s - p[1], p[2]];
      case 3: return [p[1], s - p[0], p[2]];
      default: return p;
    }
  }
  private rv(v: V3): V3 {
    switch (this.turn & 3) {
      case 1: return [-v[1], v[0], v[2]];
      case 2: return [-v[0], -v[1], v[2]];
      case 3: return [v[1], -v[0], v[2]];
      default: return v;
    }
  }

  /** Pixels per block edge unit relative to the standard 64 px tile (0.5 for distant islets, mini icons). */
  S = 1;

  constructor(readonly w: number, readonly h: number, readonly ox: number, readonly oy: number) {
    const n = w * h;
    this.col = new Uint8ClampedArray(n * 4);
    this.dep = new Float32Array(n).fill(-1e9);
    this.id = new Int32Array(n).fill(-1);
    this.wx = new Float32Array(n); this.wy = new Float32Array(n); this.wz = new Float32Array(n);
    this.up = new Uint8Array(n);
    this.lit = new Uint8Array(n);
  }

  proj(x: number, y: number, z: number): [number, number] {
    return [this.ox + (x - y) * 32 * this.S, this.oy + ((x + y) * 16 - z * 32) * this.S];
  }

  /** Textured parallelogram: origin p, edges eu (texture u) and ev (texture v). */
  quad(p0: V3, eu: V3, ev: V3, f: Face, shade: RGB, id = 0, bias = 0, isUp = false): void {
    if (this.turn && !this.inBox) { p0 = this.rp(p0); eu = this.rv(eu); ev = this.rv(ev); }
    const p: V3 = [p0[0] + this.tx, p0[1] + this.ty, p0[2]];
    const [ox, oy] = this.proj(p[0], p[1], p[2]);
    const [ax, ay] = this.proj(p[0] + eu[0], p[1] + eu[1], p[2] + eu[2]);
    const [bx, by] = this.proj(p[0] + ev[0], p[1] + ev[1], p[2] + ev[2]);
    const dux = ax - ox, duy = ay - oy, dvx = bx - ox, dvy = by - oy;
    const det = dux * dvy - duy * dvx;
    if (Math.abs(det) < 1e-6) return;
    const xs = [ox, ax, bx, ax + dvx], ys = [oy, ay, by, ay + dvy];
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(this.w - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    const t = f.tex;
    const [u0, v0, u1, v1] = f.uv ?? [0, 0, t.w, t.h];
    const tint = f.tint ?? [1, 1, 1];
    const sh = f.glow ? [1, 1, 1] : shade;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const qx = px + 0.5 - ox, qy = py + 0.5 - oy;
      const s = (qx * dvy - qy * dvx) / det, r = (dux * qy - duy * qx) / det;
      if (s < 0 || s >= 1 || r < 0 || r >= 1) continue;
      const X = p[0] + s * eu[0] + r * ev[0], Y = p[1] + s * eu[1] + r * ev[1], Z = p[2] + s * eu[2] + r * ev[2];
      const depth = X + Y + Z + bias;
      const k = py * this.w + px;
      if (depth < this.dep[k] - 1e-4) continue;
      let tu = Math.floor(u0 + s * (u1 - u0)), tv = Math.floor(v0 + r * (v1 - v0));
      tu = ((tu % t.w) + t.w) % t.w; tv = ((tv % t.h) + t.h) % t.h;
      const ti = (tv * t.w + tu) * 4;
      if (t.data[ti + 3] < 128) continue;
      if (f.cut && t.data[ti] * 0.3 + t.data[ti + 1] * 0.59 + t.data[ti + 2] * 0.11 < f.cut) continue;
      this.dep[k] = depth;
      this.id[k] = id;
      this.wx[k] = X; this.wy[k] = Y; this.wz[k] = Z;
      this.up[k] = isUp ? 1 : 0;
      this.lit[k] = f.glow ? 1 : 0;
      this.col[k * 4] = t.data[ti] * sh[0] * tint[0];
      this.col[k * 4 + 1] = t.data[ti + 1] * sh[1] * tint[1];
      this.col[k * 4 + 2] = t.data[ti + 2] * sh[2] * tint[2];
      this.col[k * 4 + 3] = 255;
    }
  }

  /**
   * Cuboid from a to b (block units). Only the three camera-facing faces are
   * drawn. Texture coordinates follow world position (16 texels per block),
   * so partial boxes show the matching part of the texture, Minecraft-style.
   * `rot` turns the top texture by quarter turns (breaks up repetition).
   */
  box(a: V3, b: V3, top: Face, left: Face = top, right: Face = left, id = 0, rot = 0): void {
    if (this.turn && !this.inBox) {
      const p = this.rp(a), q = this.rp(b);
      a = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])];
      b = [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])];
      // Models put a box's front (if it has one) on the +y face and a plain side on +x.
      // The faces a turn brings into view are plain, except the front where it lands.
      const front = left, plain = right;
      const t = this.turn & 3;
      left = plain;
      right = t === 3 ? front : plain;
      rot += this.turn;
      this.inBox = true;
      try { this.box(a, b, top, left, right, id, rot); } finally { this.inBox = false; }
      return;
    }
    const [x0, y0, z0] = a, [x1, y1, z1] = b;
    const T = 16;
    const auto = (f: Face, uv: UV): Face => (f.uv ? f : { ...f, uv });
    if (this.castOn) this.casters.push({ a: [x0 + this.tx, y0 + this.ty, z0], b: [x1 + this.tx, y1 + this.ty, z1] });
    // top: u along +x, v along +y (rotated in quarter turns)
    const tuv: UV = [x0 * T, y0 * T, x1 * T, y1 * T];
    const r = ((rot % 4) + 4) % 4;
    if (r === 0) this.quad([x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0], auto(top, tuv), SHADE.top, id, 0, true);
    else if (r === 1) this.quad([x1, y0, z1], [0, y1 - y0, 0], [-(x1 - x0), 0, 0], auto(top, [y0 * T, (1 - x1) * T, y1 * T, (1 - x0) * T]), SHADE.top, id, 0, true);
    else if (r === 2) this.quad([x1, y1, z1], [-(x1 - x0), 0, 0], [0, -(y1 - y0), 0], auto(top, [(1 - x1) * T, (1 - y1) * T, (1 - x0) * T, (1 - y0) * T]), SHADE.top, id, 0, true);
    else this.quad([x0, y1, z1], [0, -(y1 - y0), 0], [x1 - x0, 0, 0], auto(top, [(1 - y1) * T, x0 * T, (1 - y0) * T, x1 * T]), SHADE.top, id, 0, true);
    const vz0 = ((1 - (z1 - Math.floor(z1 - 1e-6))) % 1) * T, vz1 = vz0 + (z1 - z0) * T;
    // +y face (screen left): u along +x, v downward
    this.quad([x0, y1, z1], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)], auto(left, [x0 * T, vz0, x1 * T, vz1]), SHADE.left, id);
    // +x face (screen right): u along −y, v downward
    this.quad([x1, y1, z1], [0, -(y1 - y0), 0], [0, 0, -(z1 - z0)], auto(right, [(1 - y1) * T, vz0, (1 - y0) * T, vz1]), SHADE.right, id);
  }

  /** Upright sprite standing at p (its bottom centre), 2 px per texel, facing the camera. */
  sprite(p0: V3, f: Face, id = 0, scale0 = 2, bias = 0.3): void {
    if (this.turn && !this.inBox) p0 = this.rp(p0);
    const p: V3 = [p0[0] + this.tx, p0[1] + this.ty, p0[2]];
    const scale = Math.max(1, Math.round(scale0 * this.S));
    const t = f.tex;
    const [u0, v0, u1, v1] = f.uv ?? [0, 0, t.w, t.h];
    const tw = Math.abs(u1 - u0), th = Math.abs(v1 - v0);
    const [cx, cy] = this.proj(p[0], p[1], p[2]);
    const depth = p[0] + p[1] + p[2] + bias;
    const tint = f.tint ?? [1, 1, 1];
    const left = Math.round(cx - (tw * scale) / 2), top = Math.round(cy - th * scale);
    for (let y = 0; y < th * scale; y++) for (let x = 0; x < tw * scale; x++) {
      const px = left + x, py = top + y;
      if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
      const tu = Math.floor(u0 + x / scale), tv = Math.floor(v0 + y / scale);
      const ti = (tv * t.w + tu) * 4;
      if (t.data[ti + 3] < 128) continue;
      const k = py * this.w + px;
      if (depth < this.dep[k]) continue;
      // light sprites a touch toward the top, like they catch the sun
      const lift = 0.86 + 0.18 * (1 - y / (th * scale));
      this.dep[k] = depth;
      this.id[k] = id;
      this.wx[k] = p[0]; this.wy[k] = p[1]; this.wz[k] = p[2] + (1 - y / (th * scale)) * (th * scale) / (32 * this.S);
      this.up[k] = 0;
      this.lit[k] = f.glow ? 1 : 0;
      this.col[k * 4] = t.data[ti] * tint[0] * (f.glow ? 1 : lift);
      this.col[k * 4 + 1] = t.data[ti + 1] * tint[1] * (f.glow ? 1 : lift);
      this.col[k * 4 + 2] = t.data[ti + 2] * tint[2] * (f.glow ? 1 : lift * 0.97);
      this.col[k * 4 + 3] = 255;
    }
  }

  /** Does the ray from p toward the sun hit any caster box? */
  private shadowed(x: number, y: number, z: number): boolean {
    for (const c of this.casters) {
      let tmin = 0.001, tmax = 50;
      for (let ax = 0; ax < 3; ax++) {
        const o = ax === 0 ? x : ax === 1 ? y : z, d = SUN[ax];
        const lo = c.a[ax], hi = c.b[ax];
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { tmin = 1; tmax = 0; break; } continue; }
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) break;
      }
      if (tmin <= tmax) return true;
    }
    return false;
  }

  /**
   * Light the picture. `ground`: cast shadows on the virtual ground plane
   * (z = 0) where nothing was drawn — used for object sprites that sit on
   * terrain drawn separately.
   */
  finish(o: { ground?: boolean; ao?: number; rim?: number; haze?: boolean; outline?: number } = {}): void {
    const { w, h, col, dep } = this;
    const N = w * h;
    // ambient occlusion from the depth buffer: nearer neighbours darken a pixel
    const aoK = o.ao ?? 0.32;
    const occ = new Float32Array(N);
    if (aoK > 0) {
      const R = [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3], [-7, 0], [7, 0], [0, 6], [-5, 5], [5, 5]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!col[k * 4 + 3] || this.lit[k]) continue;
        let n = 0;
        for (const [dx, dy] of R) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const q = Y * w + X;
          const d = dep[q] - dep[k];
          if (d > 0.08 && d < 1.6 && this.wz[q] >= this.wz[k] - 0.05) n++;
        }
        occ[k] = Math.min(1, n / 6);
      }
    }
    for (let k = 0; k < N; k++) {
      const a = col[k * 4 + 3];
      if (a && dep[k] > -1e8) {
        if (this.lit[k]) continue;
        let r = col[k * 4], g = col[k * 4 + 1], b = col[k * 4 + 2];
        // cast shadows on upward surfaces
        if (this.casters.length && this.up[k] && this.shadowed(this.wx[k], this.wy[k], this.wz[k] + 0.002)) { r *= SHADOW[0]; g *= SHADOW[1]; b *= SHADOW[2]; }
        // point lights spill warm light onto nearby surfaces
        for (const L of this.lights) {
          const dx = this.wx[k] - L.p[0], dy = this.wy[k] - L.p[1], dz = this.wz[k] - L.p[2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < L.r) { const f = (1 - d / L.r) ** 2 * 0.9; r += L.c[0] * f; g += L.c[1] * f; b += L.c[2] * f; }
        }
        const ao = 1 - occ[k] * aoK;
        r *= ao; g *= ao * 0.99; b *= ao * 0.97 + 0.03 * (1 - ao);
        // haze on deep cliff blocks so the island floats in the sky
        if (o.haze !== false && this.wz[k] < -1.2) {
          const t = Math.min(0.4, (-this.wz[k] - 1.2) / 11);
          r += (HAZE[0] - r) * t; g += (HAZE[1] - g) * t; b += (HAZE[2] - b) * t;
        }
        col[k * 4] = r; col[k * 4 + 1] = g; col[k * 4 + 2] = b;
      } else if (o.ground && this.casters.length) {
        // virtual ground: translucent shadow pixels under objects
        const X0 = ((k % w) + 0.5 - this.ox) / this.S, Y0 = (Math.floor(k / w) + 0.5 - this.oy) / this.S;
        const gx = (X0 / 32 + Y0 / 16) / 2, gy = (Y0 / 16 - X0 / 32) / 2;
        if (this.shadowed(gx, gy, 0.002)) {
          col[k * 4] = 34; col[k * 4 + 1] = 28; col[k * 4 + 2] = 58; col[k * 4 + 3] = 92;
          dep[k] = -1e8 - 1;
        }
      }
    }
    // sun rim on exposed upper edges: a top-face pixel whose upper neighbour is empty or far behind
    const rim = o.rim ?? 1.16;
    if (rim > 1) {
      for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!this.up[k] || !col[k * 4 + 3] || this.lit[k]) continue;
        const q = (y - 1) * w + x;
        if (!col[q * 4 + 3] || dep[q] < -1e8 || dep[k] - dep[q] > 0.5) {
          col[k * 4] = col[k * 4] * rim + 8; col[k * 4 + 1] = col[k * 4 + 1] * rim + 6; col[k * 4 + 2] = col[k * 4 + 2] * rim;
        }
      }
    }
    if ((o.outline ?? 0.55) > 0) this.outline(o.outline ?? 0.55);
  }

  /** 1 px dark, hue-shifted outline around the silhouette (shadow pixels excluded). */
  outline(strength = 0.6): void {
    const { w, h, col, dep } = this;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && col[(y * w + x) * 4 + 3] === 255 && dep[y * w + x] > -1e8;
    const add: [number, number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      let n = -1;
      for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) if (solid(x + dx, y + dy)) { n = ((y + dy) * w + x + dx); break; }
      if (n >= 0) add.push([x, y, n]);
    }
    for (const [x, y, n] of add) {
      const k = (y * w + x) * 4;
      col[k] = col[n * 4] * (1 - strength) * 0.55 + 22 * strength;
      col[k + 1] = col[n * 4 + 1] * (1 - strength) * 0.45 + 14 * strength;
      col[k + 2] = col[n * 4 + 2] * (1 - strength) * 0.6 + 34 * strength;
      col[k + 3] = 255;
      dep[y * w + x] = -1e8 + 1;
    }
  }
}
