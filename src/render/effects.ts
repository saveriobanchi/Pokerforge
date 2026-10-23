import { Container, Sprite, Texture } from 'pixi.js';
import { P } from './art/palette';
import { PixelCanvas, bayer, rgb, type RGBA } from './art/pixel';
import type { Atlas } from './atlas';

export type FxKind = 'smoke' | 'steam' | 'leaf' | 'dust' | 'spark' | 'mote' | 'star' | 'gold' | 'water' | 'pop' | 'coin' | 'confetti';

interface Particle {
  s: Sprite;
  x: number; y: number; vx: number; vy: number;
  g: number; drag: number;
  life: number; max: number;
  a0: number; grow: number; spin: number;
}

function puff(r: number, c: RGBA): PixelCanvas {
  const s = r * 2 + 1;
  const pc = new PixelCanvas(s, s);
  pc.ellipse(r + 0.5, r + 0.5, r + 0.3, r + 0.3, (x, y, d) => (bayer(x, y) > d * 1.1 - 0.1 ? c : 0));
  return pc;
}

function dot(w: number, h: number, c: RGBA, hi?: RGBA): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  pc.rect(0, 0, w, h, c);
  if (hi) pc.set(0, 0, hi);
  return pc;
}

function sparkle(c: RGBA): PixelCanvas {
  const pc = new PixelCanvas(5, 5);
  pc.set(2, 2, rgb(0xffffff));
  pc.set(1, 2, c); pc.set(3, 2, c); pc.set(2, 1, c); pc.set(2, 3, c);
  pc.set(0, 2, rgb(0xffffff, 90)); pc.set(4, 2, rgb(0xffffff, 90)); pc.set(2, 0, rgb(0xffffff, 90)); pc.set(2, 4, rgb(0xffffff, 90));
  return pc;
}

function coinDot(edge = false): PixelCanvas {
  const pc = new PixelCanvas(edge ? 2 : 4, 4);
  pc.rect(0, 0, edge ? 2 : 4, 4, P.gold[3]);
  pc.set(0, 0, P.gold[4]);
  if (!edge) { pc.set(3, 3, P.gold[1]); pc.set(0, 3, rgb(0, 0)); pc.set(3, 0, rgb(0, 0)); }
  return pc;
}

/** Smooth radial light (intentionally not pixelated: it is light, not matter). */
export function glowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = Texture.from(c);
  t.source.scaleMode = 'linear';
  return t;
}

export class Effects {
  readonly layer = new Container();
  private pool: Sprite[] = [];
  private live: Particle[] = [];
  private tex: Record<FxKind, Texture[]>;
  max = 500;

  constructor(atlas: Atlas) {
    this.tex = {
      smoke: [puff(3, rgb(0xb8bcc0, 200)), puff(4, rgb(0x9aa0a8, 170)), puff(2, rgb(0xd0d2d0, 200))].map((p) => atlas.add(p)),
      steam: [puff(2, rgb(0xf6f2ea, 170)), puff(3, rgb(0xffffff, 140))].map((p) => atlas.add(p)),
      leaf: [dot(2, 1, P.leaf[3], P.leaf[4]), dot(1, 2, P.leaf[2]), dot(2, 2, P.leaf[3], P.leaf[4])].map((p) => atlas.add(p)),
      dust: [dot(1, 1, P.soil[4]), dot(2, 1, P.soil[3]), puff(2, rgb(0xc8a878, 150))].map((p) => atlas.add(p)),
      spark: [dot(1, 1, P.fire[4]), dot(1, 1, P.fire[3])].map((p) => atlas.add(p)),
      mote: [dot(1, 1, P.aether[5]), sparkle(P.aether[4])].map((p) => atlas.add(p)),
      star: [sparkle(P.star[2]), dot(1, 1, P.star[3])].map((p) => atlas.add(p)),
      gold: [sparkle(P.gold[3]), dot(1, 1, P.gold[4])].map((p) => atlas.add(p)),
      water: [dot(1, 1, P.water[4]), dot(1, 2, P.water[3])].map((p) => atlas.add(p)),
      pop: [sparkle(P.cream[2])].map((p) => atlas.add(p)),
      coin: [coinDot(), coinDot(true)].map((p) => atlas.add(p)),
      confetti: [0xff5a6a, 0x5ac8ff, 0xffd040, 0x8aff7a, 0xd88aff].map((c) => atlas.add(dot(2, 1, rgb(c), rgb(0xffffff)))),
    };
  }

  emit(kind: FxKind, x: number, y: number, n = 1, opts: Partial<{ vx: number; vy: number; spread: number; g: number; life: number; up: number; drag: number; grow: number }> = {}): void {
    for (let i = 0; i < n; i++) {
      if (this.live.length >= this.max) return;
      const s = this.pool.pop() ?? new Sprite();
      const list = this.tex[kind];
      s.texture = list[Math.floor(Math.random() * list.length)];
      s.anchor.set(0.5);
      s.visible = true;
      s.alpha = 1;
      s.scale.set(1);
      s.rotation = 0;
      if (!s.parent) this.layer.addChild(s);
      const spread = opts.spread ?? 6;
      const p: Particle = {
        s,
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread * 0.5,
        vx: (opts.vx ?? 0) + (Math.random() - 0.5) * (opts.spread ?? 6) * 2,
        vy: (opts.vy ?? 0) - (opts.up ?? 0) * (0.6 + Math.random() * 0.8),
        g: opts.g ?? 0,
        drag: opts.drag ?? 0.5,
        life: 0,
        max: (opts.life ?? 1) * (0.7 + Math.random() * 0.6),
        a0: 1,
        grow: opts.grow ?? 0,
        spin: kind === 'leaf' ? (Math.random() - 0.5) * 6 : 0,
      };
      this.live.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      if (p.life >= p.max) {
        p.s.visible = false;
        this.pool.push(p.s);
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }
      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      p.s.x = Math.round(p.x);
      p.s.y = Math.round(p.y);
      p.s.alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      if (p.grow) p.s.scale.set(1 + p.grow * t);
      if (p.spin) p.s.rotation += p.spin * dt;
    }
  }

  get count(): number {
    return this.live.length;
  }
}
