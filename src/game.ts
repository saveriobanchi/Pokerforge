import * as A from './core/actions';
import { BUILDINGS } from './core/content/buildings';
import { LAND, landCost } from './core/content/world';
import { gameOfType } from './core/economy';
import { applyOffline, type OfflineReport } from './core/offline';
import { deserialize, exportText, importText, serialize } from './core/save';
import { TICK, rebuildCache, tick } from './core/sim';
import { type Building, type Dir, type GameState, DX, DY, buildingAt, createState, key, tileAt } from './core/state';
import { demoWorld } from './dev/demo';
import { audio, haptic } from './platform/audio';
import * as store from './platform/storage';
import { tileCenter } from './render/art/terrain';
import { attachGestures } from './input/gestures';
import { type Ghost, LENS_COLORS, type RangeArea, WorldView } from './render/world';
import { UI } from './ui/ui';
import { art } from './render/artpack';

export interface Settings {
  master: number;
  sfx: number;
  ambience: number;
  haptics: boolean;
  reduced: boolean;
  quality: 'high' | 'low';
  /** True once the player picks a quality themselves (disables auto-tuning). */
  qualityChosen: boolean;
  ui: number;
  bubbles: boolean;
  dev: boolean;
  fps: boolean;
}

const DEFAULT_SETTINGS: Settings = { master: 0.8, sfx: 0.8, ambience: 0.6, haptics: true, reduced: false, quality: 'high', qualityChosen: false, ui: 1, bubbles: true, dev: false, fps: false };

export type Mode =
  | { kind: 'play' }
  | { kind: 'build'; type: string; dir: Dir }
  | { kind: 'land'; land: string }
  | { kind: 'remove' }
  | { kind: 'move'; id: number; dir: Dir };

export class Game {
  s!: GameState;
  view = new WorldView();
  ui!: UI;
  settings: Settings = { ...DEFAULT_SETTINGS };
  mode: Mode = { kind: 'play' };
  selected: number | null = null;
  speed = 1;
  observe = false;
  private acc = 0;
  private last = 0;
  private paint: { sx: number; sy: number; cells: { x: number; y: number; dir: number; ok: boolean }[] } | null = null;
  private hover: [number, number] | null = null;
  private press: [number, number] | null = null;
  /** Building that a tap here would pick (lit while the finger is down). */
  private pressPick: number | null = null;
  private saveTimer = 0;
  private backupTimer = 0;
  private dirty = false;
  private hiddenAt = 0;
  private lastInteraction = 0;
  private recovered = false;

