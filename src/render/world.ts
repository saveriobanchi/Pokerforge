import { Application, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, TextureSource } from 'pixi.js';
import { BUILDINGS } from '../core/content/buildings';
import { seasonFor } from '../core/content/seasons';
import { weatherNow } from '../core/economy';
import { type Building, type GameState, type SimEvent, dayFraction, key } from '../core/state';
import { PixelCanvas, rgb } from './art/pixel';
import { tileCenter } from './art/terrain';
import { type ArtImage, type ArtSprite, art } from './artpack';
import { Atlas } from './atlas';
import { Camera } from './camera';
import { Effects, glowTexture } from './effects';
import { Sky } from './sky';

/** A gentle colour grade per season (multiplies the time-of-day tint). */
const SEASON_GRADE: Record<string, [number, number, number]> = { spring: [1, 1, 1], summer: [1, 0.99, 0.95], autumn: [1, 0.94, 0.86], winter: [0.9, 0.95, 1] };

export interface Ghost {
  type: string; // building type or 'land:<id>' or 'remove'
  cells: { x: number; y: number; dir: number; ok: boolean }[];
}

/** Lens colours per kind of building with a reach (the interface legend uses the same). */
export const LENS_COLORS: Record<string, number> = { cashier: 0xffd35a, bar: 0x8fe3d2, stage: 0xff8ad8 };

export interface RangeArea { x: number; y: number; r: number; size: number; color: number }

export interface ViewOptions {
  selected: number | null;
  ghost: Ghost | null;
  grid: boolean;
  landSpots: [number, number][];
  observe: boolean;
  reduced: boolean;
  bubbles: boolean;
  range: { x: number; y: number; r: number; size: number } | null;
  /** The lens: every machine's reach at once, each in its own colour. */
  ranges?: RangeArea[];
  /** Building under the finger right now (lit while pressing, before the tap lands). */
  preview?: number | null;
  /**
   * See-through while placing: how opaque everything standing on the island
   * is drawn (1 = normal). Placing land fades it almost away; placing a
   * building fades it enough to see past while taken tiles stay readable.
   */
  xray?: number;
}

/**
 * A selection outline: the sprite's silhouette, tinted, drawn four times a
 * pixel out on each side just behind it — plus a soft brightening on top.
 */
class Highlight {
  private copies: Sprite[] = [];
  private shine = Object.assign(new Sprite(), { blendMode: 'add' as const });
  private root: Container | null = null;

  constructor(color: number) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.copies.push(Object.assign(new Sprite(), { label: `${dx},${dy}`, tint: color }));
    this.shine.tint = color;
  }

  attach(root: Container, sp: Sprite, alpha: number): void {
    if (this.root !== root) {
      this.detach(this.root);
      for (const c of this.copies) root.addChildAt(c, 0);
      root.addChild(this.shine);
      this.root = root;
    }
    const sil = art.silhouette(sp.texture);
    for (const c of this.copies) {
      const [dx, dy] = c.label.split(',').map(Number);
      c.texture = sil;
      c.anchor.copyFrom(sp.anchor);
      c.scale.copyFrom(sp.scale);
      c.position.set(sp.x + dx * 1.25, sp.y + dy * 1.25);
      c.alpha = alpha;
      c.visible = true;
    }
    this.shine.texture = sp.texture;
    this.shine.anchor.copyFrom(sp.anchor);
    this.shine.position.copyFrom(sp.position);
    this.shine.scale.copyFrom(sp.scale);
    this.shine.alpha = 0.2 * alpha;
    this.shine.visible = true;
  }

  hide(): void { for (const c of this.copies) c.visible = false; this.shine.visible = false; }

  detach(root: Container | null): void {
    if (!root || this.root !== root) return;
    for (const c of this.copies) root.removeChild(c);
    root.removeChild(this.shine);
    this.root = null;
    this.hide();
  }
}

interface SpriteTex {
  def: ArtSprite;
  top: number; // world px from anchor to the top of the art
}

interface BView {
  id: number;
  type: string;
  root: Container;
  sprite: Sprite;
  mote: Sprite | null;
  bubble: Container | null;
  bubbleIcon: Sprite | null;
  lights: Sprite[];
  lightOff: [number, number][];
  shadow: Sprite | null;
  phase: number;
  problem: number;
  bounce: number;
  lastCycles: number;
  x: number;
  y: number;
  dir: number;
}

const STATUS_COLOR: Record<string, number> = { busy: 0x9cf07a, full: 0xffd34a, ready: 0x9cf07a, idle: 0x6a7480 };

