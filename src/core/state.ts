import { BUILDINGS, type Floor } from './content/buildings';
import type { GameId } from './content/games';
import { DAY_LENGTH, START_CHIPS } from './content/world';
import { step } from './rng';

export type Dir = 0 | 1 | 2 | 3; // 0:+x 1:+y 2:-x 3:-y
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export const SAVE_VERSION = 1;

export type Status = 'idle' | 'busy' | 'full' | 'ready';

export interface Tile {
  x: number;
  y: number;
  floor: Floor;
  /** Deterministic per-tile seed for decoration variety. */
  seed: number;
}

export interface Building {
  id: number;
  type: string;
  x: number;
  y: number;
  dir: Dir;
  level: number;
  /** House take waiting to be collected (tables). */
  till: number;
  /** Wishing well stock. */
  stock: number;
  timer: number;
  status: Status;
  /** Visual pulse counter: increments when something happens at it. */
  cycles: number;
}

export interface Patron {
  id: number;
  /** Tile-space position (fractional) and previous tick's, for interpolation. */
  x: number;
  y: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  table: number;
  seat: number;
  phase: 'walk' | 'play' | 'leave';
  /** Seconds left playing. */
  t: number;
  look: number;
  vip: boolean;
  /** Fades in on arrival and out on leaving (0..1). */
  fade: number;
}

export type SimEvent =
  | { type: 'levelup'; level: number; gift: number }
  | { type: 'achievement'; id: string }
  | { type: 'goal'; id: string }
  | { type: 'token'; id: string; dup: boolean }
  | { type: 'codex'; set: string }
  | { type: 'jackpot'; amount: number }
  | { type: 'bigwin'; game: GameId; mult: number; amount: number }
  | { type: 'mastery'; game: GameId; star: number }
  | { type: 'take'; id: number; amount: number }
  | { type: 'collect'; id: number; amount: number }
  | { type: 'vip'; id: number }
  | { type: 'wonder'; stage: number }
  | { type: 'legend'; rank: number }
  | { type: 'second'; amount: number }
  | { type: 'glamour'; milestone: number };

export interface Stats {
  wagered: number;
  returned: number;
  plays: number;
  wins: number;
  biggestWin: number;
  biggestMult: number;
  playsBy: Partial<Record<GameId, number>>;
  wageredBy: Partial<Record<GameId, number>>;
  netBy: Partial<Record<GameId, number>>;
  winsBy: Partial<Record<GameId, number>>;
  bestBy: Partial<Record<GameId, number>>;
  houseTake: number;
  wellTaps: number;
  jackpots: number;
  tokens: number;
  built: number;
  playSeconds: number;
  maxChips: number;
  patrons: number;
  vips: number;
  /** Named feats for achievements (royal flush, blackjack, …). */
  feats: Record<string, number>;
}

export interface Renown {
  xp: number;
  level: number;
  points: number;
  perks: Record<string, number>;
}

export interface Boost {
  id: string;
  /** Sim time when it ends (timed boosts). */
  until?: number;
  /** Bets left (counted boosts). */
  bets?: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  time: number;
  tiles: Map<number, Tile>;
  buildings: Map<number, Building>;
  occ: Map<number, number>;
  nextId: number;
  chips: number;
  gems: number;
  comps: number;
  jackpot: number;
  stats: Stats;
  renown: Renown;
  tokens: Record<string, number>;
  codex: string[];
  achieved: Map<string, number>;
  goals: Set<string>;
  /** Buildings, games and lands the player has been shown (for "new" dots). */
  seen: Set<string>;
  flags: Set<string>;
  patrons: Patron[];
  patronTimer: number;
  vipTimer: number;
  wonder: { id: number; stage: number; legend: number };
  /** In-progress rounds per game (survive a reload). */
  rounds: Partial<Record<GameId, unknown>>;
  boosts: Boost[];
  /** Day index of the last broke-purse from the well. */
  pursedDay: number;
  savedAt: number;
  // transient
  tileRev: number;
  events: SimEvent[];
  cache: SimCache;
}

export interface SimCache {
  glamour: number;
  seats: number;
  edge: Set<number>;
  dirty: boolean;
  /** Per table: chips per seated patron per minute, and till capacity (refreshed each second). */
  take: Map<number, number>;
  cap: Map<number, number>;
  /** Building types present on the island. */
  has: Set<string>;
  /** Patrons seated per table (refreshed each tick). */
  seated: Map<number, number>;
}