  async start(): Promise<void> {
    const saved = await store.get<Partial<Settings>>('settings');
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    const params = new URLSearchParams(location.search);
    if (params.has('dev')) this.settings.dev = true;
    this.applySettings();

    const loaded = params.has('demo') ? null : await this.load();
    let offline: OfflineReport | null = null;
    if (params.has('demo')) this.s = demoWorld(params.get('demo') ?? '');
    else if (loaded) {
      this.s = loaded.state;
      if (loaded.view) this.view.cam.jump(loaded.view.x, loaded.view.y, loaded.view.zoom);
      const away = (Date.now() - (this.s.savedAt || Date.now())) / 1000;
      if (away > 1) offline = applyOffline(this.s, away);
    } else this.s = createState((Math.random() * 2 ** 31) >>> 0);
    rebuildCache(this.s);

    const stage = document.getElementById('stage')!;
    await art.load();
    // pixel frames for the interface come from the art pack
    for (const k of ['panel', 'btn', 'btnp', 'btnd', 'slot', 'big']) document.documentElement.style.setProperty(`--tex-${k}`, `url(${art.url('uitex:' + k)})`);
    await this.view.init(stage);
    this.applySettings();
    if (!loaded) {
      const [wx, wy] = tileCenter(0, 0);
      this.view.cam.jump(wx, wy - 10, this.defaultZoom());
    }
    if (params.has('zoom')) this.view.cam.jump(this.view.cam.x, this.view.cam.y, +(params.get('zoom') ?? 2));
    if (params.has('night')) this.s.time = 0.8 * 600;
    if (params.has('t')) this.s.time = Number(params.get('t')) * 600;
    this.ui = new UI(this, document.getElementById('ui')!);
    attachGestures(this.view.app.canvas, {
      tap: (x, y) => this.onTap(x, y),
      longPress: (x, y) => this.onLongPress(x, y),
      press: (x, y) => { this.press = this.view.screenToTile(x, y); this.pressPick = this.mode.kind === 'play' || this.mode.kind === 'remove' ? this.pickBuilding(x, y)?.id ?? null : null; audio.unlock(); this.lastInteraction = performance.now(); },
      release: () => { this.pressPick = null; },
      pan: (dx, dy) => { this.view.cam.panBy(dx, dy); this.press = null; this.pressPick = null; },
      panEnd: (vx, vy) => { if (!this.settings.reduced) this.view.cam.fling(vx, vy); },
      pinch: (sc, cx, cy, dx, dy) => { this.view.cam.panBy(dx, dy); this.view.cam.zoomAt(sc, cx, cy, this.view.vw, this.view.vh); this.press = null; this.pressPick = null; },
      wheel: (f, x, y) => this.view.cam.zoomAt(f, x, y, this.view.vw, this.view.vh, false),
      hover: (x, y) => { this.hover = x < 0 ? null : this.view.screenToTile(x, y); },
      paintActive: () => this.mode.kind === 'land' || this.mode.kind === 'remove' || (this.mode.kind === 'build' && !!BUILDINGS[this.mode.type].draggable),
      paintStart: (x, y) => this.paintStart(x, y),
      paintMove: (x, y) => this.paintMove(x, y),
      paintEnd: (_x, _y, cancelled) => this.paintEnd(cancelled),
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => { void this.save(); });
    window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    void store.persist();

    this.ui.refreshAll();
    if (offline && (offline.banked + offline.tills > 0 || offline.seconds > 600)) this.ui.showAway(offline);
    else if (!loaded && !params.has('demo')) this.ui.showWelcome();
    if (this.recovered) this.ui.hint('Your casino was restored from a backup.', false, 4000);
    document.getElementById('boot')?.classList.add('gone');
    (window as unknown as { gameReady: boolean; game: Game; actions: typeof A }).gameReady = true;
    (window as unknown as { actions: typeof A; content: unknown }).actions = A; // used by tests and the dev panel
    (window as unknown as { content: unknown }).content = { BUILDINGS };
    (window as unknown as { game: Game }).game = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  defaultZoom(): number {
    // about seven tiles across the short side, snapped so art pixels land on whole device pixels
    const short = Math.min(window.innerWidth, window.innerHeight), dpr = window.devicePixelRatio || 1;
    return Math.max(1, Math.min(3, Math.round((short / 440) * dpr) / dpr));
  }

  applySettings(): void {
    const st = this.settings;
    audio.volumes = { master: st.master, sfx: st.sfx, ambience: st.ambience };
    audio.applyVolumes();
    document.documentElement.style.setProperty('--ui', String(st.ui));
    document.body.classList.toggle('reduced', st.reduced);
    if (this.view.fx) this.view.setQuality(st.quality);
  }

  saveSettings(): void {
    this.applySettings();
    void store.put('settings', this.settings);
  }

  // ───────────────────────── loop ─────────────────────────

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    this.autoQuality(dt);
    if (dt > 0.25) dt = 0.25;
    if (!(dt > 0)) dt = 0; // rAF timestamps can precede performance.now()
    // fixed-step simulation
    this.acc += dt * this.speed;
    let steps = 0;
    const maxSteps = this.speed > 1 ? 400 : 12;
    while (this.acc >= TICK && steps < maxSteps) {
      tick(this.s, TICK);
      this.acc -= TICK;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    const alpha = Math.min(1, this.acc / TICK);
    this.view.setAlpha(alpha);
    this.consumeEvents();
    if (this.observe && !this.settings.reduced && performance.now() - this.lastInteraction > 4000) this.view.cam.panBy(-dt * 6, -dt * 1.5);
    this.view.render(this.s, alpha, dt, {
      selected: this.selected,
      ghost: this.ghost(),
      grid: this.mode.kind !== 'play',
      landSpots: this.mode.kind === 'land' ? this.landSpots() : [],
      observe: this.observe,
      reduced: this.settings.reduced,
      bubbles: this.settings.bubbles,
      range: this.rangeOverlay(),
      ranges: this.mode.kind === 'build' && BUILDINGS[this.mode.type].radius ? this.lensRanges() : undefined,
      preview: this.pressPick,
      xray: this.mode.kind === 'land' ? (LAND[this.mode.land].mode === 'new' ? 0.5 : 0.25) : this.mode.kind === 'build' || this.mode.kind === 'move' ? 0.4 : 1,
    });
    audio.night = this.view.night;
    audio.update(dt, 0.6, Math.min(1, this.s.patrons.length / 30), this.observe);
    this.ui.frame(dt);
    this.saveTimer += dt;
    this.backupTimer += dt;
    if (this.saveTimer > (this.dirty ? 6 : 20)) void this.save();
  }

  private consumeEvents(): void {
    const ev = this.s.events;
    if (!ev.length) return;
    this.view.handleEvents(this.s, ev, this.settings.reduced);
    for (const e of ev) {
      this.ui.onEvent(e);
      switch (e.type) {
        case 'levelup':
          haptic([20, 50, 20], this.settings.haptics);
          this.view.celebrate(null, 'big', this.settings.reduced);
          this.markDirty();
          break;
        case 'take': {
          const b = this.s.buildings.get(e.id);
          if (b && this.nearness(b.x, b.y) > 0.25 && !this.ui.modalOpen()) audio.play('coin', 0.9 + Math.random() * 0.2);
          break;
        }
        case 'jackpot':
        case 'codex':
        case 'wonder':
          haptic([30, 60, 30, 60, 80], this.settings.haptics);
          this.markDirty();
          break;
        default:
          break;
      }
    }
    ev.length = 0;
  }

  /** 0..1 loudness for a world position given the camera. */
  nearness(x: number, y: number): number {
    const [sx, sy] = this.view.tileToScreen(x, y);
    const vw = this.view.vw, vh = this.view.vh;
    if (sx < -60 || sy < -60 || sx > vw + 60 || sy > vh + 60) return 0;
    const d = Math.hypot((sx - vw / 2) / vw, (sy - vh / 2) / vh);
    const zoom = Math.min(1, this.view.cam.zoom / 3);
    return Math.max(0, (1 - d * 1.3) * zoom);
  }

  private perf = { t: 0, slow: 0, done: false };
  /** If the device cannot hold ~40 fps, quietly switch to light effects once. */
  private autoQuality(dt: number): void {
    const p = this.perf;
    if (p.done || this.settings.qualityChosen || this.settings.quality === 'low' || document.hidden) return;
    p.t += dt;
    if (p.t < 3) return;
    if (dt > 1 / 38) p.slow += dt; else p.slow = Math.max(0, p.slow - dt * 0.5);
    if (p.slow > 4) {
      p.done = true;
      this.settings.quality = 'low';
      this.saveSettings();
      this.ui.hint('Switched to light effects for smoother play.', false, 3000);
    }
    if (p.t > 40) p.done = true;
  }

  // ───────────────────────── input ─────────────────────────

  private onTap(sx: number, sy: number): void {
    this.lastInteraction = performance.now();
    if (this.observe) { this.ui.wakeObserve(); return; }
    const [tx, ty] = this.view.screenToTile(sx, sy);
    this.press = null;
    this.pressPick = null;
    switch (this.mode.kind) {
      case 'build': return this.tryPlace(this.mode.type, tx, ty, this.mode.dir, sx, sy);
      case 'land': return this.tryExpand(this.mode.land, tx, ty, sx, sy);
      case 'remove': { const p = this.pickBuilding(sx, sy); return this.tryRemove(p ? p.x : tx, p ? p.y : ty); }
      case 'move': return this.tryMove(this.mode.id, tx, ty, this.mode.dir);
      default: break;
    }
    const b = this.pickBuilding(sx, sy);
    if (!b) {
      if (this.selected !== null) { this.select(null); audio.play('close'); }
      return;
    }
    const kind = BUILDINGS[b.type].kind;
    if (kind === 'well') { this.tapWell(b, sx, sy); this.select(b.id, false); return; }
    if (gameOfType(b.type)) { this.view.pulse(b.id, 0.4); audio.play('select'); this.ui.openTable(b); return; }
    this.select(b.id);
  }

  tapWell(b: Building, sx?: number, sy?: number): void {
    const r = A.tapWell(this.s, b.id);
    if (r.ok) {
      audio.play('coin', 0.9 + Math.random() * 0.25);
      haptic(8, this.settings.haptics);
      this.view.pulse(b.id, 0.6);
      this.view.burst('coin', b.x, b.y, this.settings.reduced ? 3 : 8, 40);
      const [px, py] = sx !== undefined ? [sx, sy!] : this.view.tileToScreen(b.x, b.y);
      if (r.got) this.ui.floatChips(r.got, px, py - 30);
      if (r.purse) { this.ui.hint(`Down to the felt? The well hands back a purse: +${r.purse} chips.`, false, 3500); audio.play('bell'); }
      this.markDirty();
    } else this.fail(r.reason);
  }

  centre(): void {
    const [wx, wy] = tileCenter(0, 0);
    this.view.cam.focus(wx, wy - 10, this.defaultZoom());
  }

  focusOn(b: Building): void {
    const [wx, wy] = tileCenter(b.x, b.y);
    this.view.cam.focus(wx, wy - 20);
  }

  /**
   * What a tap at a screen point means: the building whose drawn pixels are
   * under the finger (front-most first), else whatever stands on the ground
   * tile there.
   */
  private pickBuilding(sx: number, sy: number) {
    const id = this.view.pickAt(sx, sy);
    if (id !== null) return this.s.buildings.get(id);
    const [tx, ty] = this.view.screenToTile(sx, sy);
    return buildingAt(this.s, tx, ty);
  }

  private onLongPress(sx: number, sy: number): void {
    if (this.mode.kind !== 'play') return;
    this.pressPick = null;
    const b = this.pickBuilding(sx, sy);
    if (b) { this.select(b.id); haptic(12, this.settings.haptics); }
  }

  private onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    // at a table, Space or Enter presses the main button (deal, spin, roll, draw…)
    if ((e.key === ' ' || e.key === 'Enter') && this.ui.tablePrimary()) { e.preventDefault(); return; }
    if (e.key === 'Escape') { this.setMode({ kind: 'play' }); this.select(null); this.ui.closeAll(); }
    if (e.key === 'r' || e.key === 'R') this.rotateMode();
    if (e.key === 'o' || e.key === 'O') this.toggleObserve();
    if (e.key === 'b' || e.key === 'B') this.ui.toggleBuild();
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      void this.save();
      audio.suspend();
    } else {
      audio.resume();
      if (this.hiddenAt) {
        const away = (Date.now() - this.hiddenAt) / 1000;
        this.hiddenAt = 0;
        if (away > 2) {
          const rep = applyOffline(this.s, away);
          this.consumeEvents();
          if (rep && (rep.banked + rep.tills > 0 && away > 60)) this.ui.showAway(rep);
          this.ui.refreshAll();
        }
      }
    }
  }