export class WorldView {
  app = new Application();
  atlas = new Atlas();
  cam = new Camera();
  sky!: Sky;
  fx!: Effects;
  world = new Container();
  private terrain = new Container();
  private shadows = new Container();
  private falls = new Container();
  private fallFrames: ArtImage[] = [];
  private floor = new Container();
  private objects = new Container();
  private lights = new Container();
  private overlay = new Container();
  private grid = new Graphics();
  private ghostLayer = new Container();
  private tileSprites: Sprite[] = [];
  private decorSprites: Sprite[] = [];
  private decorSig = '';
  private tileRev = -1;
  private views = new Map<number, BView>();
  private spr = new Map<string, SpriteTex>();
  private people = new Map<number, Sprite>();
  private ghostPool: Sprite[] = [];
  private glow!: Texture;
  private moteTex!: Texture;
  private bubbleWarnTex!: Texture;
  private chipIcon!: Texture;
  private state: GameState | null = null;
  private time = 0;
  private shakeT = 0;
  vw = 0;
  vh = 0;
  night = 0;
  frameMs = 16;
  updateMs = 0;

  async init(host: HTMLElement): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    await this.app.init({
      resizeTo: host,
      background: 0x6a5a90,
      antialias: false,
      resolution: dpr,
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.ticker.stop(); // the game loop drives rendering

    this.glow = glowTexture();
    this.sky = new Sky();
    this.fx = new Effects(this.atlas);
    this.buildTextures();
    this.atlas.flush();

    this.objects.sortableChildren = true;
    this.lights.blendMode = 'add';
    this.world.addChild(this.terrain, this.falls, this.shadows, this.floor, this.grid, this.objects, this.fx.layer, this.lights, this.ghostLayer, this.overlay);
    this.worldView.roundPixels = false;
    this.app.stage.addChild(this.sky.back, this.worldView, this.sky.front);
  }

  private buildTextures(): void {
    const a = this.atlas;
    for (const [type, def] of art.sprites) this.spr.set(type, { def, top: def.frames[0].ay / art.R });
    this.fallFrames = Array.from({ length: 6 }, (_, i) => art.img(`fall:${i}`));
    this.chipIcon = art.img('ui:chips').tex;
    const mote = new PixelCanvas(3, 3);
    mote.set(1, 0, rgb(0xffffff)); mote.set(0, 1, rgb(0xffffff)); mote.set(1, 1, rgb(0xffffff)); mote.set(2, 1, rgb(0xffffff)); mote.set(1, 2, rgb(0xffffff));
    this.moteTex = a.add(mote);
    const bubble = (border: number) => {
      const b = new PixelCanvas(22, 24);
      b.poly([[2, 0], [20, 0], [22, 2], [22, 18], [20, 20], [13, 20], [11, 23], [9, 20], [2, 20], [0, 18], [0, 2]], rgb(0x161c22, 235));
      for (let x = 2; x < 20; x++) { b.set(x, 0, rgb(border)); b.set(x, 19, rgb(border, 160)); }
      for (let y = 2; y < 18; y++) { b.set(0, y, rgb(border, 160)); b.set(21, y, rgb(border, 160)); }
      return a.add(b);
    };
    this.bubbleWarnTex = bubble(0xffd34a);
  }

  // ───────────────────────── coordinates ─────────────────────────

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.cam.x + (sx - this.vw / 2) / this.cam.zoom, this.cam.y + (sy - this.vh / 2) / this.cam.zoom];
  }

  screenToTile(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const fx = wx / 64 + wy / 32, fy = wy / 32 - wx / 64;
    return [Math.floor(fx + 0.5), Math.floor(fy + 0.5)];
  }

  /**
   * The front-most building whose drawn pixels are under a screen point —
   * what the player sees is what they get, even where tall art overlaps the
   * tiles behind it. Flat conveyors only win where nothing stands on top.
   */
  pickAt(sx: number, sy: number): number | null {
    const [wx, wy] = this.screenToWorld(sx, sy);
    // a few texels of slack so thin parts (poles, saplings) are still easy to hit
    const slack = 3 / Math.max(0.5, this.cam.zoom);
    let best: number | null = null, bz = -Infinity;
    for (const v of this.views.values()) {
      if (!v.root.visible) continue;
      const z = v.root.zIndex;
      if (z <= bz) continue;
      const sp = v.sprite, f = sp.texture.frame, kx = sp.scale.x, ky = sp.scale.y;
      const x0 = v.root.x + sp.x - sp.anchor.x * f.width * kx, y0 = v.root.y + sp.y - sp.anchor.y * f.height * ky;
      if (wx < x0 - slack || wx >= x0 + f.width * kx + slack || wy < y0 - slack || wy >= y0 + f.height * ky + slack) continue;
      let hit = false;
      for (const [ox, oy] of [[0, 0], [slack, 0], [-slack, 0], [0, slack], [0, -slack]]) {
        const lx = (wx + ox - x0) / kx, ly = (wy + oy - y0) / ky;
        if (lx < 0 || ly < 0 || lx >= f.width || ly >= f.height) continue;
        if (art.alphaAt(sp.texture, f.x + lx, f.y + ly) > 60) { hit = true; break; }
      }
      if (hit) { best = v.id; bz = z; }
    }
    return best;
  }

  private glowSel = new Highlight(0xffd34a);
  private glowPress = new Highlight(0xffffff);

  /** Outline a building's silhouette (and brighten it) so a tap target is never in doubt. */
  private glowOn(g: Highlight, id: number | null | undefined, alpha: number): void {
    const v = id != null ? this.views.get(id) : undefined;
    if (!v || !v.root.visible) { g.hide(); return; }
    g.attach(v.root, v.sprite, alpha);
  }

  tileToScreen(x: number, y: number): [number, number] {
    const [wx, wy] = tileCenter(x, y);
    return [(wx - this.cam.x) * this.cam.zoom + this.vw / 2, (wy - this.cam.y) * this.cam.zoom + this.vh / 2];
  }

  // ───────────────────────── terrain ─────────────────────────


  private syncTerrain(s: GameState): void {
    if (s.tileRev === this.tileRev) return;
    this.tileRev = s.tileRev;
    for (const sp of this.tileSprites) sp.destroy();
    this.tileSprites = [];
    const has = (x: number, y: number) => s.tiles.has(key(x, y));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // painter's order: back to front; each tile draws its rock column, then its top
    const tiles = [...s.tiles.values()].sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
    for (const t of tiles) {
      const [wx, wy] = tileCenter(t.x, t.y);
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
      const dist = gapDist(has, t.x, t.y);
      const want = Math.max(1, Math.min(7, 1 + dist * 1.6 + (hashTile(t.x, t.y) - 0.5) * 1.4));
      const depth = art.depths.reduce((p, d) => (Math.abs(d - want) < Math.abs(p - want) ? d : p), art.depths[0]);
      const v = Math.floor(hashTile(t.y * 3 + 1, t.x * 7) * art.colVariants);
      const mask = (has(t.x + 1, t.y) ? 0 : 1) | (has(t.x, t.y + 1) ? 0 : 2) | (has(t.x - 1, t.y) ? 0 : 4) | (has(t.x, t.y - 1) ? 0 : 8);
      const tv = Math.floor(hashTile(t.x * 5 + 2, t.y * 11) * art.topVariants);
      const kind = t.floor;
      for (const k of [`col:${depth}:${v}`, `top:${kind}:${mask}:${tv}`]) {
        const sp = new Sprite();
        setArt(sp, art.img(k));
        sp.scale.set(1 / art.R);
        sp.position.set(wx, wy);
        this.terrain.addChild(sp);
        this.tileSprites.push(sp);
      }
    }
    this.cam.setBounds(x0, y0, x1, y1 + 80);
    this.islandBottom = y1 + 200;
    this.syncFalls(s);
    this.decorSig = '';
  }

  /** Bushes, flowers, tufts and stones scattered on free grass (stable per tile). */
  private syncDecor(s: GameState): void {
    const sig = `${s.tileRev}|${s.buildings.size}|${[...s.buildings.values()].reduce((h, b) => (h * 31 + b.x * 7 + b.y) | 0, 0)}`;
    if (sig === this.decorSig) return;
    this.decorSig = sig;
    for (const sp of this.decorSprites) sp.destroy();
    this.decorSprites = [];
    const busy = new Set<number>();
    for (const b of s.buildings.values()) {
      const size = BUILDINGS[b.type].size;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) busy.add(key(b.x + x, b.y + y));
    }
    // keep a clear ring around buildings so machines read cleanly
    const near = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (busy.has(key(x + dx, y + dy))) return true; return false; };
    const kinds = art.decorKinds;
    for (const t of s.tiles.values()) {
      if (t.floor !== 'grass' || near(t.x, t.y)) continue;
      // at most one piece per tile, sparse, and grouped in small patches of one kind
      if (hashTile(t.x * 5 + 31, t.y * 3 - 17) > 0.22) continue;
      const patch = hashTile(Math.floor(t.x / 3) * 7 + 3, Math.floor(t.y / 3) * 11 + 5);
      const set = art.decorSets.grass ?? kinds;
      const kind = set[patch < 0.5 ? 0 : patch < 0.78 ? 1 : patch < 0.92 ? 2 : 3] ?? set[0];
      if (!kinds.includes(kind)) continue;
      const v = Math.floor(hashTile(Math.floor(t.x / 3), Math.floor(t.y / 3) + 9) * art.decorVariants);
      const ox = hashTile(t.x * 13, t.y * 7) - 0.5, oy = hashTile(t.x * 3, t.y * 17) - 0.5;
      const fx = t.x + ox * 0.4, fy = t.y + oy * 0.4;
      const sp = new Sprite();
      setArt(sp, art.img(`decor:${kind}:${v}`));
      sp.scale.set(1 / art.R);
      const [wx, wy] = tileCenter(fx, fy);
      sp.position.set(wx, wy);
      sp.zIndex = (fx + fy) * 512 + fx + 256;
      this.objects.addChild(sp);
      this.decorSprites.push(sp);
    }
  }

  islandBottom = 0;

  /**
   * Waterfalls spill from a few grass edges whose drop is clear of other land
   * on screen. Sites are picked by a stable hash so they stay put as you build.
   */
  private syncFalls(s: GameState): void {
    for (const c of this.falls.removeChildren()) c.destroy();
    const sites: [number, number, number][] = [];
    const centres = [...s.tiles.values()].map((t) => tileCenter(t.x, t.y));
    for (const t of s.tiles.values()) {
      if (t.floor !== 'grass') continue;
      const [cx, cy] = tileCenter(t.x, t.y);
      for (const side of [0, 1]) {
        const open = side === 0 ? !s.tiles.has(key(t.x, t.y + 1)) : !s.tiles.has(key(t.x + 1, t.y));
        if (!open) continue;
        const h = hashTile(t.x * 3 + side, t.y);
        if (h > 0.3) continue;
        const fx = cx + (side === 0 ? -16 : 16), fy = cy + 8;
        if (centres.some(([x, y]) => Math.abs(x - fx) < 30 && y > fy + 4)) continue;
        sites.push([fx, fy, h]);
      }
    }
    sites.sort((a, b) => a[2] - b[2]);
    const picked: [number, number, number][] = [];
    for (const site of sites) if (picked.length < 3 && picked.every(([x, y]) => Math.hypot(x - site[0], y - site[1]) > 120)) picked.push(site);
    for (const [fx, fy] of picked) {
      const sp = new Sprite();
      setArt(sp, this.fallFrames[0]);
      sp.scale.set(1 / art.R);
      sp.position.set(fx, fy - 2);
      this.falls.addChild(sp);
    }
  }

  private rt: RenderTexture | null = null;
  private readonly worldView = new Sprite();
  private rtW = 0;
  private rtH = 0;

  /** Grow-only offscreen target; the view samples just the used corner. */
  private ensureRT(w: number, h: number): void {
    if (!this.rt || w > this.rt.width || h > this.rt.height) {
      const old = this.rt;
      this.rt = RenderTexture.create({ width: Math.ceil(Math.max(w, this.rt?.width ?? 0) / 64) * 64, height: Math.ceil(Math.max(h, this.rt?.height ?? 0) / 64) * 64, resolution: 1, scaleMode: 'linear', antialias: false });
      this.rtW = this.rtH = 0;
      old?.destroy(true);
    }
    if (w !== this.rtW || h !== this.rtH) {
      this.rtW = w; this.rtH = h;
      this.worldView.texture = new Texture({ source: this.rt.source, frame: new Rectangle(0, 0, w, h) });
    }
  }

  setQuality(q: 'high' | 'low'): void {
    const res = q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    if (this.app.renderer && this.app.renderer.resolution !== res) {
      this.app.renderer.resolution = res;
      this.app.renderer.resize(this.app.screen.width, this.app.screen.height, res);
    }
    this.sky.lite = q === 'low';
    this.fx.max = q === 'low' ? 120 : 500;
  }

  forceTerrain(): void {
    this.tileRev = -1;
  }

  // ───────────────────────── buildings ─────────────────────────

  private makeView(b: Building): BView {
    const def = BUILDINGS[b.type];
    const root = new Container();
    const st = this.spr.get(b.type)!;
    const sprite = new Sprite();
    setArt(sprite, st.def.frames[0]);
    sprite.scale.set(1 / art.R);
    root.addChild(sprite);
    const v: BView = {
      id: b.id, type: b.type, root, sprite, mote: null, bubble: null, bubbleIcon: null, lights: [], lightOff: [], shadow: null,
      phase: Math.random() * 10, problem: 0, bounce: 0, lastCycles: b.cycles, x: NaN, y: NaN, dir: -1,
    };
    this.objects.addChild(root);
    if (def.kind === 'table') {
      v.mote = new Sprite(this.moteTex);
      v.mote.anchor.set(0.5);
      root.addChild(v.mote);
      v.mote.y = -st.top - 5;
    }
    for (const l of st.def.lights ?? []) {
      const g = new Sprite(this.glow);
      g.anchor.set(0.5);
      g.tint = l[2];
      g.scale.set((l[3] * 2) / 64);
      g.alpha = 0;
      v.lightOff.push([l[0], l[1]]);
      this.lights.addChild(g);
      v.lights.push(g);
    }
    return v;
  }

  private destroyView(v: BView): void {
    for (const g of [this.glowSel, this.glowPress]) g.detach(v.root);
    v.root.destroy({ children: true });
    v.shadow?.destroy();
    for (const l of v.lights) l.destroy();
  }

  /** A short squash-and-stretch on a building (placement, a win, a collection). */
  pulse(id: number, amount = 1): void {
    const v = this.views.get(id);
    if (v) v.bounce = Math.max(v.bounce, amount);
  }

  shake(t = 0.25): void {
    this.shakeT = Math.max(this.shakeT, t);
  }

  // ───────────────────────── events → effects ─────────────────────────

  handleEvents(s: GameState, events: SimEvent[], reduced: boolean): void {
    for (const e of events) {
      switch (e.type) {
        case 'take': {
          const b = s.buildings.get(e.id);
          const v = this.views.get(e.id);
          if (!b || !v || !v.root.visible) break;
          v.bounce = Math.max(v.bounce, 0.25);
          const [wx, wy] = this.centerOf(b);
          this.fx.emit('coin', wx, wy - 26, reduced ? 1 : 3, { up: 26, spread: 10, g: 60, life: 0.9 });
          break;
        }
        case 'collect': {
          const b = s.buildings.get(e.id);
          if (!b) break;
          this.pulse(b.id, 0.6);
          const [wx, wy] = this.centerOf(b);
          this.fx.emit('coin', wx, wy - 30, reduced ? 4 : Math.min(24, 6 + Math.round(Math.log2(1 + e.amount) * 2)), { up: 50, spread: 16, g: 90, life: 1.1 });
          this.fx.emit('gold', wx, wy - 34, reduced ? 2 : 6, { up: 30, spread: 20, life: 1 });
          break;
        }
        case 'vip': {
          const b = s.buildings.get(e.id);
          if (!b) break;
          const [wx, wy] = this.centerOf(b);
          this.fx.emit('star', wx, wy - 40, 14, { up: 30, spread: 30, life: 1.4 });
          break;
        }
        case 'wonder': {
          const f = s.buildings.get(s.wonder.id);
          if (!f) break;
          const [wx, wy] = this.centerOf(f);
          this.fx.emit('gold', wx, wy - 80, 40, { up: 60, spread: 90, life: 2 });
          this.fx.emit('confetti', wx, wy - 100, 60, { up: 80, spread: 90, g: 50, life: 2.5, drag: 0.5 });
          this.shake(0.5);
          break;
        }
        default:
          break;
      }
    }
  }

  /** A celebration at a building (big wins, jackpots, level ups). */
  celebrate(id: number | null, size: 'small' | 'big' | 'huge', reduced: boolean): void {
    const b = id !== null ? this.state?.buildings.get(id) : undefined;
    const [wx, wy] = b ? this.centerOf(b) : this.screenToWorld(this.vw / 2, this.vh / 2);
    const n = size === 'huge' ? 90 : size === 'big' ? 40 : 14;
    this.fx.emit('confetti', wx, wy - 50, reduced ? Math.ceil(n / 4) : n, { up: 70, spread: size === 'huge' ? 120 : 50, g: 45, life: 2.2, drag: 0.5 });
    this.fx.emit('coin', wx, wy - 40, reduced ? 4 : Math.ceil(n / 2), { up: 60, spread: 30, g: 90, life: 1.4 });
    if (b) this.pulse(b.id, 0.9);
    if (size !== 'small') this.shake(size === 'huge' ? 0.5 : 0.25);
  }

  centerOf(b: Building): [number, number] {
    const size = BUILDINGS[b.type].size;
    const [wx, wy] = tileCenter(b.x, b.y);
    return [wx + (size - 1) * 0, wy + (size - 1) * 16];
  }

  burst(kind: Parameters<Effects['emit']>[0], x: number, y: number, n: number, up = 30): void {
    const [wx, wy] = tileCenter(x, y);
    this.fx.emit(kind, wx, wy - 4, n, { up, spread: 28, g: 40, life: 1 });
  }

  // ───────────────────────── frame ─────────────────────────

  render(s: GameState, alpha: number, dt: number, o: ViewOptions): void {
    this.state = s;
    const t0 = performance.now();
    this.time += dt;
    this.vw = this.app.screen.width;
    this.vh = this.app.screen.height;
    this.syncTerrain(s);
    this.cam.update(dt);

    let shx = 0, shy = 0;
    if (this.shakeT > 0 && !o.reduced) {
      this.shakeT -= dt;
      shx = (Math.random() - 0.5) * 3;
      shy = (Math.random() - 0.5) * 3;
    }
    const z = this.cam.zoom;
    // The world is drawn crisp at a whole number of device pixels per art
    // pixel into an offscreen texture, then that image is scaled smoothly to
    // the exact zoom. Pixels stay even-sized and pans/zooms glide sub-pixel.
    const res = this.app.renderer.resolution;
    const zr = z * res;
    const k = zr >= 1.5 ? art.R * Math.max(1, Math.round(zr / art.R)) : Math.max(1, Math.round(zr));
    const rw = Math.ceil(this.vw * k / z) + 4, rh = Math.ceil(this.vh * k / z) + 4;
    this.ensureRT(rw, rh);
    const px = rw / 2 - (this.cam.x - shx / z) * k, py = rh / 2 - (this.cam.y - shy / z) * k;
    const rx = Math.round(px), ry = Math.round(py);
    this.world.scale.set(k);
    this.world.position.set(rx, ry);
    this.worldView.scale.set(z / k);
    this.worldView.position.set(this.vw / 2 - (this.cam.x - shx / z) * z - rx * z / k, this.vh / 2 - (this.cam.y - shy / z) * z - ry * z / k);

    this.sky.weather = weatherNow(s).id;
    this.sky.season = seasonFor(s.time).id;
    const sky = this.sky.update(dayFraction(s), this.time, this.cam.x * z, this.cam.y * z, this.vw, this.vh, o.reduced, true, (this.islandBottom - this.cam.y) * z + this.vh / 2);
    this.night = sky.night;
    const grade = SEASON_GRADE[this.sky.season] ?? [1, 1, 1];
    const tint = ((Math.min(255, ((sky.tint >> 16) & 255) * grade[0]) << 16) | (Math.min(255, ((sky.tint >> 8) & 255) * grade[1]) << 8) | Math.min(255, (sky.tint & 255) * grade[2])) >>> 0;
    for (const layer of [this.terrain, this.shadows, this.floor, this.objects, this.fx.layer]) layer.tint = tint;
    const see = o.xray ?? 1;
    const fade = Math.min(1, dt * 10);
    this.objects.alpha += (see - this.objects.alpha) * fade;
    if (Math.abs(this.objects.alpha - see) < 0.01) this.objects.alpha = see;

    const margin = 140;
    const vx0 = this.cam.x - this.vw / 2 / z - margin, vx1 = this.cam.x + this.vw / 2 / z + margin;
    const vy0 = this.cam.y - this.vh / 2 / z - margin, vy1 = this.cam.y + this.vh / 2 / z + margin * 2;
    for (const c of this.tileSprites) c.visible = c.x > vx0 - 120 && c.x < vx1 + 120 && c.y > vy0 - 40 && c.y < vy1 + 260;
    this.syncDecor(s);

    for (const [id, v] of this.views) {
      const b = s.buildings.get(id);
      if (!b || b.type !== v.type) { this.destroyView(v); this.views.delete(id); }
    }
    const animT = o.reduced ? 0 : this.time;
    for (const b of s.buildings.values()) {
      let v = this.views.get(b.id);
      if (!v) { v = this.makeView(b); this.views.set(b.id, v); v.bounce = 0.6; }
      const def = BUILDINGS[b.type];
      const [wx, wy] = tileCenter(b.x, b.y);
      const cy = wy + (def.size - 1) * 16;
      const visible = wx > vx0 && wx < vx1 && cy > vy0 && cy < vy1;
      v.root.visible = visible;
      for (const l of v.lights) l.visible = visible && this.night > 0.03;
      if (!visible) continue;
      if (v.x !== b.x || v.y !== b.y || v.dir !== b.dir) {
        v.x = b.x; v.y = b.y; v.dir = b.dir;
        v.root.position.set(wx, cy);
        v.root.zIndex = (b.x + b.y + (def.size - 1)) * 512 + b.x + 256;
      }
      if (b.cycles !== v.lastCycles) { v.lastCycles = b.cycles; v.bounce = Math.max(v.bounce, 0.3); }
      this.updateView(s, b, v, animT, dt, o);
    }
    this.renderPatrons(s, alpha, dt);
    this.renderOverlay(s, o);
    this.glowOn(this.glowSel, o.selected, 0.75 + 0.25 * Math.sin(this.time * 5));
    this.glowOn(this.glowPress, o.preview !== o.selected ? o.preview : null, 1);

    // ambient life: drifting sparkles at night, petals by day
    if (!o.reduced && Math.random() < dt * (this.night > 0.5 ? 2 : 0.6)) {
      const [wx, wy] = this.screenToWorld(Math.random() * this.vw, Math.random() * this.vh);
      this.fx.emit(this.night > 0.5 ? 'star' : 'leaf', wx, wy, 1, { vx: 8, up: 2, spread: 4, life: 3, drag: 0.9, g: 3 });
    }
    this.fx.update(dt);
    if (this.falls.children.length) {
      const fi = Math.floor(this.time * 12) % this.fallFrames.length;
      for (const c of this.falls.children) {
        setArt(c as Sprite, this.fallFrames[fi]);
        if (!o.reduced && c.visible && Math.random() < dt * 3) this.fx.emit('steam', c.x + (Math.random() - 0.5) * 16, c.y + 112, 1, { up: 6, spread: 10, life: 1.4, g: -4, drag: 0.6 });
      }
    }
    const t1 = performance.now();
    this.app.renderer.render({ container: this.world, target: this.rt!, clear: true });
    this.app.renderer.render(this.app.stage);
    const t2 = performance.now();
    this.frameMs = this.frameMs * 0.9 + (t2 - t0) * 0.1;
    this.updateMs = this.updateMs * 0.9 + (t1 - t0) * 0.1;
  }

  private updateView(s: GameState, b: Building, v: BView, t: number, dt: number, o: ViewOptions): void {
    const def = BUILDINGS[b.type];
    if (v.bounce > 0) {
      v.bounce = Math.max(0, v.bounce - dt * 3.2);
      const k = Math.sin(v.bounce * Math.PI) * 0.08 * (o.reduced ? 0.3 : 1);
      v.sprite.scale.set((1 + k) / art.R, (1 - k) / art.R);
    } else if (v.sprite.scale.x !== 1 / art.R) v.sprite.scale.set(1 / art.R);

    const st = this.spr.get(b.type)!;
    const vars = st.def.variants;
    let frames = st.def.frames;
    if (def.kind === 'wonder') frames = vars['st' + Math.max(0, Math.min(3, s.wonder.stage))] ?? frames;
    else if (vars['d' + b.dir]) frames = vars['d' + b.dir];
    // tables animate faster while patrons play; everything else idles gently
    const speed = def.kind === 'table' ? (b.status === 'busy' || b.status === 'full' ? 1 : 0.35) : 1;
    const raw = frames.length > 1 ? Math.floor((t * speed + v.phase) * st.def.fps) % frames.length : 0;
    const fr = frames[Number.isFinite(raw) && raw >= 0 ? raw : 0];
    if (v.sprite.texture !== fr.tex) setArt(v.sprite, fr);

    if (v.mote) {
      const col = STATUS_COLOR[b.status] ?? 0x6a7480;
      v.mote.tint = col;
      v.mote.alpha = b.status === 'idle' ? 0.3 : b.status === 'full' ? 0.55 + 0.45 * Math.sin(t * 6) : 0.75 + 0.25 * Math.sin(t * 2 + v.phase);
      v.mote.visible = !o.observe;
      v.mote.y = -st.top - 6 + (o.reduced ? 0 : Math.round(Math.sin(t * 2 + v.phase)));
    }
    // a chip bubble when a till is full (tap to empty it)
    const full = b.status === 'full';
    v.problem = full ? v.problem + dt : 0;
    const show = o.bubbles && !o.observe && full && v.problem > 1;
    if (show) {
      if (!v.bubble) {
        v.bubble = new Container();
        const bg = new Sprite(this.bubbleWarnTex);
        bg.anchor.set(0.5, 1);
        v.bubbleIcon = new Sprite(this.chipIcon);
        v.bubbleIcon.anchor.set(0.5);
        v.bubbleIcon.scale.set(0.5);
        v.bubbleIcon.y = -11;
        v.bubble.addChild(bg, v.bubbleIcon);
        v.root.addChild(v.bubble);
      }
      v.bubble.y = -st.top - 9 + (o.reduced ? 0 : Math.round(Math.sin(t * 2.4 + v.phase) * 1.5));
      v.bubble.visible = true;
      v.bubble.alpha = Math.min(1, v.bubble.alpha + dt * 4);
    } else if (v.bubble) {
      v.bubble.alpha -= dt * 4;
      if (v.bubble.alpha <= 0) v.bubble.visible = false;
    }
    if (v.lights.length) {
      const on = def.kind !== 'decor' || true;
      const flick = 0.85 + 0.15 * Math.sin(t * 7 + v.phase);
      for (let li = 0; li < v.lights.length; li++) {
        const l = v.lights[li];
        const off = st.def.lights4?.[b.dir]?.[li] ?? v.lightOff[li];
        l.position.set(v.root.x + off[0], v.root.y + off[1]);
        const target = this.night * (on ? 0.8 * flick : 0.18);
        l.alpha += (target - l.alpha) * Math.min(1, dt * 4);
      }
    }
    // tables with players throw the odd sparkle
    if (def.kind === 'table' && b.status === 'busy' && !o.reduced && Math.random() < dt * 0.4) {
      this.fx.emit('gold', v.root.x, v.root.y - st.top * 0.6, 1, { up: 14, spread: 10, life: 0.8 });
    }
  }

  /** Patrons walk in, play at tables (arms up now and then) and walk off. */
  private renderPatrons(s: GameState, alpha: number, dt: number): void {
    const live = new Set<number>();
    for (const p of s.patrons) {
      live.add(p.id);
      let sp = this.people.get(p.id);
      if (!sp) { sp = new Sprite(); this.objects.addChild(sp); this.people.set(p.id, sp); }
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
      const [wx, wy] = tileCenter(x, y);
      const look = p.vip ? 8 : p.look;
      const walking = p.phase !== 'play';
      const f = walking ? Math.floor(this.time * 6 + p.id) % 2 : (Math.sin(this.time * 1.3 + p.id * 2.1) > 0.92 ? 2 : 0);
      setArt(sp, art.img(`person:${look}:${f}`));
      sp.scale.set((walking && p.tx < p.x - 0.01 ? -1 : 1) / art.R, 1 / art.R);
      sp.position.set(Math.round(wx), Math.round(wy + (walking ? 0 : -2)));
      sp.zIndex = (x + y) * 512 + x + 300;
      sp.alpha = p.phase === 'leave' ? Math.max(0, Math.min(1, p.fade)) : Math.min(1, p.fade);
      if (p.phase === 'leave') p.fade = Math.max(0, p.fade - dt * 0.6);
    }
    for (const [id, sp] of this.people) if (!live.has(id)) { sp.destroy(); this.people.delete(id); }
  }

  private ghostSprite(i: number): Sprite {
    let g = this.ghostPool[i];
    if (!g) {
      g = new Sprite();
      this.ghostLayer.addChild(g);
      this.ghostPool.push(g);
    }
    g.visible = true;
    return g;
  }

  private renderOverlay(s: GameState, o: ViewOptions): void {
    const g = this.grid;
    g.clear();
    let gi = 0;
    const diamond = (x: number, y: number, color: number, alpha: number, fill = 0) => {
      const [cx, cy] = tileCenter(x, y);
      const pts = [cx, cy - 16, cx + 32, cy, cx, cy + 16, cx - 32, cy];
      if (fill) g.poly(pts).fill({ color, alpha: fill });
      g.poly(pts).stroke({ width: 1 / this.cam.zoom * 1.5, color, alpha });
    };
    if (o.grid) {
      // faint grid around the camera centre only
      const [cx, cy] = this.screenToTile(this.vw / 2, this.vh / 2);
      for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++) {
        if (!s.tiles.has(key(x, y))) continue;
        const d = Math.hypot(x - cx, y - cy);
        diamond(x, y, 0xf6e9c6, Math.max(0, 0.22 - d * 0.02));
      }
    }
    for (const [x, y] of o.landSpots) diamond(x, y, 0xf6e9c6, 0.55, 0.08);
    if (o.ranges?.length) {
      // Each kind's covered ground: a faint wash, then a bold outline around its edge only,
      // so overlapping reaches of different machines stay readable.
      const areas = new Map<number, Set<number>>();
      for (const r of o.ranges) {
        let set = areas.get(r.color);
        if (!set) areas.set(r.color, (set = new Set()));
        for (let y = r.y - r.r; y <= r.y + r.r + r.size - 1; y++) for (let x = r.x - r.r; x <= r.x + r.r + r.size - 1; x++) set.add(key(x, y));
      }
      const w = (2.2 / this.cam.zoom);
      for (const [color, set] of areas) {
        for (const k of set) {
          const t = s.tiles.get(k);
          const [x, y] = t ? [t.x, t.y] : [Math.floor(k / 4096) - 2048, (k % 4096) - 2048];
          const [cx, cy] = tileCenter(x, y);
          const top: [number, number] = [cx, cy - 16], right: [number, number] = [cx + 32, cy], bottom: [number, number] = [cx, cy + 16], left: [number, number] = [cx - 32, cy];
          g.poly([...top, ...right, ...bottom, ...left]).fill({ color, alpha: 0.07 });
          // an edge is drawn where the neighbour is outside this kind's reach
          const edges: [number, number, [number, number], [number, number]][] = [[1, 0, right, bottom], [-1, 0, left, top], [0, 1, bottom, left], [0, -1, top, right]];
          for (const [dx, dy, a, b] of edges) {
            if (set.has(key(x + dx, y + dy))) continue;
            g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: w, color, alpha: 0.9 });
          }
        }
      }
      for (const r of o.ranges) for (let y = 0; y < r.size; y++) for (let x = 0; x < r.size; x++) diamond(r.x + x, r.y + y, r.color, 0.95, 0.35);
    }
    if (o.range) {
      const r = o.range;
      for (let y = r.y - r.r; y <= r.y + r.r + r.size - 1; y++) for (let x = r.x - r.r; x <= r.x + r.r + r.size - 1; x++) diamond(x, y, 0x8fe3d2, 0.35, 0.07);
    }
    if (o.selected !== null) {
      const b = s.buildings.get(o.selected);
      if (b) {
        const size = BUILDINGS[b.type].size;
        const pulse = 0.55 + 0.35 * Math.sin(this.time * 5);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) diamond(b.x + x, b.y + y, 0xffe08a, pulse, 0.1);
      }
    }
    if (o.ghost) {
      const gh = o.ghost;
      for (const c of gh.cells) {
        const color = c.ok ? 0x9cf07a : 0xff6a52;
        if (gh.type.startsWith('land:') || gh.type === 'remove') {
          diamond(c.x, c.y, color, 0.9, 0.25);
          continue;
        }
        const def = BUILDINGS[gh.type];
        for (let y = 0; y < def.size; y++) for (let x = 0; x < def.size; x++) diamond(c.x + x, c.y + y, color, 0.8, 0.12);
        const sp = this.ghostSprite(gi++);
        const [wx, wy] = tileCenter(c.x, c.y);
        const gdef = this.spr.get(gh.type)!.def;
        setArt(sp, (gdef.variants['d' + c.dir] ?? gdef.frames)[0]);
        sp.scale.set(1 / art.R);
        sp.position.set(wx, wy + (def.size - 1) * 16);
        sp.alpha = 0.7;
        sp.tint = c.ok ? 0xe8ffe0 : 0xff9a8a;
      }
    }
    for (let i = gi; i < this.ghostPool.length; i++) this.ghostPool[i].visible = false;
  }

  setAlpha(_a: number): void {
    // patrons interpolate with the alpha passed to render()
  }

  /** For dev overlays. */
  stats(): { sprites: number; people: number; particles: number; chunks: number } {
    return { sprites: this.views.size, people: this.people.size, particles: this.fx.count, chunks: this.tileSprites.length };
  }
}

function hashTile(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}


/** Point a sprite at a baked art image, keeping its anchor on the image's ground point. */
function setArt(sp: Sprite, a: ArtImage | undefined): void {
  if (!a) return;
  sp.texture = a.tex;
  sp.anchor.set(a.ax / a.w, a.ay / a.h);
}

/** Chebyshev distance (in tiles, capped at 4) to the nearest missing tile. */
function gapDist(has: (x: number, y: number) => boolean, x: number, y: number): number {
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!has(x + dx, y + dy)) return r - 1;
    }
  }
  return 4;
}
