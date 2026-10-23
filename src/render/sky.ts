import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { PixelCanvas, hash2, rgb } from './art/pixel';
import { art } from './artpack';

// Time-of-day keyframes: [fraction, skyTop, skyHorizon, worldTint, night(0..1), cloudTint, sunGlow]
type Key = [number, number, number, number, number, number, number];
const KEYS: Key[] = [
  [0.0, 0x34417e, 0xf2a88a, 0xf4d6cc, 0.35, 0xffc4b8, 0xff9a6a],
  [0.07, 0x4a74b4, 0xf8d4ac, 0xfff2e2, 0.02, 0xfff0e4, 0xffd090],
  [0.2, 0x4d88c8, 0xf3e4cc, 0xffffff, 0, 0xffffff, 0xfff0c0],
  [0.48, 0x4d88c8, 0xf3e4cc, 0xffffff, 0, 0xffffff, 0xfff0c0],
  [0.58, 0x5476b8, 0xffcc94, 0xfff0d6, 0, 0xffe6cc, 0xffc070],
  [0.65, 0x4a4c92, 0xff9a78, 0xffd8c2, 0.08, 0xffb4a2, 0xff8a50],
  [0.71, 0x262a5e, 0xb45c7a, 0xb8a6d0, 0.6, 0xa47eac, 0xd05a60],
  [0.77, 0x0d1432, 0x2a3468, 0x8292c6, 1, 0x4c567e, 0x000000],
  [0.9, 0x0b1228, 0x26345e, 0x8090c4, 1, 0x48527a, 0x000000],
  [0.97, 0x1c2450, 0x7a5a8a, 0xb4aaca, 0.65, 0x8a7a9e, 0xa0607a],
  [1.0, 0x34417e, 0xf2a88a, 0xf4d6cc, 0.35, 0xffc4b8, 0xff9a6a],
];

function lerpHex(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bb = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
}

export interface SkyState { top: number; horizon: number; tint: number; night: number; cloud: number; glow: number }

export function skyAt(dayFrac: number): SkyState {
  const f = ((dayFrac % 1) + 1) % 1;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (f >= a[0] && f <= b[0]) {
      const t = (f - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t);
      return { top: lerpHex(a[1], b[1], s), horizon: lerpHex(a[2], b[2], s), tint: lerpHex(a[3], b[3], s), night: a[4] + (b[4] - a[4]) * s, cloud: lerpHex(a[5], b[5], s), glow: lerpHex(a[6], b[6], s) };
    }
  }
  const k = KEYS[0];
  return { top: k[1], horizon: k[2], tint: k[3], night: k[4], cloud: k[5], glow: k[6] };
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function linearTex(cv: HTMLCanvasElement): Texture {
  const t = Texture.from(cv);
  t.source.scaleMode = 'linear';
  return t;
}

/**
 * A soft painterly cumulus: overlapping puffs, lit from above with a warm
 * rim and a cool lavender underside. Drawn white so the time-of-day tint
 * colours it (pink at sunset, silver at night).
 */
function cloudCanvas(w: number, h: number, seed: number, flat: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const puffs: [number, number, number][] = [];
  const n = 6 + Math.floor(w / 40);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = h * 0.3 * (0.5 + Math.sin(t * Math.PI) * 0.7) * (0.75 + hash2(i, seed) * 0.5);
    puffs.push([w * 0.12 + t * w * 0.76 + (hash2(i, seed, 2) - 0.5) * w * 0.06, h * (1 - flat) - r * 0.6 - hash2(i, seed, 3) * h * 0.12, r]);
  }
  // second row of smaller puffs on top for a billowy silhouette
  for (let i = 0; i < n / 2; i++) {
    const [x, y, r] = puffs[1 + Math.floor(hash2(i, seed, 4) * (n - 2))];
    puffs.push([x + (hash2(i, seed, 5) - 0.5) * r, y - r * 0.55, r * (0.5 + hash2(i, seed, 6) * 0.3)]);
  }
  // shadow body
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y + r * 0.3, r * 0.2, x, y + r * 0.2, r * 1.05);
    g.addColorStop(0, 'rgba(206,198,226,1)');
    g.addColorStop(0.85, 'rgba(180,170,210,1)');
    g.addColorStop(1, 'rgba(180,170,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2); ctx.fill();
  }
  // lit tops
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.45, r * 0.05, x, y - r * 0.1, r * 0.95);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(250,246,248,0.9)');
    g.addColorStop(1, 'rgba(236,230,242,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.95, 0, Math.PI * 2); ctx.fill();
  }
  // flatten the base
  ctx.globalCompositeOperation = 'destination-out';
  const fg = ctx.createLinearGradient(0, h * (1 - flat) - 6, 0, h);
  fg.addColorStop(0, 'rgba(0,0,0,0)');
  fg.addColorStop(0.5, 'rgba(0,0,0,0.6)');
  fg.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, w, h);
  return cv;
}

