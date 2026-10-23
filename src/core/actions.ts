import { BUILDINGS, PAVED, WELL, WONDER_STAGES, legendCost } from './content/buildings';
import { LAND, landCost } from './content/world';
import { PERK, PERKS, FORTUNE_PERK } from './content/perks';
import { canUpgrade, feat, gameOfType, upgradeCost, type Result } from './economy';
import { collectTill } from './sim';
import { roundOpen } from './play';
import { type Building, type Dir, type GameState, DX, DY, addBuilding, addTile, buildingAt, dayFraction, isEdgeTile, key, perkRank, rand, removeBuildingRaw, tileAt } from './state';
import { dayIndex } from './content/weather';
import { levelGift } from './content/world';

export type { Result };
export const fmtChips = (n: number): string => Math.floor(n).toLocaleString('en-US');

// ───────────────────────── building ─────────────────────────

export function buildingUnlocked(s: GameState, type: string): boolean {
  const def = BUILDINGS[type];
  return !!def && s.renown.level >= def.level;
}

export function canPlace(s: GameState, type: string, x: number, y: number, ignore?: Building, checkCost = true): Result {
  const def = BUILDINGS[type];
  if (!def) return { ok: false, reason: 'Unknown building.' };
  if (!ignore && !buildingUnlocked(s, type)) return { ok: false, reason: `Unlocks at renown ${def.level}.` };
  if (type === 'pokerforge' && !ignore && [...s.buildings.values()].some((b) => b.type === 'pokerforge')) return { ok: false, reason: 'There is only one Pokerforge.' };
  for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) {
    const t = tileAt(s, x + dx, y + dy);
    if (!t) return { ok: false, reason: 'That is open sky.' };
    const o = buildingAt(s, x + dx, y + dy);
    if (o && o !== ignore) return { ok: false, reason: 'Something is already there.' };
    if (def.floors && !def.floors.includes(t.floor)) return { ok: false, reason: def.floors.includes('grass') ? 'Needs grass.' : 'Needs a paved floor (Build → Land).' };
  }
  if (def.edge) {
    let edge = false;
    for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) if (isEdgeTile(s, x + dx, y + dy)) edge = true;
    if (!edge) return { ok: false, reason: 'Must touch the island edge.' };
  }
  if (checkCost && !ignore) {
    if (s.chips < def.cost) return { ok: false, reason: `Needs ${fmtChips(def.cost)} chips.` };
    if ((def.gems ?? 0) > s.gems) return { ok: false, reason: `Needs ${def.gems} gems.` };
  }
  return { ok: true };
}

export function place(s: GameState, type: string, x: number, y: number, dir: Dir = 0): Result & { id?: number } {
  const r = canPlace(s, type, x, y);
  if (!r.ok) return r;
  const def = BUILDINGS[type];
  s.chips -= def.cost;
  s.gems -= def.gems ?? 0;
  const b = addBuilding(s, type, x, y, def.rotatable ? dir : 0);
  if (def.kind === 'well') b.stock = WELL.stock;
  if (type === 'pokerforge') s.wonder.id = b.id;
  s.stats.built++;
  s.tileRev++;
  return { ok: true, id: b.id };
}

export function placeLine(s: GameState, type: string, cells: { x: number; y: number; dir: Dir }[]): number {
  let n = 0;
  for (const c of cells) {
    const ex = buildingAt(s, c.x, c.y);
    if (ex && ex.type === type) { if (BUILDINGS[type].rotatable) ex.dir = c.dir; continue; }
    if (place(s, type, c.x, c.y, c.dir).ok) n++;
  }
  return n;
}

/** Removing refunds half the build cost (tables also refund half their upgrades). Tills are collected first. */
export function remove(s: GameState, id: number): Result {
  const b = s.buildings.get(id);
  if (!b) return { ok: false };
  const def = BUILDINGS[b.type];
  if (def.removable === false) return { ok: false, reason: 'That stays.' };
  collectTill(s, b);
  let refund = def.cost;
  for (let l = 1; l < b.level; l++) refund += Math.max(60, def.cost) * 2.6 ** l;
  s.chips += Math.floor(refund / 2);
  removeBuildingRaw(s, b);
  s.patrons = s.patrons.filter((p) => p.table !== id);
  s.tileRev++;
  return { ok: true };
}

