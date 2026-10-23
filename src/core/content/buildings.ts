import { GAMES } from './games';

export type BuildingKind =
  | 'table'     // a casino game
  | 'well'      // the wishing well: tap for a few chips, it refills
  | 'tree'      // decorative tree (the island's first)
  | 'cashier'   // collects table tills nearby
  | 'bar'       // patrons nearby stay longer and tip
  | 'hotel'     // more guests arrive, some stay overnight
  | 'dock'      // edge only: airships bring high rollers
  | 'vault'     // deeper tills, longer offline earnings
  | 'stage'     // shows at night: glamour doubles nearby
  | 'decor'
  | 'wonder';

export type Floor = 'grass' | 'stone' | 'carpet' | 'marble' | 'gold';
export const PAVED: Floor[] = ['stone', 'carpet', 'marble', 'gold'];

export type BuildCategory = 'games' | 'services' | 'decor' | 'garden' | 'wonder';

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  kind: BuildingKind;
  category: BuildCategory;
  size: number;
  /** Cost in chips. */
  cost: number;
  /** Extra cost in gems (rare buildings). */
  gems?: number;
  floors?: Floor[];
  edge?: boolean;
  rotatable?: boolean;
  draggable?: boolean;
  removable?: boolean;
  /** Renown level needed. */
  level: number;
  /** Glamour it adds to the island (attracts patrons). */
  glamour?: number;
  /** Reach in tiles (cashier, bar, stage). */
  radius?: number;
}

const ANY: Floor[] | undefined = undefined;

const B: BuildingDef[] = [
  // ── fixtures ──
  { id: 'well', name: 'Wishing Well', desc: 'Tap to fish out the coins visitors toss in. It refills over time.', kind: 'well', category: 'services', size: 1, cost: 0, level: 99, removable: false, glamour: 2 },
  { id: 'tree', name: 'Old Oak', desc: 'Shade for the queue.', kind: 'tree', category: 'garden', size: 1, cost: 40, floors: ['grass'], level: 1, glamour: 2 },

  // ── services ──
  { id: 'cashier', name: 'Cashier Cage', desc: 'Collects the tills of tables within reach on its own. Also pays out your comps.', kind: 'cashier', category: 'services', size: 1, cost: 2500, level: 6, radius: 3, glamour: 1 },
  { id: 'bar', name: 'Sky Bar', desc: 'Patrons at tables within reach stay half again as long and tip 10%.', kind: 'bar', category: 'services', size: 1, cost: 6000, level: 8, radius: 2, glamour: 6 },
  { id: 'hotel', name: 'Cloud Hotel', desc: 'Guests arrive 25% faster, and at night they stay twice as long.', kind: 'hotel', category: 'services', size: 1, cost: 60000, level: 10, glamour: 8 },
  { id: 'dock', name: 'Airship Dock', desc: 'High rollers fly in. Each sits at your best table and plays for six times the stakes. Must touch the edge.', kind: 'dock', category: 'services', size: 1, cost: 250000, level: 12, edge: true, glamour: 10 },
  { id: 'vault', name: 'Gold Vault', desc: 'Every till holds twice as much, and the casino earns two more hours while you are away.', kind: 'vault', category: 'services', size: 1, cost: 400000, level: 14, floors: ['stone', 'carpet', 'marble', 'gold'], glamour: 4 },
  { id: 'stage', name: 'Show Stage', desc: 'At night the show doubles the glamour of everything within reach.', kind: 'stage', category: 'services', size: 1, cost: 1500000, level: 16, radius: 3, glamour: 20 },

  // ── decor: garden (grass) ──
  { id: 'hedge', name: 'Hedge', desc: 'A trimmed leafy block.', kind: 'decor', category: 'garden', size: 1, cost: 15, floors: ['grass'], level: 1, glamour: 1, draggable: true },
  { id: 'flower_bed', name: 'Flower Bed', desc: 'A wooden box of wildflowers.', kind: 'decor', category: 'garden', size: 1, cost: 30, floors: ['grass'], level: 2, glamour: 2 },
  { id: 'palm', name: 'Palm Planter', desc: 'A little holiday in a pot.', kind: 'decor', category: 'garden', size: 1, cost: 120, level: 4, glamour: 3 },
  { id: 'bench', name: 'Bench', desc: 'Somewhere to count your winnings.', kind: 'decor', category: 'garden', size: 1, cost: 60, level: 3, glamour: 2, rotatable: true },
  { id: 'lamp_post', name: 'Lamp Post', desc: 'An iron lamp. Glows at night.', kind: 'decor', category: 'garden', size: 1, cost: 300, level: 5, glamour: 4 },
  { id: 'fountain', name: 'Fountain', desc: 'Clear water, endlessly falling.', kind: 'decor', category: 'garden', size: 1, cost: 4000, level: 9, glamour: 14 },
  { id: 'gazebo', name: 'Gazebo', desc: 'A shaded pavilion.', kind: 'decor', category: 'garden', size: 1, cost: 9000, level: 11, glamour: 16, floors: ['grass'] },
  { id: 'statue', name: 'Skystone Statue', desc: 'A lucky wanderer looking out at the haze.', kind: 'decor', category: 'garden', size: 1, cost: 40000, level: 15, glamour: 26 },
  { id: 'star_arch', name: 'Star Arch', desc: 'An arch with stars caught in it.', kind: 'decor', category: 'garden', size: 1, cost: 250000, level: 20, glamour: 40 },

  // ── decor: casino floor ──
  { id: 'velvet_rope', name: 'Velvet Rope', desc: 'Brass posts and a red rope. Drag to lay a line.', kind: 'decor', category: 'decor', size: 1, cost: 40, level: 2, glamour: 1, draggable: true, rotatable: true },
  { id: 'banner', name: 'Banner', desc: 'Your casino’s colours.', kind: 'decor', category: 'decor', size: 1, cost: 80, level: 3, glamour: 3 },
  { id: 'neon_sign', name: 'Neon Sign', desc: 'OPEN, in pink and gold. Glows at night.', kind: 'decor', category: 'decor', size: 1, cost: 700, level: 6, glamour: 6 },
  { id: 'chip_tower', name: 'Chip Tower', desc: 'A teetering monument to luck.', kind: 'decor', category: 'decor', size: 1, cost: 2500, level: 8, glamour: 9 },
  { id: 'dice_statue', name: 'Giant Dice', desc: 'Two marble dice, forever showing seven.', kind: 'decor', category: 'decor', size: 1, cost: 15000, level: 12, glamour: 18 },
  { id: 'crystal_lamp', name: 'Crystal Lamp', desc: 'An aether crystal on a marble stand.', kind: 'decor', category: 'decor', size: 1, cost: 60000, level: 16, glamour: 28 },
  { id: 'golden_cat', name: 'Lucky Cat', desc: 'A golden cat waving fortune in.', kind: 'decor', category: 'decor', size: 1, cost: 600000, level: 22, glamour: 55, gems: 5 },
  { id: 'monument', name: 'Ace Monument', desc: 'An ace of spades in gold and marble.', kind: 'decor', category: 'decor', size: 1, cost: 5000000, level: 26, glamour: 90, gems: 15 },

  // ── wonder ──
  { id: 'pokerforge', name: 'The Pokerforge', desc: 'A tower of fortune, built in three stages. Each stage raises everything. Finished, it opens the Legend ranks.', kind: 'wonder', category: 'wonder', size: 3, cost: 0, level: 27, floors: ['stone', 'carpet', 'marble', 'gold'], removable: false, glamour: 60 },
];

