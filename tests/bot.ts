/**
 * A scripted "reasonable player" that drives the real simulation through the
 * public API only: it fishes the well when broke, plays the best table it
 * owns with sensible strategy and bet sizing, empties tills, builds new
 * tables, paves, decorates, upgrades and spends perk points. Used to prove
 * the whole progression is reachable and to measure pacing.
 */
import * as A from '../src/core/actions';
import { BUILDINGS, BUILDING_LIST, WONDER_STAGES } from '../src/core/content/buildings';
import { GAME, GAMES, type GameId } from '../src/core/content/games';
import { PERKS } from '../src/core/content/perks';
import { LAND, landCost } from '../src/core/content/world';
import { gameOfType, maxBet, minBet, upgradeCost } from '../src/core/economy';
import * as BJ from '../src/core/games/blackjack';
import * as T from '../src/core/games/tables';
import * as P from '../src/core/play';
import { TICK, rebuildCache, tick } from '../src/core/sim';
import { type Building, type GameState, buildingAt, createState, key, tileAt, DX, DY } from '../src/core/state';

/** Seconds of real time a round of each game takes a human. */
const ROUND_TIME: Record<GameId, number> = { coin: 3, slots: 3, dice: 3, scratch: 6, blackjack: 8, roulette: 8, plinko: 3, wheel: 6, poker: 7, mines: 8, keno: 6, crash: 7, baccarat: 7, derby: 9, holdem: 10 };
/** Games the bot likes (good odds), best first. */
const PREF: GameId[] = ['holdem', 'baccarat', 'poker', 'blackjack', 'derby', 'crash', 'roulette', 'wheel', 'plinko', 'dice', 'mines', 'keno', 'slots', 'scratch', 'coin'];

export class Bot {
  s: GameState;
  t = 0;
  timeline: { id: string; t: number }[] = [];
  private nextSpend = 0;
  private nextCollect = 0;
  verbose = false;

  constructor(seed = 7) {
    this.s = createState(seed);
    rebuildCache(this.s);
  }

  private advance(sec: number): void {
    // coarse steps keep a 30-hour run fast; the sim is step-size independent
    const dt = TICK * 5;
    const n = Math.max(1, Math.round(sec / dt));
    for (let i = 0; i < n; i++) tick(this.s, dt);
    this.t += sec;
    for (const e of this.s.events) {
      if (e.type === 'levelup') this.mark(`level${e.level}`);
      if (e.type === 'wonder') this.mark(`wonder${e.stage}`);
      if (e.type === 'achievement' && e.id === 'jackpot') this.mark('jackpot');
    }
    this.s.events.length = 0;
  }

  mark(id: string): void {
    if (!this.timeline.some((x) => x.id === id)) {
      this.timeline.push({ id, t: this.t });
      if (this.verbose) console.log(`${(this.t / 3600).toFixed(2)}h ${id} chips=${Math.floor(this.s.chips)} lvl=${this.s.renown.level} gems=${this.s.gems}`);
    }
  }

  private tables(): Building[] { return [...this.s.buildings.values()].filter((b) => gameOfType(b.type)); }

  /** One decision step. */
  step(): void {
    const s = this.s;
    if (this.t >= this.nextCollect) {
      this.nextCollect = this.t + 25;
      for (const b of this.tables()) if (b.till >= 1) A.collect(s, b.id);
      if (s.comps >= 1) { s.chips += Math.floor(s.comps); s.comps -= Math.floor(s.comps); }
      this.advance(2);
    }
    if (this.t >= this.nextSpend) { this.nextSpend = this.t + 20; this.spend(); }
    const pick = this.pickTable();
    if (!pick) { this.fish(); return; }
    const [b, g] = pick;
    const bet = this.betFor(g, b);
    if (bet < minBet(g) || s.chips < bet * (g === 'holdem' ? 3 : g === 'blackjack' ? 2 : 1)) { this.fish(); return; }
    this.play(g, b, bet);
    this.advance(ROUND_TIME[g]);
  }

  private fish(): void {
    const well = [...this.s.buildings.values()].find((b) => b.type === 'well')!;
    if (well.stock > 0 || this.s.chips < 1) A.tapWell(this.s, well.id);
    this.advance(1.5);
  }

  private pickTable(): [Building, GameId] | null {
    const own = this.tables();
    let best: [Building, GameId] | null = null, bestV = -1;
    for (const b of own) {
      const g = gameOfType(b.type)!;
      if (minBet(g) > this.s.chips * 0.2) continue;
      // value: the bet we would place there, nudged by preference
      const v = Math.min(maxBet(this.s, g, b), this.s.chips * 0.04) * (1 + (PREF.length - PREF.indexOf(g)) * 0.03);
      if (v > bestV) { bestV = v; best = [b, g]; }
    }
    return best;
  }