  // ───────────────────────── modes ─────────────────────────

  setMode(m: Mode): void {
    this.mode = m;
    this.paint = null;
    if (m.kind !== 'play') this.select(null, false);
    this.ui.onMode();
  }

  rotateMode(): void {
    if (this.mode.kind === 'build' && BUILDINGS[this.mode.type].rotatable) {
      this.mode = { ...this.mode, dir: ((this.mode.dir + 1) % 4) as Dir };
      audio.play('tap', 1.2);
      this.ui.onMode();
    } else if (this.mode.kind === 'move') {
      this.mode = { ...this.mode, dir: ((this.mode.dir + 1) % 4) as Dir };
      audio.play('tap', 1.2);
    }
  }

  select(id: number | null, sound = true): void {
    if (this.selected === id) { this.ui.onSelect(); return; }
    this.selected = id;
    if (id !== null) {
      if (sound) audio.play('select');
      // the camera stays where the player put it: selecting never pans the view
    }
    this.ui.onSelect();
  }

  /** Every reach on the ground (cashiers, bars, stages) while placing or selecting. */
  private lensRanges(): RangeArea[] {
    const out: RangeArea[] = [];
    for (const b of this.s.buildings.values()) {
      const def = BUILDINGS[b.type];
      const color = LENS_COLORS[def.kind];
      if (color === undefined || !def.radius) continue;
      out.push({ x: b.x, y: b.y, r: def.radius, size: def.size, color });
    }
    return out;
  }