/** Paved floors only, except the humble coin stand and scratch kiosk. */
const ANYWHERE = new Set(['coin_stand', 'scratch_kiosk', 'slots']);
const TABLE_COST: Record<string, number> = {
  coin: 0, slots: 120, dice: 300, scratch: 600, blackjack: 1200, roulette: 2500, plinko: 5000, wheel: 10000,
  poker: 20000, mines: 40000, keno: 80000, crash: 160000, baccarat: 320000, derby: 650000, holdem: 1300000,
};
const BIG = new Set(['derby', 'holdem']);
for (const g of GAMES) {
  B.push({
    id: g.building, name: g.name, desc: g.tagline, kind: 'table', category: 'games', size: BIG.has(g.id) ? 2 : 1,
    cost: TABLE_COST[g.id], level: g.level, floors: ANYWHERE.has(g.building) ? ANY : ['stone', 'carpet', 'marble', 'gold'],
    glamour: 1 + Math.floor(g.level / 3), rotatable: !BIG.has(g.id),
  });
}

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(B.map((b) => [b.id, b]));
export const BUILDING_LIST = B;

/** Wishing well. */
export const WELL = { stock: 8, regrow: 4, perTap: [1, 3] as [number, number] };

/** The Pokerforge: three stages, paid in chips and gems; each adds a global bonus. */
export const WONDER_STAGES = [
  { chips: 10_000_000, gems: 15, bonus: 'Patron take +25%, bet limits +25%' },
  { chips: 40_000_000, gems: 30, bonus: 'Win profits +3%, XP +25%' },
  { chips: 150_000_000, gems: 60, bonus: 'Opens the Legend ranks' },
];
/** Legend rank n (after the wonder) costs this many chips; each gives +10% take and limits. */
export const legendCost = (n: number): number => Math.round(3e8 * 1.8 ** n);
