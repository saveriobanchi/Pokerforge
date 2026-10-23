import { BUILDINGS, WELL } from './content/buildings';
import { GAME, type GameId, levelTakeMult } from './content/games';
import { addXp, gameOfType, hasSet, hotGame, weatherNow } from './economy';
import { seasonFor } from './content/seasons';
import { FLOOR_GLAMOUR, FLOOR_TAKE, PATRON } from './content/world';
import { checkProgress } from './progress';
import { type Building, type GameState, type Patron, DX, DY, isEdgeTile, isNight, key, perkRank, rand, tileAt, unkey } from './state';

export const TICK = 0.05;

// ───────────────────────── cache ─────────────────────────

export function rebuildCache(s: GameState): void {
  const c = s.cache;
  c.edge = new Set();
  for (const t of s.tiles.values()) if (isEdgeTile(s, t.x, t.y)) c.edge.add(key(t.x, t.y));
  c.seats = 0;
  c.has = new Set();
  for (const b of s.buildings.values()) { c.has.add(b.type); const g = gameOfType(b.type); if (g) c.seats += GAME[g].seats; }
  c.glamour = glamourOf(s);
  c.dirty = false;
  refreshTables(s);
}

/** Per-table take and till capacity: they change slowly, so they are cached for a second. */
export function refreshTables(s: GameState): void {
  const c = s.cache;
  c.take.clear();
  c.cap.clear();
  for (const b of s.buildings.values()) {
    if (!gameOfType(b.type)) continue;
    c.take.set(b.id, seatTake(s, b));
    c.cap.set(b.id, tillCap(s, b));
  }
}

/** The island's glamour: decor, fine floors, and shows at night. */
export function glamourOf(s: GameState): number {
  let g = 0;
  const night = isNight(s);
  const stages = [...s.buildings.values()].filter((b) => b.type === 'stage');
  for (const b of s.buildings.values()) {
    let v = BUILDINGS[b.type].glamour ?? 0;
    if (night && stages.some((st) => st !== b && Math.abs(st.x - b.x) <= 3 && Math.abs(st.y - b.y) <= 3)) v *= 2;
    g += v;
  }
  for (const t of s.tiles.values()) g += FLOOR_GLAMOUR[t.floor];
  if (s.wonder.stage > 0) g += s.wonder.stage * 30;
  return g;
}

// ───────────────────────── patrons ─────────────────────────

/** Seconds between patron arrivals. */
export function arrivalInterval(s: GameState): number {
  let k = 1 + s.cache.glamour / PATRON.glamourHalf;
  k *= 1 + perkRank(s, 'lights') * 0.12;
  k *= weatherNow(s).arrivals * seasonFor(s.time).arrivals;
  if (s.cache.has.has('hotel')) k *= 1.25;
  if (s.boosts.some((b) => b.id === 'crowd' && (b.until ?? 0) > s.time)) k *= 2;
  return PATRON.arrive / k;
}

const hasBuilding = (s: GameState, type: string) => s.cache.has.has(type);

/** Chips per minute one seated patron brings a table. */
export function seatTake(s: GameState, b: Building): number {
  const g = gameOfType(b.type);
  if (!g) return 0;
  let v = GAME[g].patron * levelTakeMult(b.level);
  v *= 1 + perkRank(s, 'host') * 0.15;
  v *= FLOOR_TAKE[tileAt(s, b.x, b.y)?.floor ?? 'grass'];
  if (hasSet(s, 'night')) v *= 1.2;
  if (s.wonder.stage >= 1) v *= 1.25;
  v *= 1 + s.wonder.legend * 0.1 + perkRank(s, 'fortune') * 0.005;
  v *= seasonFor(s.time).take;
  if (hotGame(s) === g) v *= 1.5;
  if (nearType(s, b, 'bar', 2)) v *= 1.1;
  return v;
}

export function tillCap(s: GameState, b: Building): number {
  const g = gameOfType(b.type);
  if (!g) return 0;
  const base = GAME[g].patron * levelTakeMult(b.level) * GAME[g].seats * PATRON.tillMinutes;
  return Math.round(Math.max(20, base * (1 + perkRank(s, 'tills') * 0.5) * (hasBuilding(s, 'vault') ? 2 : 1)));
}

export function nearType(s: GameState, b: Building, type: string, r: number): Building | undefined {
  for (const o of s.buildings.values()) if (o.type === type && Math.abs(o.x - b.x) <= r && Math.abs(o.y - b.y) <= r) return o;
  return undefined;
}

/** Seat spots on a table's tile (tile-local), front first. */
const SEATS: [number, number][] = [[0.5, 1.02], [1.02, 0.5], [0.12, 0.98], [0.98, 0.12]];