  toggleObserve(): void {
    this.observe = !this.observe;
    document.body.classList.toggle('observe', this.observe);
    if (this.observe) { this.setMode({ kind: 'play' }); this.select(null, false); this.ui.closeAll(); }
    audio.play(this.observe ? 'open' : 'close');
    this.lastInteraction = performance.now();
  }

  // ───────────────────────── actions with feedback ─────────────────────────

  fail(reason?: string): void {
    audio.play('error');
    if (reason) this.ui.hint(reason, true);
    haptic(20, this.settings.haptics);
  }

  markDirty(): void {
    this.dirty = true;
    this.ui.dirty();
  }

  tryPlace(type: string, x: number, y: number, dir: Dir, sx?: number, sy?: number): void {
    const r = A.place(this.s, type, x, y, dir);
    if (r.ok) {
      audio.play('place');
      haptic(14, this.settings.haptics);
      this.view.burst('dust', x, y, this.settings.reduced ? 4 : 12, 30);
      this.markDirty();
      if (this.s.chips < BUILDINGS[type].cost || BUILDINGS[type].kind === 'wonder' || (BUILDINGS[type].gems ?? 0) > this.s.gems || BUILDINGS[type].kind === 'table') this.setMode({ kind: 'play' });
      void sx; void sy;
    } else this.fail(r.reason);
    this.ui.refreshAll();
  }