  private betFor(g: GameId, b: Building): number {
    return Math.max(minBet(g), Math.floor(Math.min(maxBet(this.s, g, b), this.s.chips * 0.04)));
  }

  play(g: GameId, b: Building, bet: number): void {
    const s = this.s, id = b.id;
    switch (g) {
      case 'coin': { P.coinToss(s, id, bet, 'heads'); if (s.rounds.coin) P.coinCollect(s); break; }
      case 'slots': { P.slotSpin(s, id, Math.max(1, Math.floor(bet / 5)), 5); while (((s.rounds.slots as P.SlotRound | undefined)?.free ?? 0) > 0) P.slotSpin(s, id, 1, 5); break; }
      case 'dice': P.diceRoll(s, id, bet, 5000, true); break;
      case 'scratch': P.scratchBuy(s, id, bet, 'bronze'); break;
      case 'blackjack': {
        const r = P.bjDeal(s, id, bet);
        if (!r.ok) break;
        let rd = P.bjRound(s);
        let guard = 0;
        while (rd.phase === 'play' && guard++ < 20) {
          let a = BJ.basic(rd);
          if ((a === 'double' || a === 'split') && s.chips < rd.hands[rd.active].bet) a = 'hit';
          P.bjAct(s, id, a);
          rd = P.bjRound(s);
        }
        break;
      }
      case 'roulette': P.rouletteSpin(s, id, { red: bet }); break;
      case 'plinko': P.plinkoDrop(s, id, bet, 8, 'low'); break;
      case 'wheel': P.wheelSpin(s, id, bet, 'low'); break;
      case 'poker': { const r = P.vpStart(s, id, bet); if (r.ok) { const rd = s.rounds.poker as T.VpRound; rd.held = T.vpAdvice(rd.hand); P.vpFinish(s); } break; }
      case 'mines': { const r = P.minesStart(s, id, bet, 3); if (r.ok) { const rd = s.rounds.mines as P.MinesRound; for (let c = 0; c < 25 && rd.active && rd.open.length < 3; c++) if (!rd.open.includes(c)) P.minesPick(s, c); if (rd.active) P.minesCash(s); } break; }
      case 'keno': P.kenoPlay(s, id, bet, [3, 7, 11, 19, 23, 31]); break;
      case 'crash': { const r = P.crashStart(s, id, bet, 2); if (r.ok) P.crashEnd(s, 0); break; }
      case 'baccarat': P.bacPlay(s, id, { banker: bet }); break;
      case 'derby': { const card = P.derbyRound(s).card; let fav = 0; card.field.forEach((e, i) => { if (e.p > card.field[fav].p) fav = i; }); P.derbyBet(s, id, fav, 'win', bet); break; }
      case 'holdem': { const r = P.holdemStart(s, id, bet); if (r.ok) P.holdemDecide(s, id, T.holdemAdvice(s.rounds.holdem as T.HoldemRound) === 'call'); break; }
    }
  }

  // ───────────────────────── spending ─────────────────────────