function seatPos(b: Building, seat: number): [number, number] {
  const size = BUILDINGS[b.type].size;
  const [sx, sy] = SEATS[seat % SEATS.length];
  return [b.x + sx * size - 0.5, b.y + sy * size - 0.5];
}

function seatedAt(s: GameState, id: number): number {
  return s.cache.seated.get(id) ?? 0;
}

function countSeats(s: GameState): void {
  const m = s.cache.seated;
  m.clear();
  for (const p of s.patrons) if (!p.vip && p.phase !== 'leave') m.set(p.table, (m.get(p.table) ?? 0) + 1);
}

const capOf = (s: GameState, b: Building) => s.cache.cap.get(b.id) ?? tillCap(s, b);
const takeOf = (s: GameState, b: Building) => s.cache.take.get(b.id) ?? seatTake(s, b);

function spawnPoint(s: GameState): [number, number] {
  const dock = [...s.buildings.values()].find((b) => b.type === 'dock');
  if (dock) return [dock.x, dock.y];
  const edges = [...s.cache.edge];
  if (!edges.length) return [0, 0];
  const [x, y] = unkey(edges[Math.floor(rand(s) * edges.length)]);
  // step just off the island so they walk in
  for (let d = 0; d < 4; d++) if (!s.tiles.has(key(x + DX[d], y + DY[d]))) return [x + DX[d] * 0.6, y + DY[d] * 0.6];
  return [x, y];
}

function addPatron(s: GameState, table: Building, vip: boolean): void {
  const seat = vip ? 0 : seatedAt(s, table.id);
  if (!vip) s.cache.seated.set(table.id, seat + 1);
  const [sx, sy] = spawnPoint(s);
  const [tx, ty] = seatPos(table, vip ? 3 : seat);
  const stay = (PATRON.stayMin + rand(s) * (PATRON.stayMax - PATRON.stayMin)) * weatherNow(s).stay * (nearType(s, table, 'bar', 2) ? 1.5 : 1) * (vip ? 1.5 : 1);
  const p: Patron = { id: s.nextId++, x: sx, y: sy, px: sx, py: sy, tx, ty, table: table.id, seat, phase: 'walk', t: stay, look: Math.floor(rand(s) * 8), vip, fade: 0 };
  s.patrons.push(p);
  s.stats.patrons++;
  if (vip) { s.stats.vips++; s.events.push({ type: 'vip', id: table.id }); }
}

/** A table with a free seat, favouring richer games a little. */
function pickTable(s: GameState): Building | null {
  const free: { b: Building; w: number }[] = [];
  for (const b of s.buildings.values()) {
    const g = gameOfType(b.type);
    if (!g) continue;
    const open = GAME[g].seats - seatedAt(s, b.id);
    if (open > 0) free.push({ b, w: open * (1 + Math.log10(1 + GAME[g].patron)) * (b.till >= capOf(s, b) ? 0.2 : 1) });
  }
  if (!free.length) return null;
  const tot = free.reduce((a, f) => a + f.w, 0);
  let u = rand(s) * tot;
  for (const f of free) { if (u < f.w) return f.b; u -= f.w; }
  return free[free.length - 1].b;
}

function bestTable(s: GameState): Building | null {
  let best: Building | null = null, v = -1;
  for (const b of s.buildings.values()) { const t = s.cache.take.get(b.id) ?? 0; if (t > v) { v = t; best = b; } }
  return v > 0 ? best : null;
}

function tickPatrons(s: GameState, dt: number): void {
  countSeats(s);
  if (s.cache.seats > 0) {
    s.patronTimer -= dt;
    if (s.patronTimer <= 0) {
      s.patronTimer = arrivalInterval(s) * (0.6 + rand(s) * 0.8);
      const t = pickTable(s);
      if (t) addPatron(s, t, false);
    }
  }
  if (hasBuilding(s, 'dock')) {
    s.vipTimer -= dt;
    if (s.vipTimer <= 0) {
      s.vipTimer = 150 + rand(s) * 90;
      const t = bestTable(s);
      if (t && !s.patrons.some((p) => p.vip)) addPatron(s, t, true);
    }
  }
  const night = isNight(s);
  const hotel = night && hasBuilding(s, 'hotel');
  for (const p of s.patrons) {
    p.px = p.x; p.py = p.y;
    const table = s.buildings.get(p.table);
    if (!table && p.phase !== 'leave') { leave(s, p); continue; }
    if (p.phase === 'walk' || p.phase === 'leave') {
      p.fade = Math.min(1, p.fade + dt * 2);
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      const stepLen = PATRON.walk * dt;
      if (d <= stepLen) {
        p.x = p.tx; p.y = p.ty;
        if (p.phase === 'walk') p.phase = 'play';
        else p.t = -1;
      } else { p.x += (dx / d) * stepLen; p.y += (dy / d) * stepLen; }
    } else if (p.phase === 'play' && table) {
      // hotel guests keep playing through the night
      p.t -= hotel ? dt * 0.5 : dt;
      const cap = capOf(s, table);
      const take = (takeOf(s, table) / 60) * dt * (p.vip ? 6 : 1);
      if (table.till < cap) {
        const add = Math.min(take, cap - table.till);
        table.till += add;
        s.stats.houseTake += add;
        s.renown.xp += add * 0.1; // the house earns a little renown too (levels resolve on the next wager or tick)
      }
      if (p.t <= 0) leave(s, p);
    }
  }
  s.patrons = s.patrons.filter((p) => !(p.phase === 'leave' && p.t < 0));
}