  tryExpand(land: string, x: number, y: number, _sx?: number, _sy?: number): void {
    const r = A.expand(this.s, land, x, y);
    if (r.ok) {
      audio.play('expand');
      haptic([10, 30, 10], this.settings.haptics);
      this.view.burst('dust', x, y, this.settings.reduced ? 4 : 14, 40);
      this.view.burst('pop', x, y, 4, 30);
      this.markDirty();
    } else this.fail(r.reason);
    this.ui.refreshAll();
  }

  tryRemove(x: number, y: number): void {
    const b = buildingAt(this.s, x, y);
    if (!b) return;
    const r = A.remove(this.s, b.id);
    if (r.ok) {
      audio.play('remove');
      haptic(10, this.settings.haptics);
      this.view.burst('dust', x, y, 10, 30);
      this.markDirty();
    } else this.fail(r.reason);
    this.ui.refreshAll();
  }

  tryMove(id: number, x: number, y: number, dir: Dir): void {
    const r = A.move(this.s, id, x, y, dir);
    if (r.ok) {
      audio.play('place');
      this.view.burst('dust', x, y, 10, 30);
      this.setMode({ kind: 'play' });
      this.select(id, false);
      this.markDirty();
    } else this.fail(r.reason);
  }

  act(fn: () => A.Result, okSound: Parameters<typeof audio.play>[0] = 'tap', silentFail = false): A.Result {
    const r = fn();
    if (r.ok) { audio.play(okSound); haptic(6, this.settings.haptics); this.markDirty(); }
    else if (!silentFail) this.fail(r.reason);
    this.ui.refreshAll();
    return r;
  }

  // ───────────────────────── painting (conveyor lines, land, removal) ─────────────────────────

  private paintStart(sx: number, sy: number): void {
    const [x, y] = this.view.screenToTile(sx, sy);
    this.paint = { sx: x, sy: y, cells: [] };
    this.paintMove(sx, sy);
  }

  private paintMove(sx: number, sy: number): void {
    if (!this.paint) return;
    const [ex, ey] = this.view.screenToTile(sx, sy);
    this.paint.cells = this.pathCells(this.paint.sx, this.paint.sy, ex, ey);
  }

  private paintEnd(cancelled: boolean): void {
    const p = this.paint;
    this.paint = null;
    if (!p || cancelled) return;
    const m = this.mode;
    if (m.kind === 'build') {
      const n = A.placeLine(this.s, m.type, p.cells.map((c) => ({ x: c.x, y: c.y, dir: c.dir as Dir })));
      if (n) { audio.play('place'); haptic(14, this.settings.haptics); for (const c of p.cells) this.view.burst('dust', c.x, c.y, 2, 20); this.markDirty(); }
      else if (this.s.chips < BUILDINGS[m.type].cost) this.fail('Not enough chips.');
      if (p.cells.length) this.mode = { ...m, dir: p.cells[p.cells.length - 1].dir as Dir };
    } else if (m.kind === 'land') {
      let n = 0;
      for (const c of p.cells) if (A.expand(this.s, m.land, c.x, c.y).ok) { n++; this.view.burst('dust', c.x, c.y, 6, 30); }
      if (n) { audio.play('expand'); haptic([10, 30, 10], this.settings.haptics); this.markDirty(); }
      else this.fail(A.canExpand(this.s, m.land, p.cells[0]?.x ?? 0, p.cells[0]?.y ?? 0).reason);
    } else if (m.kind === 'remove') {
      let n = 0;
      for (const c of p.cells) { const b = buildingAt(this.s, c.x, c.y); if (b && A.remove(this.s, b.id).ok) n++; }
      if (n) { audio.play('remove'); this.markDirty(); }
    }
    this.ui.refreshAll();
  }