export function move(s: GameState, id: number, x: number, y: number, dir: Dir): Result {
  const b = s.buildings.get(id);
  if (!b) return { ok: false };
  const r = canPlace(s, b.type, x, y, b);
  if (!r.ok) return r;
  removeBuildingRaw(s, b);
  b.x = x; b.y = y;
  if (BUILDINGS[b.type].rotatable) b.dir = dir;
  s.buildings.set(b.id, b);
  const size = BUILDINGS[b.type].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) s.occ.set(key(x + dx, y + dy), b.id);
  for (const p of s.patrons) if (p.table === id) { p.phase = 'leave'; p.t = 1; p.tx = p.x + 3; p.ty = p.y + 3; }
  s.tileRev++;
  return { ok: true };
}

export function rotate(s: GameState, id: number): Result {
  const b = s.buildings.get(id);
  if (!b || !BUILDINGS[b.type].rotatable) return { ok: false };
  b.dir = ((b.dir + 1) % 4) as Dir;
  return { ok: true };
}

// ───────────────────────── land ─────────────────────────

export function landUnlocked(s: GameState, id: string): boolean {
  return s.renown.level >= LAND[id].level;
}

export function canExpand(s: GameState, id: string, x: number, y: number, checkCost = true): Result {
  const l = LAND[id];
  if (!l) return { ok: false };
  if (!landUnlocked(s, id)) return { ok: false, reason: `Unlocks at renown ${l.level}.` };
  const t = tileAt(s, x, y);
  if (l.mode === 'new') {
    if (t) return { ok: false, reason: 'Already land.' };
    let adj = false;
    for (let d = 0; d < 4; d++) if (tileAt(s, x + DX[d], y + DY[d])) adj = true;
    if (!adj) return { ok: false, reason: 'New land must touch the island.' };
  } else {
    if (!t) return { ok: false, reason: 'Pave existing land.' };
    if (t.floor === l.floor) return { ok: false, reason: 'Already that floor.' };
    const b = buildingAt(s, x, y);
    if (b) {
      const fl = BUILDINGS[b.type].floors;
      if (fl && !fl.includes(l.floor)) return { ok: false, reason: `The ${BUILDINGS[b.type].name} needs ${fl.includes('grass') ? 'grass' : 'paving'}.` };
    }
  }
  if (checkCost && s.chips < landCost(id, s.tiles.size)) return { ok: false, reason: `Needs ${fmtChips(landCost(id, s.tiles.size))} chips.` };
  return { ok: true };
}

export function expand(s: GameState, id: string, x: number, y: number): Result {
  const r = canExpand(s, id, x, y);
  if (!r.ok) return r;
  const l = LAND[id];
  s.chips -= landCost(id, s.tiles.size);
  if (l.mode === 'new') addTile(s, x, y, 'grass');
  else {
    const t = tileAt(s, x, y)!;
    t.floor = l.floor;
    s.tileRev++;
    s.cache.dirty = true;
  }
  return { ok: true };
}

export const isPaved = (s: GameState, x: number, y: number): boolean => PAVED.includes(tileAt(s, x, y)?.floor ?? 'grass');

// ───────────────────────── tables ─────────────────────────

export function upgrade(s: GameState, id: number): Result {
  const b = s.buildings.get(id);
  if (!b) return { ok: false };
  const r = canUpgrade(s, b);
  if (!r.ok) return r;
  s.chips -= upgradeCost(s, b);
  b.level++;
  b.cycles++;
  return { ok: true };
}

export function collect(s: GameState, id: number): number {
  const b = s.buildings.get(id);
  return b && gameOfType(b.type) ? collectTill(s, b) : 0;
}

// ───────────────────────── the well ─────────────────────────

export function wellValue(s: GameState): [number, number] {
  const k = (1 + perkRank(s, 'wellspring') * 0.5) * (1 + (s.renown.level - 1) * 0.35);
  return [Math.max(1, Math.round(WELL.perTap[0] * k)), Math.max(1, Math.round(WELL.perTap[1] * k))];
}

export function tapWell(s: GameState, id: number): Result & { got?: number; purse?: number } {
  const b = s.buildings.get(id);
  if (!b || BUILDINGS[b.type].kind !== 'well') return { ok: false };
  // when broke, once a day the well hands back a purse
  let purse = 0;
  if (s.chips < 1 && s.comps < 1 && s.pursedDay !== dayIndex(s.time) && noRoundsOpen(s)) {
    purse = levelGift(s.renown.level) * 2;
    s.pursedDay = dayIndex(s.time);
    s.chips += purse;
    feat(s, 'broke');
  }
  if (b.stock <= 0) return purse ? { ok: true, got: 0, purse } : { ok: false, reason: 'The well is empty. It refills slowly.' };
  b.stock--;
  const [lo, hi] = wellValue(s);
  const got = lo + Math.floor(rand(s) * (hi - lo + 1));
  s.chips += got;
  s.stats.wellTaps++;
  b.cycles++;
  return { ok: true, got, purse };
}

