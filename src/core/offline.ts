import { GAME } from './content/games';
import { BUILDINGS, WELL } from './content/buildings';
import { OFFLINE, PATRON } from './content/world';
import { gameOfType } from './economy';
import { TICK, arrivalInterval, rebuildCache, seatTake, tick, tillCap } from './sim';
import type { GameState } from './state';
import { perkRank } from './state';

export interface OfflineReport {
  seconds: number;
  /** Chips that went straight to the bank (cashiers). */
  banked: number;
  /** Chips waiting in tills. */
  tills: number;
  capped: boolean;
}

/**
 * Time away: short gaps are simulated exactly; longer ones estimate the
 * patrons' take from seat occupancy, at reduced efficiency and for a capped
 * time. Tables beside a cashier bank straight away; others fill their tills.
 */
export function applyOffline(s: GameState, seconds: number): OfflineReport {
  const rep: OfflineReport = { seconds, banked: 0, tills: 0, capped: false };
  if (seconds <= 0) return rep;
  rebuildCache(s);
  if (seconds < 90) {
    const chips = s.chips, till = tillSum(s);
    const n = Math.round(seconds / TICK);
    for (let i = 0; i < n; i++) tick(s, TICK);
    rep.banked = Math.max(0, s.chips - chips);
    rep.tills = Math.max(0, tillSum(s) - till);
    return rep;
  }
  const vault = [...s.buildings.values()].some((b) => b.type === 'vault');
  const maxT = (OFFLINE.hours + (vault ? OFFLINE.vaultHours : 0)) * 3600;
  const t = Math.min(seconds, maxT);
  rep.capped = seconds > maxT;
  // seat occupancy: arrivals × stay against the number of seats
  const stay = (PATRON.stayMin + PATRON.stayMax) / 2;
  const occ = Math.min(1, stay / arrivalInterval(s) / Math.max(1, s.cache.seats));
  const cashiers = [...s.buildings.values()].filter((b) => b.type === 'cashier');
  for (const b of s.buildings.values()) {
    const g = gameOfType(b.type);
    if (!g) continue;
    const earn = seatTake(s, b) / 60 * GAME[g].seats * occ * t * OFFLINE.efficiency;
    const banked = cashiers.some((c) => Math.abs(c.x - b.x) <= (BUILDINGS.cashier.radius ?? 3) && Math.abs(c.y - b.y) <= (BUILDINGS.cashier.radius ?? 3));
    if (banked) { s.chips += Math.floor(earn); rep.banked += Math.floor(earn); }
    else {
      const room = Math.max(0, tillCap(s, b) - b.till);
      const add = Math.min(room, earn);
      b.till += add;
      rep.tills += add;
    }
    s.stats.houseTake += earn;
  }
  // the well refills; the clock moves on (patrons who were here have gone home)
  for (const b of s.buildings.values()) if (b.type === 'well') b.stock = WELL.stock + perkRank(s, 'wellspring') * 4;
  s.patrons = [];
  s.time += t;
  if (s.chips > s.stats.maxChips) s.stats.maxChips = s.chips;
  rep.tills = Math.floor(rep.tills);
  return rep;
}

function tillSum(s: GameState): number {
  let n = 0;
  for (const b of s.buildings.values()) n += b.till;
  return n;
}