  private spend(): void {
    const s = this.s;
    // perks: favour house income and limits, then the rest
    const order = ['host', 'highroller', 'favor', 'loyal', 'lights', 'tills', 'scholar', 'builder', 'cardsense', 'second', 'finder', 'wellspring', 'nightowl', 'streak', 'jackpot', 'counter', 'scout'];
    while (s.renown.points > 0) {
      const id = order.find((p) => A.perkAvailable(s, p).ok) ?? (A.perkAvailable(s, 'fortune').ok ? 'fortune' : null);
      if (!id) break;
      A.buyPerk(s, id);
    }
    if (PERKS.length === 0) return;
    // a new table (the newest unlocked one we lack)
    for (const g of [...GAMES].reverse()) {
      if (s.renown.level < g.level || this.tables().some((t) => t.type === g.building)) continue;
      const cost = BUILDINGS[g.building].cost;
      if (s.chips > cost * 1.3 + 50) { if (this.placeTable(g.building)) { this.mark('build_' + g.id); return; } }
    }
    // services
    for (const type of ['cashier', 'bar', 'hotel', 'dock', 'vault', 'stage']) {
      const d = BUILDINGS[type];
      if (s.renown.level >= d.level && ![...s.buildings.values()].some((b) => b.type === type) && s.chips > d.cost * 2.5) { if (this.placeAnywhere(type)) { this.mark('build_' + type); return; } }
    }
    // the wonder
    if (s.renown.level >= BUILDINGS.pokerforge.level && !s.buildings.has(s.wonder.id) && s.chips > 2e6) { if (this.placeAnywhere('pokerforge')) this.mark('wonder0'); }
    if (s.buildings.has(s.wonder.id)) {
      const st = WONDER_STAGES[s.wonder.stage];
      if (st && s.chips > st.chips * 1.2 && s.gems >= st.gems) A.buildWonderStage(s);
      if (!st) A.buyLegend(s);
    }
    // upgrades: cheapest first, keeping a healthy bankroll
    const ups = this.tables().filter((b) => A.upgrade !== undefined && b.level < 10).sort((a, b) => upgradeCost(s, a) - upgradeCost(s, b));
    for (const b of ups) { if (s.chips > upgradeCost(s, b) * 3) A.upgrade(s, b.id); }
    // glamour: the best decor per chip we can comfortably afford
    const decor = BUILDING_LIST.filter((d) => d.kind === 'decor' && s.renown.level >= d.level && (d.gems ?? 0) <= s.gems && !d.draggable).sort((a, b) => (b.glamour ?? 0) / b.cost - (a.glamour ?? 0) / a.cost);
    const decorN = [...s.buildings.values()].filter((b) => BUILDINGS[b.type].kind === 'decor').length;
    if (decorN < 8 + this.tables().length * 2) for (const d of decor.slice(0, 2)) if (s.chips > d.cost * 12) this.placeAnywhere(d.id);
    // land: keep a few free tiles
    const free = [...s.tiles.values()].filter((t) => !buildingAt(s, t.x, t.y)).length;
    if (free < 12 && s.chips > landCost('plot', s.tiles.size) * 4) this.expand(4);
    // carpet under tables once affordable
    if (A.landUnlocked(s, 'carpet')) for (const b of this.tables()) { const t = tileAt(s, b.x, b.y)!; if (t.floor === 'stone' && s.chips > LAND.carpet.cost * 20 && BUILDINGS[b.type].size === 1) A.expand(s, 'carpet', b.x, b.y); }
  }

  private expand(n: number): void {
    const s = this.s;
    for (let k = 0; k < n; k++) {
      let done = false;
      const tiles = [...s.tiles.values()].sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y));
      for (const t of tiles) {
        for (let d = 0; d < 4 && !done; d++) if (A.expand(s, 'plot', t.x + DX[d], t.y + DY[d]).ok) done = true;
        if (done) break;
      }
      if (!done) return;
    }
  }

  /** A fresh size×size block of land off the island's +x side (big buildings need room). */
  private expandBlock(size: number): void {
    const s = this.s;
    let x0 = -Infinity;
    for (const t of s.tiles.values()) if (t.y === 0 && t.x > x0) x0 = t.x;
    for (let x = x0 + 1; x <= x0 + size; x++) for (let y = 0; y < size; y++) A.expand(s, 'plot', x, y);
  }

  private freeSpots(size: number): [number, number][] {
    const s = this.s, out: [number, number][] = [];
    for (const t of s.tiles.values()) {
      let ok = true;
      for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size && ok; dx++) if (!tileAt(s, t.x + dx, t.y + dy) || buildingAt(s, t.x + dx, t.y + dy)) ok = false;
      if (ok) out.push([t.x, t.y]);
    }
    return out.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
  }

  private placeAnywhere(type: string): boolean {
    const s = this.s, def = BUILDINGS[type];
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const [x, y] of this.freeSpots(def.size)) {
        if (A.canPlace(s, type, x, y).ok) return A.place(s, type, x, y, 1).ok;
        // pave (or re-turf) the spot if that is all it needs
        if (def.floors && s.chips > def.cost + 200) {
          const floor = def.floors.includes('stone') ? 'stone' : def.floors.includes('grass') ? 'grass' : null;
          if (!floor || !A.landUnlocked(s, floor)) continue;
          let paved = true;
          for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) { const t = tileAt(s, x + dx, y + dy)!; if (!def.floors.includes(t.floor) && !A.expand(s, floor, x + dx, y + dy).ok) paved = false; }
          if (paved && A.canPlace(s, type, x, y).ok) return A.place(s, type, x, y, 1).ok;
        }
      }
      if (def.size > 1) this.expandBlock(def.size); else this.expand(2);
    }
    void key;
    return false;
  }

  private placeTable(type: string): boolean {
    return this.placeAnywhere(type);
  }

  /** Run until a condition or a time limit (hours). */
  run(hours: number, until?: (s: GameState) => boolean): void {
    const end = hours * 3600;
    while (this.t < end) {
      this.step();
      if (until?.(this.s)) break;
    }
  }
}

export { GAME };
