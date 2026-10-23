import * as A from '../core/actions';
import { GAMES } from '../core/content/games';
import { rebuildCache, tick, TICK } from '../core/sim';
import { type GameState, addTile, createState, key } from '../core/state';

/**
 * A showcase casino for screenshots and the developer tools: a grown island
 * with every table, paving, gardens and a crowd. `?demo=early` gives a small one.
 */
export function demoWorld(kind: string): GameState {
  const s = createState(4242);
  s.chips = 1e12;
  s.gems = 500;
  s.renown.level = kind === 'early' ? 6 : 30;
  const R = kind === 'early' ? 3 : 6;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (Math.abs(x) + Math.abs(y) > R * 1.6) continue;
    if (!s.tiles.has(key(x, y))) addTile(s, x, y, 'grass');
  }
  // a carpeted casino floor in the middle, marble and gold toward the back
  for (const t of s.tiles.values()) {
    const d = Math.max(Math.abs(t.x), Math.abs(t.y));
    if (d <= 1) continue;
    if (t.x >= -R + 2 && t.x <= R - 1 && t.y >= -R + 2 && t.y <= 1) t.floor = kind === 'early' ? 'stone' : t.y <= -3 ? 'gold' : 'carpet';
    else if (t.y > 1 && t.y <= 3 && Math.abs(t.x) <= 3) t.floor = 'marble';
  }
  s.tileRev++;
  const games = kind === 'early' ? GAMES.filter((g) => g.level <= 6) : GAMES;
  const spots: [number, number][] = [];
  for (let y = -R + 2; y <= 1; y++) for (let x = -R + 2; x <= R - 1; x += 1) if ((x + y) % 2 === 0 && Math.max(Math.abs(x), Math.abs(y)) > 1) spots.push([x, y]);
  let i = 0;
  for (const g of games) {
    if (g.id === 'coin') continue;
    const big = g.id === 'derby' || g.id === 'holdem';
    for (; i < spots.length; i++) {
      const [x, y] = spots[i];
      if (A.place(s, g.building, x, y, 1).ok) { i++; break; }
      if (big && A.place(s, g.building, x - 1, y - 1, 0).ok) { i++; break; }
    }
  }
  const decor: [string, number, number][] = kind === 'early'
    ? [['hedge', -3, 2], ['flower_bed', -2, 3], ['lamp_post', 2, 2], ['palm', 3, 0], ['velvet_rope', 0, 2], ['neon_sign', -1, 2]]
    : [['fountain', 0, 3], ['palm', -2, 3], ['palm', 2, 3], ['lamp_post', -3, 2], ['lamp_post', 3, 2], ['statue', 0, 5], ['hedge', -4, 3], ['hedge', 4, 3], ['flower_bed', -3, 4], ['flower_bed', 3, 4],
      ['neon_sign', -1, 2], ['chip_tower', 1, 2], ['dice_statue', -5, 0], ['golden_cat', 5, -1], ['cashier', 0, -1], ['bar', 2, -1], ['hotel', -6, 1], ['dock', 6, 0], ['stage', -2, -1], ['vault', 1, 1], ['gazebo', -4, 4], ['star_arch', 4, 4], ['crystal_lamp', -1, 4], ['monument', 1, 4]];
  for (const [type, x, y] of decor) A.place(s, type, x, y, 0);
  rebuildCache(s);
  // let a crowd gather
  s.time = 600 * 0.35;
  for (let k = 0; k < 20 * 90; k++) tick(s, TICK);
  s.events = [];
  return s;
}
