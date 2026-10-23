import { describe, expect, it } from 'vitest';
import * as A from '../../src/core/actions';
import { BUILDINGS, BUILDING_LIST } from '../../src/core/content/buildings';
import { GAMES } from '../../src/core/content/games';
import { GOALS } from '../../src/core/content/goals';
import { maxBet, wager, settle } from '../../src/core/economy';
import { applyOffline } from '../../src/core/offline';
import * as P from '../../src/core/play';
import { deserialize, exportText, importText, serialize } from '../../src/core/save';
import { TICK, rebuildCache, tick } from '../../src/core/sim';
import { createState, key } from '../../src/core/state';

const run = (s: ReturnType<typeof createState>, sec: number) => { for (let i = 0; i < sec / TICK; i++) tick(s, TICK); };

describe('the fresh casino', () => {
  it('starts with a well, an oak and a coin stand on nine tiles', () => {
    const s = createState(1);
    expect(s.tiles.size).toBe(9);
    expect([...s.buildings.values()].map((b) => b.type).sort()).toEqual(['coin_stand', 'tree', 'well']);
    expect(s.chips).toBe(100);
  });
  it('every game has a building, art-free content is consistent', () => {
    for (const g of GAMES) expect(BUILDINGS[g.building]?.kind).toBe('table');
    for (const b of BUILDING_LIST) expect(b.cost).toBeGreaterThanOrEqual(0);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
  });
  it('the well pays and refills', () => {
    const s = createState(2);
    const well = [...s.buildings.values()].find((b) => b.type === 'well')!;
    const r = A.tapWell(s, well.id);
    expect(r.ok).toBe(true);
    expect(s.chips).toBeGreaterThan(100);
    const stock = well.stock;
    run(s, 10);
    expect(well.stock).toBeGreaterThan(stock);
  });
  it('a broke player gets a purse from the well once a day', () => {
    const s = createState(3);
    const well = [...s.buildings.values()].find((b) => b.type === 'well')!;
    s.chips = 0;
    const r = A.tapWell(s, well.id);
    expect(r.purse).toBeGreaterThan(0);
    s.chips = 0;
    expect(A.tapWell(s, well.id).purse ?? 0).toBe(0);
  });
});

describe('wagers', () => {
  it('limits, stakes, renown and comps', () => {
    const s = createState(4);
    const coin = [...s.buildings.values()].find((b) => b.type === 'coin_stand')!;
    expect(wager(s, 'coin', 0, coin).ok).toBe(false);
    expect(wager(s, 'coin', maxBet(s, 'coin', coin) + 1, coin).ok).toBe(false);
    expect(wager(s, 'coin', 10, coin).ok).toBe(true);
    expect(s.chips).toBe(90);
    expect(s.comps).toBeGreaterThan(0);
    expect(s.renown.xp).toBeGreaterThan(0);
    const st = settle(s, 'coin', 10, 19.6);
    expect(st.ret).toBeGreaterThanOrEqual(20);
    expect(s.stats.wins).toBe(1);
  });
  it('a coin streak can ride and be collected', () => {
    const s = createState(5);
    const coin = [...s.buildings.values()].find((b) => b.type === 'coin_stand')!;
    let won = false;
    for (let i = 0; i < 40 && !won; i++) {
      const r = P.coinToss(s, coin.id, 1, 'heads');
      if (r.win && s.rounds.coin) { won = true; const c = P.coinCollect(s); expect(c.ok).toBe(true); expect(s.rounds.coin).toBeUndefined(); }
    }
    expect(won).toBe(true);
  });
  it('table upgrades raise the limit', () => {
    const s = createState(6);
    s.chips = 1e6;
    const coin = [...s.buildings.values()].find((b) => b.type === 'coin_stand')!;
    const before = maxBet(s, 'coin', coin);
    expect(A.upgrade(s, coin.id).ok).toBe(true);
    expect(maxBet(s, 'coin', coin)).toBe(before * 2);
  });
  it('blackjack rounds settle stakes exactly', () => {
    const s = createState(7);
    s.chips = 10000;
    s.renown.level = 10;
    for (let x = 2; x <= 3; x++) A.expand(s, 'plot', x, 0);
    A.expand(s, 'stone', 2, 0);
    expect(A.place(s, 'blackjack', 2, 0, 0).ok).toBe(true);
    const t = [...s.buildings.values()].find((b) => b.type === 'blackjack')!;
    const chips0 = s.chips;
    for (let i = 0; i < 200; i++) {
      const r = P.bjDeal(s, t.id, 10);
      expect(r.ok).toBe(true);
      while (P.bjRound(s).phase === 'play') P.bjAct(s, t.id, 'stand');
    }
    expect(s.stats.playsBy.blackjack).toBe(200);
    // the house edge on 200 hands of 10 chips can't move more than the stakes
    expect(Math.abs(s.chips - chips0)).toBeLessThan(2000 + s.comps);
  });
});

describe('the house', () => {
  it('patrons arrive, sit and fill tills; a cashier banks them', () => {
    const s = createState(8);
    s.chips = 1e6;
    s.renown.level = 10;
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) if (!s.tiles.has(key(x, y))) A.expand(s, 'plot', x, y);
    A.expand(s, 'stone', -2, -2);
    A.place(s, 'slots', 2, 2, 0);
    rebuildCache(s);
    run(s, 300);
    expect(s.stats.patrons).toBeGreaterThan(3);
    const tills = [...s.buildings.values()].reduce((a, b) => a + b.till, 0);
    expect(tills).toBeGreaterThan(0);
    A.place(s, 'cashier', 1, 1, 0);
    const chips = s.chips;
    run(s, 120);
    expect(s.chips).toBeGreaterThan(chips);
  });
  it('time away fills tills (capped) without simulating every tick', () => {
    const s = createState(9);
    s.chips = 1e6;
    s.renown.level = 4;
    A.place(s, 'slots', -1, 1, 0);
    rebuildCache(s);
    const rep = applyOffline(s, 3 * 3600);
    expect(rep.tills + rep.banked).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  it('round-trip through JSON and text export', () => {
    const s = createState(10);
    s.chips = 1234;
    s.tokens.clover = 2;
    s.goals.add('well');
    run(s, 30);
    const back = deserialize(serialize(s)).state;
    expect(back.chips).toBe(1234);
    expect(back.tokens.clover).toBe(2);
    expect(back.goals.has('well')).toBe(true);
    expect(back.buildings.size).toBe(s.buildings.size);
    const t = exportText(s);
    expect(importText(t).state.tiles.size).toBe(s.tiles.size);
  });
  it('identical inputs replay identically', () => {
    const a = createState(11), b = createState(11);
    run(a, 60); run(b, 60);
    expect(serialize(a)).toBe(serialize(b));
  });
});