const noRoundsOpen = (s: GameState) => !roundOpen(s);

// ───────────────────────── renown ─────────────────────────

export function perkAvailable(s: GameState, id: string): Result {
  if (id === FORTUNE_PERK.id) {
    const all = PERKS.every((p) => perkRank(s, p.id) >= p.max);
    if (!all) return { ok: false, reason: 'Fill every other perk first.' };
  } else {
    const p = PERK[id];
    if (!p) return { ok: false };
    if (perkRank(s, id) >= p.max) return { ok: false, reason: 'Already at the top rank.' };
    if (s.renown.level < p.level) return { ok: false, reason: `Unlocks at renown ${p.level}.` };
  }
  if (s.renown.points < 1) return { ok: false, reason: 'No perk points. Earn them by levelling up.' };
  return { ok: true };
}

export function buyPerk(s: GameState, id: string): Result {
  const r = perkAvailable(s, id);
  if (!r.ok) return r;
  s.renown.points--;
  s.renown.perks[id] = perkRank(s, id) + 1;
  return { ok: true };
}

/** Respec: refund every perk point for gems. */
export const RESPEC_GEMS = 3;
export function respec(s: GameState): Result {
  const spent = Object.values(s.renown.perks).reduce((a, b) => a + b, 0);
  if (!spent) return { ok: false, reason: 'Nothing to refund.' };
  if (s.gems < RESPEC_GEMS) return { ok: false, reason: `Needs ${RESPEC_GEMS} gems.` };
  s.gems -= RESPEC_GEMS;
  s.renown.points += spent;
  s.renown.perks = {};
  return { ok: true };
}

// ───────────────────────── gem shop: charms ─────────────────────────

export interface CharmDef { id: string; name: string; desc: string; gems: number; minutes?: number; bets?: number }
export const CHARMS: CharmDef[] = [
  { id: 'hot_streak', name: 'Hot Streak', desc: 'Win profits +10% for your next 40 bets.', gems: 3, bets: 40 },
  { id: 'tonic', name: 'Scholar’s Tonic', desc: 'Double renown XP for 10 minutes.', gems: 2, minutes: 10 },
  { id: 'crowd', name: 'Street Parade', desc: 'Patrons arrive twice as fast for 10 minutes.', gems: 2, minutes: 10 },
  { id: 'magnet', name: 'Token Magnet', desc: 'Lucky tokens three times as likely for your next 30 bets.', gems: 3, bets: 30 },
];

export function buyCharm(s: GameState, id: string): Result {
  const c = CHARMS.find((x) => x.id === id);
  if (!c) return { ok: false };
  if (s.gems < c.gems) return { ok: false, reason: `Needs ${c.gems} gems.` };
  s.gems -= c.gems;
  const cur = s.boosts.find((b) => b.id === id);
  if (cur) {
    if (c.minutes) cur.until = Math.max(cur.until ?? s.time, s.time) + c.minutes * 60;
    if (c.bets) cur.bets = (cur.bets ?? 0) + c.bets;
  } else s.boosts.push({ id, until: c.minutes ? s.time + c.minutes * 60 : undefined, bets: c.bets });
  return { ok: true };
}

// ───────────────────────── the wonder ─────────────────────────

export function buildWonderStage(s: GameState): Result {
  if (!s.buildings.get(s.wonder.id)) return { ok: false, reason: 'Lay the Pokerforge’s foundation first.' };
  const st = WONDER_STAGES[s.wonder.stage];
  if (!st) return { ok: false, reason: 'The Pokerforge is complete.' };
  if (s.chips < st.chips) return { ok: false, reason: `Needs ${fmtChips(st.chips)} chips.` };
  if (s.gems < st.gems) return { ok: false, reason: `Needs ${st.gems} gems.` };
  s.chips -= st.chips;
  s.gems -= st.gems;
  s.wonder.stage++;
  s.cache.dirty = true;
  s.events.push({ type: 'wonder', stage: s.wonder.stage });
  return { ok: true };
}

export function buyLegend(s: GameState): Result {
  if (s.wonder.stage < WONDER_STAGES.length) return { ok: false, reason: 'Complete the Pokerforge first.' };
  const cost = legendCost(s.wonder.legend);
  if (s.chips < cost) return { ok: false, reason: `Needs ${fmtChips(cost)} chips.` };
  s.chips -= cost;
  s.wonder.legend++;
  s.events.push({ type: 'legend', rank: s.wonder.legend });
  return { ok: true };
}

export { dayFraction };