export function key(x: number, y: number): number {
  return (x + 2048) * 4096 + (y + 2048);
}
export function unkey(k: number): [number, number] {
  return [Math.floor(k / 4096) - 2048, (k % 4096) - 2048];
}

export function hashSeed(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function emptyStats(): Stats {
  return {
    wagered: 0, returned: 0, plays: 0, wins: 0, biggestWin: 0, biggestMult: 0, playsBy: {}, wageredBy: {}, netBy: {}, winsBy: {}, bestBy: {},
    houseTake: 0, wellTaps: 0, jackpots: 0, tokens: 0, built: 0, playSeconds: 0, maxChips: START_CHIPS, patrons: 0, vips: 0, feats: {},
  };
}

export function emptyCache(): SimCache {
  return { glamour: 0, seats: 0, edge: new Set(), dirty: true, take: new Map(), cap: new Map(), has: new Set(), seated: new Map() };
}

export function newBuilding(id: number, type: string, x: number, y: number, dir: Dir = 0): Building {
  return { id, type, x, y, dir, level: 1, till: 0, stock: 0, timer: 0, status: 'idle', cycles: 0 };
}

/** A fresh casino: a 3×3 scrap of grass with a wishing well, an oak and a coin stand. */
export function createState(seed = 1234567): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    rng: seed >>> 0,
    time: DAY_LENGTH * 0.12,
    tiles: new Map(),
    buildings: new Map(),
    occ: new Map(),
    nextId: 1,
    chips: START_CHIPS,
    gems: 0,
    comps: 0,
    jackpot: 500,
    stats: emptyStats(),
    renown: { xp: 0, level: 1, points: 0, perks: {} },
    tokens: {},
    codex: [],
    achieved: new Map(),
    goals: new Set(),
    seen: new Set(),
    flags: new Set(),
    patrons: [],
    patronTimer: 8,
    vipTimer: 120,
    wonder: { id: 0, stage: 0, legend: 0 },
    rounds: {},
    boosts: [],
    pursedDay: -1,
    savedAt: 0,
    tileRev: 0,
    events: [],
    cache: emptyCache(),
  };
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) addTile(s, x, y, 'grass');
  const well = addBuilding(s, 'well', 0, 0, 0);
  well.stock = 8;
  addBuilding(s, 'tree', -1, -1, 0);
  addBuilding(s, 'coin_stand', 1, 0, 1);
  return s;
}

export function addTile(s: GameState, x: number, y: number, floor: Floor): Tile {
  const t: Tile = { x, y, floor, seed: hashSeed(x, y) };
  s.tiles.set(key(x, y), t);
  s.tileRev++;
  s.cache.dirty = true;
  return t;
}

export function addBuilding(s: GameState, type: string, x: number, y: number, dir: Dir): Building {
  const b = newBuilding(s.nextId++, type, x, y, dir);
  const size = BUILDINGS[type].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) s.occ.set(key(x + dx, y + dy), b.id);
  s.buildings.set(b.id, b);
  s.cache.dirty = true;
  return b;
}

export function removeBuildingRaw(s: GameState, b: Building): void {
  const size = BUILDINGS[b.type].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) s.occ.delete(key(b.x + dx, b.y + dy));
  s.buildings.delete(b.id);
  s.cache.dirty = true;
}

export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  const id = s.occ.get(key(x, y));
  return id === undefined ? undefined : s.buildings.get(id);
}

export function tileAt(s: GameState, x: number, y: number): Tile | undefined {
  return s.tiles.get(key(x, y));
}

export function isEdgeTile(s: GameState, x: number, y: number): boolean {
  for (let d = 0; d < 4; d++) if (!s.tiles.has(key(x + DX[d], y + DY[d]))) return true;
  return false;
}

/** Next value from the world's seeded stream. */
export function rand(s: GameState): number {
  const [v, n] = step(s.rng);
  s.rng = n;
  return v;
}

/** A bound random source for game logic. */
export function rnd(s: GameState): () => number {
  return () => rand(s);
}

export function dayFraction(s: GameState): number {
  return (s.time % DAY_LENGTH) / DAY_LENGTH;
}

export function isNight(s: GameState): boolean {
  const f = dayFraction(s);
  return f > 0.7 || f < 0.04;
}

export function perkRank(s: GameState, id: string): number {
  return s.renown.perks[id] ?? 0;
}

export function boostOn(s: GameState, id: string): boolean {
  return s.boosts.some((b) => b.id === id && (b.until === undefined || b.until > s.time) && (b.bets === undefined || b.bets > 0));
}
