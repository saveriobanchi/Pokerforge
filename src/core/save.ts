import { BUILDINGS } from './content/buildings';
import { type GameState, SAVE_VERSION, type Tile, createState, emptyCache, emptyStats, key, newBuilding } from './state';

/**
 * Versioned JSON saves. Maps and sets become arrays; transient fields are
 * rebuilt on load. Unknown buildings are dropped rather than crashing.
 */
export interface ViewState { x: number; y: number; zoom: number }

export function serialize(s: GameState, view?: ViewState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    seed: s.seed, rng: s.rng, time: s.time,
    tiles: [...s.tiles.values()].map((t) => [t.x, t.y, t.floor]),
    buildings: [...s.buildings.values()],
    nextId: s.nextId,
    chips: s.chips, gems: s.gems, comps: s.comps, jackpot: s.jackpot,
    stats: s.stats,
    renown: s.renown,
    tokens: s.tokens,
    codex: s.codex,
    achieved: [...s.achieved.entries()],
    goals: [...s.goals],
    seen: [...s.seen],
    flags: [...s.flags],
    patrons: s.patrons,
    patronTimer: s.patronTimer, vipTimer: s.vipTimer,
    wonder: s.wonder,
    rounds: s.rounds,
    boosts: s.boosts,
    pursedDay: s.pursedDay,
    savedAt: s.savedAt,
    view,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export function deserialize(input: unknown): { state: GameState; view?: ViewState } {
  const d: Raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (!d || typeof d !== 'object' || !Array.isArray(d.tiles)) throw new Error('not a Pokerforge save');
  if (d.version > SAVE_VERSION) throw new Error('save is from a newer version');
  const s = createState(d.seed ?? 1);
  s.tiles = new Map();
  s.buildings = new Map();
  s.occ = new Map();
  for (const [x, y, floor] of d.tiles as [number, number, Tile['floor']][]) {
    s.tiles.set(key(x, y), { x, y, floor: (['grass', 'stone', 'carpet', 'marble', 'gold'] as string[]).includes(floor) ? floor : 'grass', seed: 0 });
  }
  for (const t of s.tiles.values()) t.seed = ((t.x * 374761393 + t.y * 668265263) >>> 0);
  for (const raw of d.buildings as Raw[]) {
    if (!BUILDINGS[raw.type]) continue;
    const b = Object.assign(newBuilding(raw.id, raw.type, raw.x, raw.y, raw.dir ?? 0), raw);
    s.buildings.set(b.id, b);
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) s.occ.set(key(b.x + dx, b.y + dy), b.id);
  }
  s.rng = d.rng >>> 0;
  s.time = +d.time || 0;
  s.nextId = d.nextId ?? s.buildings.size + 100;
  s.chips = +d.chips || 0;
  s.gems = +d.gems || 0;
  s.comps = +d.comps || 0;
  s.jackpot = +d.jackpot || 500;
  s.stats = { ...emptyStats(), ...(d.stats ?? {}) };
  s.renown = { xp: 0, level: 1, points: 0, perks: {}, ...(d.renown ?? {}) };
  s.tokens = d.tokens ?? {};
  s.codex = d.codex ?? [];
  s.achieved = new Map(d.achieved ?? []);
  s.goals = new Set(d.goals ?? []);
  s.seen = new Set(d.seen ?? []);
  s.flags = new Set(d.flags ?? []);
  s.patrons = (d.patrons ?? []).filter((p: Raw) => s.buildings.has(p.table));
  s.patronTimer = d.patronTimer ?? 5;
  s.vipTimer = d.vipTimer ?? 120;
  s.wonder = { id: 0, stage: 0, legend: 0, ...(d.wonder ?? {}) };
  s.rounds = d.rounds ?? {};
  s.boosts = d.boosts ?? [];
  s.pursedDay = d.pursedDay ?? -1;
  s.savedAt = d.savedAt ?? 0;
  s.events = [];
  s.cache = emptyCache();
  s.tileRev = 1;
  return { state: s, view: d.view };
}

export function exportText(s: GameState, view?: ViewState): string {
  const json = serialize(s, view);
  return 'PF1:' + btoa(unescape(encodeURIComponent(json)));
}

export function importText(text: string): { state: GameState; view?: ViewState } {
  const t = text.trim();
  if (t.startsWith('PF1:')) return deserialize(decodeURIComponent(escape(atob(t.slice(4)))));
  return deserialize(t);
}