function leave(s: GameState, p: Patron): void {
  p.phase = 'leave';
  p.t = 1;
  const edges = [...s.cache.edge];
  const [ex, ey] = edges.length ? unkey(edges[Math.floor(rand(s) * edges.length)]) : [0, 0];
  // walk off the nearest open side of that edge tile
  let ox = ex, oy = ey;
  for (let d = 0; d < 4; d++) if (!s.tiles.has(key(ex + DX[d], ey + DY[d]))) { ox = ex + DX[d] * 0.7; oy = ey + DY[d] * 0.7; break; }
  p.tx = ox; p.ty = oy;
}

// ───────────────────────── tick ─────────────────────────

const crossed = (s: GameState, dt: number, every: number) => Math.floor(s.time / every) !== Math.floor((s.time - dt) / every);

export function tick(s: GameState, dt: number): void {
  s.time += dt;
  s.stats.playSeconds += dt;
  if (s.cache.dirty) rebuildCache(s);
  if (crossed(s, dt, 1)) refreshTables(s);
  tickPatrons(s, dt);
  // the well refills; tables show whether they are busy or full
  const statuses = crossed(s, dt, 0.25);
  const playing = new Set<number>();
  if (statuses) for (const p of s.patrons) if (p.phase === 'play') playing.add(p.table);
  for (const b of s.buildings.values()) {
    const kind = BUILDINGS[b.type].kind;
    if (kind === 'well') {
      const max = WELL.stock + perkRank(s, 'wellspring') * 4;
      if (b.stock < max) {
        b.timer += dt;
        if (b.timer >= WELL.regrow) { b.timer = 0; b.stock++; }
      } else b.timer = 0;
      b.status = b.stock > 0 ? 'ready' : 'idle';
    } else if (kind === 'table' && statuses) {
      b.status = b.till >= capOf(s, b) - 0.5 ? 'full' : playing.has(b.id) ? 'busy' : 'idle';
    }
  }
  // cashiers sweep the tills around them every few seconds
  if (crossed(s, dt, 3)) {
    for (const c of s.buildings.values()) {
      if (c.type !== 'cashier') continue;
      const r = BUILDINGS.cashier.radius ?? 3;
      for (const b of s.buildings.values()) {
        if (b.till < 1 || BUILDINGS[b.type].kind !== 'table') continue;
        if (Math.abs(b.x - c.x) > r || Math.abs(b.y - c.y) > r) continue;
        const n = Math.floor(b.till);
        b.till -= n;
        s.chips += n;
        c.cycles++;
        s.events.push({ type: 'take', id: b.id, amount: n });
      }
    }
    if (s.chips > s.stats.maxChips) s.stats.maxChips = s.chips;
  }
  if (crossed(s, dt, 0.5)) {
    // house renown levels up here too
    addXp(s, 0);
    s.cache.glamour = glamourOf(s);
    checkProgress(s);
  }
}

/** Collect a table's till by hand. */
export function collectTill(s: GameState, b: Building): number {
  const n = Math.floor(b.till);
  if (n <= 0) return 0;
  b.till -= n;
  s.chips += n;
  b.cycles++;
  if (s.chips > s.stats.maxChips) s.stats.maxChips = s.chips;
  s.events.push({ type: 'collect', id: b.id, amount: n });
  return n;
}

/** Expected chips per minute from patrons with every seat filled (for the info line). */
export function fullTakePerMin(s: GameState): number {
  let v = 0;
  for (const b of s.buildings.values()) { const g = gameOfType(b.type); if (g) v += takeOf(s, b) * GAME[g].seats; }
  return v;
}

export type { GameId };
