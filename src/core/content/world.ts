import type { Floor } from './buildings';

/** One in-game day, in seconds (night is the last 30%). */
export const DAY_LENGTH = 600;
export const START_CHIPS = 100;

export interface LandDef {
  id: string;
  name: string;
  desc: string;
  /** 'new' adds a tile beside the island; 'pave' changes an existing tile's floor. */
  mode: 'new' | 'pave';
  floor: Floor;
  level: number;
  /** Flat cost for paving; plots use plotCost. */
  cost: number;
}

export const LANDS: LandDef[] = [
  { id: 'plot', name: 'Grass Plot', desc: 'More island. Each plot costs more than the last.', mode: 'new', floor: 'grass', level: 1, cost: 0 },
  { id: 'stone', name: 'Cobble Paving', desc: 'Card tables need a paved floor.', mode: 'pave', floor: 'stone', level: 3, cost: 25 },
  { id: 'carpet', name: 'Velvet Carpet', desc: 'Tables on carpet take 10% more from patrons.', mode: 'pave', floor: 'carpet', level: 6, cost: 400 },
  { id: 'marble', name: 'Marble Floor', desc: 'Each marble tile adds 1 glamour.', mode: 'pave', floor: 'marble', level: 12, cost: 8000 },
  { id: 'gold', name: 'Gold Tile', desc: 'Tables on gold take 25% more from patrons; each tile adds 2 glamour.', mode: 'pave', floor: 'gold', level: 20, cost: 400000 },
  { id: 'grass', name: 'Re-turf', desc: 'Back to grass, for gardens.', mode: 'pave', floor: 'grass', level: 3, cost: 10 },
];
export const LAND: Record<string, LandDef> = Object.fromEntries(LANDS.map((l) => [l.id, l]));

/** Cost of the next grass plot when the island has `tiles` tiles. */
export function plotCost(tiles: number): number {
  const k = Math.max(0, tiles - 9);
  return Math.round(20 * 1.115 ** k + k * 4);
}

export function landCost(id: string, tiles: number): number {
  const l = LAND[id];
  return l.mode === 'new' ? plotCost(tiles) : l.cost;
}

/** Floor bonuses for patrons' take at a table standing on it. */
export const FLOOR_TAKE: Record<Floor, number> = { grass: 1, stone: 1, carpet: 1.1, marble: 1.1, gold: 1.25 };
export const FLOOR_GLAMOUR: Record<Floor, number> = { grass: 0, stone: 0, carpet: 0, marble: 1, gold: 2 };

/** Patrons. */
export const PATRON = {
  /** Seconds between arrivals with no glamour. */
  arrive: 24,
  /** Stay at a table, seconds. */
  stayMin: 70,
  stayMax: 160,
  /** Glamour that halves the arrival interval. */
  glamourHalf: 40,
  /** Till capacity in minutes of one full table's take. */
  tillMinutes: 8,
  walk: 1.6,
};

/** Offline earnings: hours of patron take kept (at reduced efficiency). */
export const OFFLINE = { hours: 4, vaultHours: 2, efficiency: 0.5 };

/** Comps: share of every wager credited as comp points (cashable at a cashier, or the well). */
export const COMP_RATE = 0.01;

/** Renown: XP to go from level L to L+1. */
export function xpForLevel(level: number): number {
  // the mid game stretches a little: from renown 12 each level asks a bit more than the curve
  return Math.round(60 * 1.6 ** (level - 1) * (1 + Math.max(0, level - 12) * 0.12));
}

/** The level-up chip gift (a small purse that keeps early play going). */
export function levelGift(level: number): number {
  return Math.round(25 * 1.42 ** (level - 1));
}