  /** L-shaped path (x first, then y); each cell points at the next. */
  pathCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; dir: number; ok: boolean }[] {
    const pts: [number, number][] = [];
    const sxn = Math.sign(x1 - x0), syn = Math.sign(y1 - y0);
    let x = x0, y = y0;
    pts.push([x, y]);
    while (x !== x1) { x += sxn; pts.push([x, y]); }
    while (y !== y1) { y += syn; pts.push([x, y]); }
    const m = this.mode;
    const cells = pts.map(([px, py], i) => {
      let dir = m.kind === 'build' ? m.dir : 0;
      const nx = pts[i + 1] ?? null;
      const pv = pts[i - 1] ?? null;
      const d = nx ? [nx[0] - px, nx[1] - py] : pv ? [px - pv[0], py - pv[1]] : null;
      if (d) dir = d[0] === 1 ? 0 : d[1] === 1 ? 1 : d[0] === -1 ? 2 : 3;
      return { x: px, y: py, dir, ok: true };
    });
    // validity preview (sequential for land so each new plot can enable the next)
    if (m.kind === 'build') {
      const def = BUILDINGS[m.type];
      let budget = def.cost > 0 ? Math.floor(this.s.chips / def.cost) : Infinity;
      for (const c of cells) {
        const ex = buildingAt(this.s, c.x, c.y);
        if (ex && ex.type === m.type) { c.ok = true; continue; }
        c.ok = budget > 0 && A.canPlace(this.s, m.type, c.x, c.y, undefined, false).ok;
        if (c.ok) budget--;
      }
    } else if (m.kind === 'land') {
      const added = new Set<number>();
      let tiles = this.s.tiles.size;
      let chips = this.s.chips;
      for (const c of cells) {
        const t = tileAt(this.s, c.x, c.y);
        let ok: boolean;
        if (LAND[m.land].mode === 'new') {
          let adj = false;
          for (let d = 0; d < 4; d++) { const k = key(c.x + DX[d], c.y + DY[d]); if (this.s.tiles.has(k) || added.has(k)) adj = true; }
          ok = !t && !added.has(key(c.x, c.y)) && adj;
        } else ok = A.canExpand(this.s, m.land, c.x, c.y, false).ok;
        const cost = landCost(m.land, tiles);
        c.ok = ok && chips >= cost;
        if (c.ok) {
          chips -= cost;
          if (LAND[m.land].mode === 'new') { added.add(key(c.x, c.y)); tiles++; }
        }
      }
    } else if (m.kind === 'remove') {
      for (const c of cells) { const b = buildingAt(this.s, c.x, c.y); c.ok = !!b && BUILDINGS[b.type].removable !== false; }
    }
    return cells;
  }

  private ghost(): Ghost | null {
    const m = this.mode;
    if (m.kind === 'play') return null;
    if (this.paint) {
      const type = m.kind === 'build' ? m.type : m.kind === 'land' ? 'land:' + m.land : 'remove';
      return { type, cells: this.paint.cells };
    }
    const at = this.hover ?? this.press;
    if (!at) return null;
    const [x, y] = at;
    if (m.kind === 'build') return { type: m.type, cells: [{ x, y, dir: m.dir, ok: A.canPlace(this.s, m.type, x, y).ok }] };
    if (m.kind === 'land') return { type: 'land:' + m.land, cells: [{ x, y, dir: 0, ok: A.canExpand(this.s, m.land, x, y).ok }] };
    if (m.kind === 'remove') { const b = buildingAt(this.s, x, y); return { type: 'remove', cells: b ? [{ x: b.x, y: b.y, dir: 0, ok: BUILDINGS[b.type].removable !== false }] : [] }; }
    if (m.kind === 'move') {
      const b = this.s.buildings.get(m.id);
      if (!b) return null;
      return { type: b.type, cells: [{ x, y, dir: m.dir, ok: A.canPlace(this.s, b.type, x, y, b).ok }] };
    }
    return null;
  }

  private landSpots(): [number, number][] {
    const m = this.mode;
    if (m.kind !== 'land' || LAND[m.land].mode !== 'new') return [];
    const out: [number, number][] = [];
    const seen = new Set<number>();
    for (const t of this.s.tiles.values()) for (let d = 0; d < 4; d++) {
      const x = t.x + DX[d], y = t.y + DY[d];
      const k = key(x, y);
      if (seen.has(k) || this.s.tiles.has(k)) continue;
      seen.add(k);
      out.push([x, y]);
    }
    return out;
  }

  private rangeOverlay(): { x: number; y: number; r: number; size: number } | null {
    const id = this.selected ?? (this.mode.kind === 'build' ? null : null);
    let type: string | null = null, x = 0, y = 0, level = 1;
    if (id !== null) { const b = this.s.buildings.get(id); if (b) { type = b.type; x = b.x; y = b.y; level = b.level; } }
    else if (this.mode.kind === 'build' && (this.hover ?? this.press)) { type = this.mode.type; [x, y] = (this.hover ?? this.press)!; }
    if (!type) return null;
    void level;
    const r = BUILDINGS[type].radius;
    return r ? { x, y, r, size: BUILDINGS[type].size } : null;
  }

  // ───────────────────────── persistence ─────────────────────────

  private viewState() {
    return { x: this.view.cam.tx, y: this.view.cam.ty, zoom: this.view.cam.tzoom };
  }

  async save(): Promise<boolean> {
    if (!this.s) return false;
    this.saveTimer = 0;
    this.dirty = false;
    this.s.savedAt = Date.now();
    const data = serialize(this.s, this.viewState());
    const ok = await store.put('save', data);
    if (this.backupTimer > 300) {
      this.backupTimer = 0;
      const slot = ((await store.get<number>('backupSlot')) ?? 0) % 3;
      await store.put('backup' + slot, data);
      await store.put('backupSlot', slot + 1);
    }
    if (ok) this.ui?.saved();
    return ok;
  }

  private async load(): Promise<ReturnType<typeof deserialize> | null> {
    for (const k of ['save', 'backup2', 'backup1', 'backup0']) {
      const raw = await store.get<unknown>(k);
      if (!raw) continue;
      try {
        const r = deserialize(raw);
        if (k !== 'save') this.recovered = true;
        return r;
      } catch (e) {
        console.warn('Save slot unreadable:', k, e);
      }
    }
    return null;
  }

  exportSave(): string {
    this.s.savedAt = Date.now();
    return exportText(this.s, this.viewState());
  }

  importSave(text: string): A.Result {
    try {
      const { state, view } = importText(text);
      this.replaceWorld(state, view);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'That save could not be read: ' + (e as Error).message };
    }
  }

  async resetWorld(): Promise<void> {
    await store.put('backup-before-reset', serialize(this.s, this.viewState()));
    this.replaceWorld(createState((Math.random() * 2 ** 31) >>> 0));
    const [wx, wy] = tileCenter(0, 0);
    this.view.cam.jump(wx, wy - 10, this.defaultZoom());
  }

  replaceWorld(state: GameState, view?: { x: number; y: number; zoom: number }): void {
    this.s = state;
    rebuildCache(this.s);
    this.selected = null;
    this.mode = { kind: 'play' };
    this.view.forceTerrain();
    if (view) this.view.cam.jump(view.x, view.y, view.zoom);
    this.ui.reset();
    void this.save();
  }

  /** Deterministic time skip (tests and developer tools). */
  advance(seconds: number): void {
    const n = Math.round(seconds / TICK);
    for (let i = 0; i < n; i++) tick(this.s, TICK);
    this.consumeEvents();
  }

  devDemo(): void {
    this.replaceWorld(demoWorld(''));
  }
}

export async function boot(): Promise<void> {
  // register first: if an old cached version fails to start, the new worker still takes over
  registerSW();
  const g = new Game();
  await g.start();
}

function registerSW(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(() => undefined); });
  if (document.readyState === 'complete') void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