function starCanvas(): PixelCanvas {
  const c = new PixelCanvas(256, 160);
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(hash2(i, 1, 99) * 256), y = Math.floor(hash2(i, 2, 99) * 160);
    const b = hash2(i, 3, 99);
    c.set(x, y, b > 0.85 ? rgb(0xfff6d8) : b > 0.5 ? rgb(0xc8d4f0, 220) : rgb(0x8ea0d0, 160));
    if (b > 0.94) { c.set(x + 1, y, rgb(0xfff6d8, 120)); c.set(x - 1, y, rgb(0xfff6d8, 120)); c.set(x, y + 1, rgb(0xfff6d8, 120)); c.set(x, y - 1, rgb(0xfff6d8, 120)); }
  }
  return c;
}

/** Radial glow, white, for tinting. */
function glowCanvas(size: number, core: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(core, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

function discCanvas(r: number, inner: string, outer: string): HTMLCanvasElement {
  const s = Math.ceil(r * 2 + 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2 - r * 0.3, s / 2 - r * 0.3, 0, s / 2, s / 2, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2); ctx.fill();
  return cv;
}

interface Drifter { s: Sprite; px: number; py: number; speed: number; par: number; w: number; bob: number; haze: number }

/**
 * Background: graded sky with a sun bloom, stars, hazy voxel islets with
 * waterfalls, painterly cloud banks at three depths, and a cloud sea below
 * the island. Everything here is filtered smoothly; only the world is pixel art.
 */
export class Sky {
  readonly back = new Container();
  readonly front = new Container();
  private grad: HTMLCanvasElement;
  private gradTex: Texture;
  private gradSprite: Sprite;
  private bloom: Sprite;
  private stars: TilingSprite;
  private sun: Sprite;
  private moon: Sprite;
  private far: Drifter[] = [];
  private near: Drifter[] = [];
  private lastGrad = '';
  readonly pixel = 2;
  /** Light quality: skip every other cloud to cut overdraw. */
  lite = false;
  /** Weather overlays (screen space, over the world). */
  private rain: TilingSprite;
  private veil: Sprite;
  private meteors = new Graphics();
  /** Today's weather id (set by the world each frame). */
  weather = 'clear';
  /** Current season id (set by the world each frame). */
  season = 'spring';
  private snow: TilingSprite;
  private leaves: TilingSprite;

  constructor() {
    // rain: pale diagonal streaks on a tile; veil: flat tint for fog and overcast
    const rc = document.createElement('canvas');
    rc.width = 64; rc.height = 64;
    const rx = rc.getContext('2d')!;
    rx.strokeStyle = 'rgba(214,232,255,0.55)';
    rx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % 64, y = (i * 23) % 64;
      rx.beginPath(); rx.moveTo(x, y); rx.lineTo(x - 3, y + 9); rx.stroke();
      rx.beginPath(); rx.moveTo(x + 64, y); rx.lineTo(x + 61, y + 9); rx.stroke();
    }
    const rt = Texture.from(rc);
    this.rain = new TilingSprite({ texture: rt, width: 100, height: 100 });
    this.rain.visible = false;
    this.veil = new Sprite(Texture.WHITE);
    this.veil.visible = false;
    // seasons: soft pixel snowflakes in winter, drifting leaves in autumn
    const flakes = (cols: string[], n: number, size: number) => {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 96;
      const x = c.getContext('2d')!;
      for (let i = 0; i < n; i++) {
        x.fillStyle = cols[i % cols.length];
        const px = (i * 41 + (i * i) % 17) % 96, py = (i * 29 + (i * 7) % 13) % 96;
        x.fillRect(px, py, size, size);
        if (size > 1 && i % 2) x.fillRect(px + size, py + 1, 1, 1);
      }
      const t = Texture.from(c);
      t.source.scaleMode = 'nearest';
      return new TilingSprite({ texture: t, width: 100, height: 100 });
    };
    this.snow = flakes(['rgba(255,255,255,0.9)', 'rgba(220,236,255,0.75)'], 18, 2);
    this.leaves = flakes(['#e07a3a', '#c8502a', '#e8b040', '#a85a2a'], 7, 2);
    this.snow.visible = this.leaves.visible = false;
    this.front.addChild(this.veil, this.rain, this.snow, this.leaves, this.meteors);

    this.grad = document.createElement('canvas');
    this.grad.width = 1;
    this.grad.height = 256;
    this.gradTex = linearTex(this.grad);
    this.gradSprite = new Sprite(this.gradTex);
    this.back.addChild(this.gradSprite);

    const starTex = Texture.from(starCanvas().toCanvas());
    starTex.source.scaleMode = 'nearest';
    this.stars = new TilingSprite({ texture: starTex, width: 100, height: 100 });
    this.back.addChild(this.stars);

    this.bloom = new Sprite(linearTex(glowCanvas(256, 0.08)));
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = 'add';
    this.back.addChild(this.bloom);
    this.sun = new Sprite(linearTex(discCanvas(26, '#fffbe8', '#ffd88a')));
    this.moon = new Sprite(linearTex(discCanvas(18, '#f4f2ff', '#a8b0d4')));
    for (const s of [this.sun, this.moon]) { s.anchor.set(0.5); this.back.addChild(s); }

    // far cloud bank hugging the horizon
    for (let i = 0; i < 5; i++) {
      const w = 420 + Math.floor(hash2(i, 41) * 260);
      const s = new Sprite(linearTex(cloudCanvas(w, Math.round(w * 0.28), i * 5 + 90, 0.15)));
      s.anchor.set(0.5, 1);
      s.alpha = 0.55;
      this.back.addChild(s);
      this.far.push({ s, px: i / 5 + hash2(i, 42) * 0.1, py: 0.62 + hash2(i, 43) * 0.06, speed: 0.002, par: 0.02, w: w / this.pixel, bob: 0, haze: 0.5 });
    }
    // distant islets (very slow parallax, hazy)
    for (let i = 0; i < 6; i++) {
      const im = art.img(`islet:${i % 5}`);
      const s = new Sprite(im.tex);
      s.anchor.set(0.5, 0.25);
      // small and high: far islets sit above the cloud bands
      const sc = 1;
      s.scale.set(sc);
      // opaque: the bake already fades them into the haze (translucent blocks read as glass)
      s.alpha = 1;
      this.back.addChild(s);
      this.far.push({ s, px: hash2(i, 8) * 1.4 - 0.2, py: 0.14 + hash2(i, 9) * 0.2, speed: 0.0015 + hash2(i, 10) * 0.002, par: 0.03 + hash2(i, 11) * 0.04, w: s.width / this.pixel, bob: 3 + hash2(i, 12) * 5, haze: 0.2 });
    }
    // mid-sky clouds: three depths
    for (let i = 0; i < 12; i++) {
      const depth = i % 3;
      const w = 220 + Math.floor(hash2(i, 21) * 260) + depth * 90;
      const s = new Sprite(linearTex(cloudCanvas(w, Math.round(w * 0.45), i * 7 + 3, 0.05)));
      s.anchor.set(0.5, 1);
      s.alpha = 0.7 + depth * 0.1;
      this.back.addChild(s);
      this.far.push({ s, px: hash2(i, 22) * 1.6 - 0.3, py: 0.3 + depth * 0.16 + hash2(i, 23) * 0.12, speed: 0.003 + depth * 0.003, par: 0.06 + depth * 0.06, w: w / this.pixel, bob: 0, haze: 0.3 - depth * 0.12 });
    }
    // cloud sea far below the island
    for (let i = 0; i < 8; i++) {
      const w = 520 + Math.floor(hash2(i, 31) * 380);
      const s = new Sprite(linearTex(cloudCanvas(w, Math.round(w * 0.4), i * 11 + 50, 0.1)));
      s.anchor.set(0.5, 1);
      s.alpha = 0.96;
      this.back.addChild(s);
      this.near.push({ s, px: hash2(i, 32) * 1.6 - 0.3, py: hash2(i, 33) * 0.5, speed: 0.004 + hash2(i, 34) * 0.004, par: 0.35, w: w / this.pixel, bob: 0, haze: 0 });
    }
  }

  /** dayFrac in [0,1); t seconds; cam in world px; viewport in CSS px. */
  update(dayFrac: number, t: number, camX: number, camY: number, vw: number, vh: number, reduced: boolean, showFront: boolean, seaY: number): SkyState {
    const st = skyAt(dayFrac);
    const key = `${st.top},${st.horizon}`;
    if (key !== this.lastGrad) {
      this.lastGrad = key;
      const ctx = this.grad.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, hex(st.top));
      g.addColorStop(0.45, hex(lerpHex(st.top, st.horizon, 0.45)));
      g.addColorStop(0.68, hex(st.horizon));
      g.addColorStop(1, hex(lerpHex(st.horizon, st.top, 0.25)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1, 256);
      this.gradTex.source.update();
    }
    this.gradSprite.width = vw;
    this.gradSprite.height = vh;

    this.stars.width = vw;
    this.stars.height = vh * 0.75;
    this.stars.tileScale.set(2);
    this.stars.alpha = Math.max(0, st.night - 0.2) * 1.2 * (reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 1.3));
    this.stars.tilePosition.set(-camX * 0.01, -camY * 0.01);
    this.stars.visible = this.stars.alpha > 0.01;

    // sun arcs low and slow so the day reads as a long golden afternoon
    const arc = (f: number) => [vw * (0.1 + f * 0.8), vh * (0.62 - Math.sin(f * Math.PI) * 0.42)];
    const df = ((dayFrac % 1) + 1) % 1;
    const sunF = df / 0.72;
    this.sun.visible = sunF >= 0 && sunF <= 1;
    if (this.sun.visible) {
      const [x, y] = arc(sunF);
      this.sun.position.set(x, y);
      this.sun.alpha = Math.min(1, Math.sin(sunF * Math.PI) * 4);
      this.sun.tint = lerpHex(0xffffff, st.glow, 0.35);
    }
    this.bloom.visible = this.sun.visible && st.glow !== 0;
    if (this.bloom.visible) {
      this.bloom.position.copyFrom(this.sun.position);
      const low = 1 - Math.sin(sunF * Math.PI);
      this.bloom.width = this.bloom.height = Math.max(vw, vh) * (0.9 + low * 0.6);
      this.bloom.tint = st.glow;
      this.bloom.alpha = (0.35 + low * 0.45) * this.sun.alpha;
    }
    const moonF = (df - 0.68 + (df < 0.3 ? 1 : 0)) / 0.34;
    this.moon.visible = moonF >= 0 && moonF <= 1;
    if (this.moon.visible) { const [x, y] = arc(moonF); this.moon.position.set(x, y); this.moon.alpha = Math.min(1, Math.sin(moonF * Math.PI) * 3); }

    const place = (d: Drifter) => {
      const span = vw + d.w * this.pixel * 2;
      let x = (d.px * vw + (reduced ? 0 : t * d.speed * vw) - camX * d.par * 0.6) % span;
      if (x < 0) x += span;
      d.s.x = x - d.w * this.pixel;
      d.s.y = d.py * vh - camY * d.par * 0.4 + (d.bob ? Math.sin(t * 0.2 + d.bob) * d.bob : 0);
      d.s.tint = lerpHex(st.cloud, st.horizon, d.haze);
    };
    this.far.forEach((d, i) => { d.s.visible = !this.lite || i % 2 === 0 || i < 11; if (d.s.visible) place(d); });
    for (const d of this.near) {
      place(d);
      d.s.y = seaY + d.py * vh * 0.35 + 60;
    }
    this.front.visible = showFront;
    // weather overlays
    const w = this.weather;
    this.rain.visible = w === 'rain' && !reduced;
    if (this.rain.visible) {
      this.rain.width = vw; this.rain.height = vh;
      this.rain.tileScale.set(2);
      this.rain.tilePosition.set(-t * 60 - camX * 0.2, t * 420 - camY * 0.2);
      this.rain.alpha = 0.75;
    }
    this.snow.visible = this.season === 'winter' && !reduced && w !== 'rain';
    if (this.snow.visible) {
      this.snow.width = vw; this.snow.height = vh;
      this.snow.tileScale.set(2);
      this.snow.tilePosition.set(Math.sin(t * 0.4) * 30 - camX * 0.2, t * 40 - camY * 0.2);
      this.snow.alpha = 0.8;
    }
    this.leaves.visible = this.season === 'autumn' && !reduced && w !== 'rain';
    if (this.leaves.visible) {
      this.leaves.width = vw; this.leaves.height = vh;
      this.leaves.tileScale.set(2);
      this.leaves.tilePosition.set(-t * 35 + Math.sin(t * 0.7) * 20 - camX * 0.2, t * 26 - camY * 0.2);
      this.leaves.alpha = 0.85;
    }
    this.veil.visible = w === 'rain' || w === 'fog';
    if (this.veil.visible) {
      this.veil.width = vw; this.veil.height = vh;
      this.veil.tint = w === 'fog' ? 0xe8eef4 : 0x6a7890;
      this.veil.alpha = w === 'fog' ? 0.2 + 0.04 * Math.sin(t * 0.3) : 0.16;
    }
    this.meteors.clear();
    if (w === 'starfall' && st.night > 0.5 && !reduced) {
      for (let i = 0; i < 3; i++) {
        const cyc = (t * 0.35 + i * 0.37) % 1;
        if (cyc > 0.25) continue;
        const k = cyc / 0.25, seed = Math.floor(t * 0.35 + i * 0.37) * 7 + i;
        const x0 = hash2(seed, 1) * vw, y0 = hash2(seed, 2) * vh * 0.4;
        const x = x0 - k * 180, y = y0 + k * 90;
        this.meteors.moveTo(x, y).lineTo(x + 26, y - 13).stroke({ color: 0xfff2c0, width: 2, alpha: (1 - k) * st.night });
      }
    }
    return st;
  }
}
