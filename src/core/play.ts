import { GAME, type GameId } from './content/games';
import { feat, maxBet, payJackpot, settle, type Settled, wager } from './economy';
import * as BJ from './games/blackjack';
import { best, category, Hand } from './games/cards';
import * as Q from './games/quick';
import * as SL from './games/slots';
import * as T from './games/tables';
import { type Building, type GameState, perkRank, rnd } from './state';

/**
 * Every game round as a state change on the world: stakes come out through
 * `wager`, winnings go back through `settle`. Multi-step games keep their
 * round in `s.rounds` so a reload never loses a hand.
 */
export interface Play extends Partial<Settled> { ok: boolean; reason?: string }

const fail = (reason: string): Play => ({ ok: false, reason });
const table = (s: GameState, id: number): Building | undefined => s.buildings.get(id);

/** Is a stake currently riding on an unfinished round? */
export function roundOpen(s: GameState, game?: GameId): boolean {
  const r = s.rounds;
  const open: Partial<Record<GameId, boolean>> = {
    coin: !!r.coin,
    slots: ((r.slots as SlotRound | undefined)?.free ?? 0) > 0,
    blackjack: (r.blackjack as BJ.BjRound | undefined)?.phase === 'play',
    poker: (r.poker as T.VpRound | undefined)?.phase === 'draw',
    mines: !!(r.mines as MinesRound | undefined)?.active,
    crash: !!(r.crash as CrashRound | undefined)?.active,
    holdem: (r.holdem as T.HoldemRound | undefined)?.phase === 'flop',
  };
  return game ? !!open[game] : Object.values(open).some(Boolean);
}

// ───────────────────────── coin toss ─────────────────────────

export interface CoinRound { table: number; stake: number; pot: number; streak: number }

export function coinToss(s: GameState, tableId: number, bet: number, call: 'heads' | 'tails'): Play & { side?: 'heads' | 'tails'; win?: boolean; round?: CoinRound | null } {
  let rd = s.rounds.coin as CoinRound | undefined;
  if (!rd) {
    const w = wager(s, 'coin', bet, table(s, tableId));
    if (!w.ok) return w;
    rd = { table: tableId, stake: Math.floor(bet), pot: Math.floor(bet), streak: 0 };
  } else if (rd.streak >= Q.COIN_MAX_RIDE) return fail('Ten in a row is the limit. Collect!');
  const side = Q.toss(rnd(s));
  if (side === call) {
    rd.pot = Math.floor(rd.pot * Q.COIN_PAY);
    rd.streak++;
    if (rd.streak >= Q.COIN_MAX_RIDE) { const r = coinCollect(s, rd); return { ...r, side, win: true, round: null }; }
    s.rounds.coin = rd;
    return { ok: true, side, win: true, round: rd };
  }
  delete s.rounds.coin;
  const st = settle(s, 'coin', rd.stake, 0);
  return { ok: true, ...st, side, win: false, round: null };
}

export function coinStreakBonus(s: GameState, streak: number): number {
  const base = streak >= 10 ? 0.25 : streak >= Q.COIN_STREAK ? 0.1 : 0;
  return base * (1 + perkRank(s, 'streak'));
}

export function coinCollect(s: GameState, rd0?: CoinRound): Play & { pot?: number } {
  const rd = rd0 ?? (s.rounds.coin as CoinRound | undefined);
  if (!rd) return fail('Nothing riding.');
  delete s.rounds.coin;
  const pot = Math.floor(rd.pot * (1 + coinStreakBonus(s, rd.streak)));
  if (rd.streak >= 5) feat(s, 'coin_streak5');
  if (rd.streak >= 10) feat(s, 'coin_streak10');
  return { ok: true, ...settle(s, 'coin', rd.stake, pot), pot };
}

// ───────────────────────── slots ─────────────────────────

export interface SlotRound { table: number; lineBet: number; lines: number; free: number; freeWon: number }

export function slotSpin(s: GameState, tableId: number, lineBet: number, lines: number): Play & { spin?: SL.SpinResult; jackpot?: number; free?: number; wasFree?: boolean } {
  const t = table(s, tableId);
  let rd = s.rounds.slots as SlotRound | undefined;
  const wasFree = !!rd && rd.free > 0;
  if (wasFree) { lineBet = rd!.lineBet; lines = rd!.lines; rd!.free--; }
  else {
    if (!SL.LINE_CHOICES.includes(lines)) return fail('Pick 1, 3 or 5 lines.');
    if (lineBet > maxBet(s, 'slots', t)) return fail(`Line bet limit is ${maxBet(s, 'slots', t)}.`);
    const w = wager(s, 'slots', lineBet * lines, t);
    if (!w.ok) return w;
    rd = { table: tableId, lineBet, lines, free: 0, freeWon: 0 };
  }
  const spin = SL.spin(rnd(s), lines);
  let ret = spin.total * lineBet;
  let jackpot = 0;
  for (let i = 0; i < spin.jackpotLines; i++) jackpot += payJackpot(s, lineBet, maxBet(s, 'slots', t), t);
  ret += jackpot;
  if (spin.freeSpins) { rd!.free += spin.freeSpins; feat(s, 'free_spins'); }
  if (wasFree) rd!.freeWon += ret;
  if (rd!.free > 0) s.rounds.slots = rd; else delete s.rounds.slots;
  const st = settle(s, 'slots', wasFree ? 0 : lineBet * lines, ret);
  return { ok: true, ...st, spin, jackpot, free: rd!.free, wasFree };
}

// ───────────────────────── dice ─────────────────────────

export function diceRoll(s: GameState, tableId: number, bet: number, target: number, over: boolean): Play & { roll?: number; win?: boolean; mult?: number } {
  target = Math.round(target);
  if (target < 100 || target > 9800) return fail('Pick a target between 1 and 98.');
  const ch = Q.diceChance(target, over);
  if (ch < 0.01 || ch > 0.98) return fail('That chance is out of range.');
  const w = wager(s, 'dice', bet, table(s, tableId));
  if (!w.ok) return w;
  const mult = Q.diceMult(target, over);
  const roll = Q.rollDice(rnd(s));
  const win = Q.diceWins(roll, target, over);
  let ret = win ? bet * mult : 0;
  if (win && mult >= 10) ret += Math.floor((ret - bet) * perkRank(s, 'streak') * 0.05);
  if (win && mult >= 49) feat(s, 'dice_longshot');
  return { ok: true, ...settle(s, 'dice', bet, ret), roll, win, mult };
}

// ───────────────────────── scratch ─────────────────────────

export function scratchBuy(s: GameState, tableId: number, unit: number, ticket: Q.TicketId): Play & { card?: ReturnType<typeof Q.scratchCard>; price?: number } {
  const t = Q.TICKET[ticket];
  const price = unit * t.price;
  const tb = table(s, tableId);
  if (unit > maxBet(s, 'scratch', tb)) return fail(`Card limit is ${maxBet(s, 'scratch', tb)} a unit.`);
  const w = wager(s, 'scratch', unit, tb);
  if (!w.ok) return w;
  // the rest of the price (silver and gold cost several units)
  if (t.price > 1) {
    const extra = wager(s, 'scratch', price - unit, tb, true);
    if (!extra.ok) { s.chips += unit; return extra; }
  }
  const card = Q.scratchCard(rnd(s), t);
  if (card.win >= 50) feat(s, 'scratch_50');
  return { ok: true, ...settle(s, 'scratch', price, price * card.win, { tokenMult: t.tokenMult }), card, price };
}

// ───────────────────────── blackjack ─────────────────────────

export function bjRound(s: GameState): BJ.BjRound {
  let rd = s.rounds.blackjack as BJ.BjRound | undefined;
  if (!rd) { rd = BJ.newRound(rnd(s)); s.rounds.blackjack = rd; }
  return rd;
}

export function bjDeal(s: GameState, tableId: number, bet: number): Play & { round?: BJ.BjRound } {
  const prev = bjRound(s);
  if (prev.phase === 'play') return fail('Finish the hand first.');
  const w = wager(s, 'blackjack', bet, table(s, tableId));
  if (!w.ok) return w;
  const rd = BJ.newRound(rnd(s), prev);
  s.rounds.blackjack = rd;
  const done = BJ.deal(rd, Math.floor(bet));
  if (BJ.isBlackjack(rd.hands[0])) feat(s, 'blackjack');
  return done ? { ...bjSettle(s, rd), round: rd } : { ok: true, round: rd };
}

export function bjAct(s: GameState, tableId: number, act: 'hit' | 'stand' | 'double' | 'split'): Play & { round?: BJ.BjRound } {
  const rd = bjRound(s);
  if (rd.phase !== 'play') return fail('Deal a hand first.');
  if (act === 'double' || act === 'split') {
    if (act === 'double' && !BJ.canDouble(rd)) return fail('You can only double on two cards.');
    if (act === 'split' && !BJ.canSplit(rd)) return fail('Only a pair can be split.');
    const w = wager(s, 'blackjack', rd.hands[rd.active].bet, table(s, tableId), true);
    if (!w.ok) return w;
    if (act === 'double') BJ.double(rd); else BJ.split(rd);
  } else if (act === 'hit') BJ.hit(rd);
  else BJ.stand(rd);
  return (rd.phase as BJ.BjRound['phase']) === 'done' ? { ...bjSettle(s, rd), round: rd } : { ok: true, round: rd };
}

function bjSettle(s: GameState, rd: BJ.BjRound): Play {
  const stake = rd.hands.reduce((a, h) => a + h.bet, 0);
  const ret = rd.results.reduce((a, r) => a + r.ret, 0);
  if (rd.hands.some((h, i) => h.doubled && rd.results[i].outcome === 'win')) feat(s, 'bj_double_win');
  return { ok: true, ...settle(s, 'blackjack', stake, ret) };
}

// ───────────────────────── roulette ─────────────────────────

export function rouletteSpin(s: GameState, tableId: number, bets: Record<string, number>): Play & { n?: number; wins?: string[] } {
  const t = table(s, tableId);
  const lim = maxBet(s, 'roulette', t);
  const entries = Object.entries(bets).filter(([, v]) => v > 0);
  if (!entries.length) return fail('Place a chip on the table.');
  for (const [, v] of entries) if (v > lim) return fail(`Each bet is limited to ${lim}.`);
  const stake = entries.reduce((a, [, v]) => a + v, 0);
  if (stake > s.chips) return fail('Not enough chips for all those bets.');
  const w = wager(s, 'roulette', stake, t);
  if (!w.ok) return w;
  const n = Q.spinRoulette(rnd(s));
  let ret = 0;
  const wins: string[] = [];
  for (const [b, v] of entries) if (Q.rouletteCovers(b, n)) { ret += v * Q.roulettePays(b); wins.push(b); if (b.startsWith('n')) feat(s, 'roulette_straight'); }
  return { ok: true, ...settle(s, 'roulette', stake, ret), n, wins };
}

// ───────────────────────── plinko & wheel ─────────────────────────

export function plinkoDrop(s: GameState, tableId: number, bet: number, rows: number, risk: Q.Risk): Play & { path?: number[]; pocket?: number; mult?: number } {
  if (!Q.PLINKO[rows]) return fail('Pick 8, 12 or 16 rows.');
  const w = wager(s, 'plinko', bet, table(s, tableId));
  if (!w.ok) return w;
  const { path, pocket } = Q.dropBall(rnd(s), rows);
  const mult = Q.PLINKO[rows][risk][pocket];
  if (pocket === 0 || pocket === rows) feat(s, 'plinko_edge');
  return { ok: true, ...settle(s, 'plinko', bet, bet * mult), path, pocket, mult };
}

export function wheelSpin(s: GameState, tableId: number, bet: number, risk: Q.Risk): Play & { index?: number; mult?: number } {
  const w = wager(s, 'wheel', bet, table(s, tableId));
  if (!w.ok) return w;
  const { index, mult } = Q.spinWheel(rnd(s), risk);
  if (mult >= 20) feat(s, 'wheel_gold');
  return { ok: true, ...settle(s, 'wheel', bet, bet * mult), index, mult };
}

// ───────────────────────── video poker ─────────────────────────

export function vpStart(s: GameState, tableId: number, bet: number): Play & { round?: T.VpRound } {
  const cur = s.rounds.poker as T.VpRound | undefined;
  if (cur?.phase === 'draw') return fail('Draw first.');
  const w = wager(s, 'poker', bet, table(s, tableId));
  if (!w.ok) return w;
  const rd = T.vpDeal(rnd(s), Math.floor(bet));
  s.rounds.poker = rd;
  return { ok: true, round: rd };
}

export function vpToggle(s: GameState, i: number): void {
  const rd = s.rounds.poker as T.VpRound | undefined;
  if (rd?.phase === 'draw') rd.held[i] = !rd.held[i];
}

export function vpFinish(s: GameState): Play & { round?: T.VpRound } {
  const rd = s.rounds.poker as T.VpRound | undefined;
  if (!rd || rd.phase !== 'draw') return fail('Deal first.');
  T.vpDraw(rd);
  const res = rd.result!;
  if (res.name === 'Royal Flush') feat(s, 'vp_royal');
  if (res.name === 'Four of a Kind') feat(s, 'vp_quads');
  return { ok: true, ...settle(s, 'poker', rd.bet, rd.bet * res.mult), round: rd };
}

// ───────────────────────── mines ─────────────────────────

export interface MinesRound { table: number; bet: number; mines: number; layout: number[]; open: number[]; active: boolean; busted: number }

export function minesStart(s: GameState, tableId: number, bet: number, mines: number): Play & { round?: MinesRound } {
  if (mines < 1 || mines > 24) return fail('Pick 1 to 24 duds.');
  if ((s.rounds.mines as MinesRound | undefined)?.active) return fail('Finish this dig first.');
  const w = wager(s, 'mines', bet, table(s, tableId));
  if (!w.ok) return w;
  const rd: MinesRound = { table: tableId, bet: Math.floor(bet), mines, layout: Q.layMines(rnd(s), mines), open: [], active: true, busted: -1 };
  s.rounds.mines = rd;
  return { ok: true, round: rd };
}

export function minesPick(s: GameState, cell: number): Play & { round?: MinesRound; bust?: boolean } {
  const rd = s.rounds.mines as MinesRound | undefined;
  if (!rd?.active) return fail('Start a dig first.');
  if (rd.open.includes(cell)) return fail('Already dug.');
  if (rd.layout.includes(cell)) {
    rd.active = false;
    rd.busted = cell;
    return { ok: true, ...settle(s, 'mines', rd.bet, 0), round: rd, bust: true };
  }
  rd.open.push(cell);
  if (rd.open.length === Q.MINES_CELLS - rd.mines) return { ...minesCash(s), round: rd, bust: false };
  return { ok: true, round: rd, bust: false };
}

export function minesCash(s: GameState): Play & { mult?: number } {
  const rd = s.rounds.mines as MinesRound | undefined;
  if (!rd?.active) return fail('Nothing to cash out.');
  if (!rd.open.length) return fail('Dig at least one crate.');
  rd.active = false;
  const mult = Q.minesMult(rd.mines, rd.open.length);
  if (rd.open.length >= 8 && rd.mines >= 5) feat(s, 'mines_deep');
  return { ok: true, ...settle(s, 'mines', rd.bet, rd.bet * mult), mult };
}

// ───────────────────────── keno ─────────────────────────

export function kenoPlay(s: GameState, tableId: number, bet: number, picks: number[]): Play & { drawn?: number[]; hits?: number; mult?: number } {
  const uniq = [...new Set(picks)].filter((n) => n >= 1 && n <= Q.KENO_NUMBERS);
  if (uniq.length < 1 || uniq.length > 10) return fail('Pick 1 to 10 numbers.');
  const w = wager(s, 'keno', bet, table(s, tableId));
  if (!w.ok) return w;
  const drawn = Q.drawKeno(rnd(s));
  const hits = uniq.filter((n) => drawn.includes(n)).length;
  const mult = Q.KENO_PAY[uniq.length][hits];
  if (hits >= 6) feat(s, 'keno_six');
  return { ok: true, ...settle(s, 'keno', bet, bet * mult), drawn, hits, mult };
}

// ───────────────────────── airship ascent ─────────────────────────

export interface CrashRound { table: number; bet: number; burst: number; auto: number; active: boolean; history: number[] }

export function crashStart(s: GameState, tableId: number, bet: number, auto: number): Play & { round?: CrashRound } {
  const cur = s.rounds.crash as CrashRound | undefined;
  if (cur?.active) return fail('The airship is already up.');
  const w = wager(s, 'crash', bet, table(s, tableId));
  if (!w.ok) return w;
  const rd: CrashRound = { table: tableId, bet: Math.floor(bet), burst: Q.crashPoint(rnd(s)), auto: auto >= 1.01 ? Math.floor(auto * 100) / 100 : 0, active: true, history: cur?.history ?? [] };
  s.rounds.crash = rd;
  return { ok: true, round: rd };
}

/** Cash out at multiplier m (the flight's current value), or let it burst (m = 0). */
export function crashEnd(s: GameState, m: number): Play & { won?: boolean; at?: number; burst?: number } {
  const rd = s.rounds.crash as CrashRound | undefined;
  if (!rd?.active) return fail('No flight.');
  rd.active = false;
  rd.history = [...rd.history, rd.burst].slice(-12);
  let at = m;
  if (rd.auto && rd.auto <= rd.burst && (m === 0 || m > rd.auto)) at = rd.auto;
  const won = at >= 1 && at <= rd.burst;
  if (won && at >= 20) feat(s, 'crash_20');
  return { ok: true, ...settle(s, 'crash', rd.bet, won ? rd.bet * at : 0), won, at: won ? at : 0, burst: rd.burst };
}

// ───────────────────────── baccarat ─────────────────────────

export function bacRound(s: GameState): T.BacRound {
  let rd = s.rounds.baccarat as T.BacRound | undefined;
  if (!rd) { rd = T.bacNew(rnd(s)); s.rounds.baccarat = rd; }
  return rd;
}

export function bacPlay(s: GameState, tableId: number, bets: Partial<Record<T.BacBet, number>>): Play & { round?: T.BacRound } {
  const t = table(s, tableId);
  const lim = maxBet(s, 'baccarat', t);
  const entries = Object.entries(bets).filter(([, v]) => (v ?? 0) > 0) as [T.BacBet, number][];
  if (!entries.length) return fail('Back Player, Banker or Tie.');
  for (const [, v] of entries) if (v > lim) return fail(`Each bet is limited to ${lim}.`);
  const stake = entries.reduce((a, [, v]) => a + v, 0);
  const w = wager(s, 'baccarat', stake, t);
  if (!w.ok) return w;
  const rd = T.bacNew(rnd(s), bacRound(s));
  s.rounds.baccarat = rd;
  T.bacPlay(rd);
  let ret = 0;
  for (const [b, v] of entries) ret += T.bacReturn(rd, b, v);
  if (rd.winner === 'tie' && (bets.tie ?? 0) > 0) feat(s, 'bac_tie');
  return { ok: true, ...settle(s, 'baccarat', stake, ret), round: rd };
}

// ───────────────────────── sky derby ─────────────────────────

export interface DerbyRound { card: T.DerbyCard; last: number[] | null; race: number }

export function derbyRound(s: GameState): DerbyRound {
  let rd = s.rounds.derby as DerbyRound | undefined;
  if (!rd) { rd = { card: T.derbyCard(rnd(s)), last: null, race: 1 }; s.rounds.derby = rd; }
  return rd;
}

export function derbyBet(s: GameState, tableId: number, pick: number, kind: 'win' | 'place', bet: number): Play & { order?: number[]; won?: boolean; odds?: number; card?: T.DerbyCard } {
  const rd = derbyRound(s);
  const entry = rd.card.field[pick];
  if (!entry) return fail('Pick a flyer.');
  const w = wager(s, 'derby', bet, table(s, tableId));
  if (!w.ok) return w;
  const odds = T.derbyOdds(kind === 'win' ? entry.p : entry.place);
  const order = T.derbyRun(rnd(s), rd.card);
  const won = kind === 'win' ? order[0] === pick : order.indexOf(pick) < 2;
  if (won && odds >= 8) feat(s, 'derby_long');
  const card = rd.card;
  rd.last = order;
  rd.race++;
  rd.card = T.derbyCard(rnd(s));
  return { ok: true, ...settle(s, 'derby', bet, won ? bet * odds : 0), order, won, odds, card };
}

// ───────────────────────── casino hold'em ─────────────────────────

export function holdemStart(s: GameState, tableId: number, ante: number): Play & { round?: T.HoldemRound } {
  const cur = s.rounds.holdem as T.HoldemRound | undefined;
  if (cur?.phase === 'flop') return fail('Call or fold first.');
  if (ante * 3 > s.chips) return fail('Keep enough for the call (twice the ante).');
  const w = wager(s, 'holdem', ante, table(s, tableId));
  if (!w.ok) return w;
  const rd = T.holdemDeal(rnd(s), Math.floor(ante));
  s.rounds.holdem = rd;
  return { ok: true, round: rd };
}

export function holdemDecide(s: GameState, tableId: number, call: boolean): Play & { round?: T.HoldemRound } {
  const rd = s.rounds.holdem as T.HoldemRound | undefined;
  if (!rd || rd.phase !== 'flop') return fail('Ante up first.');
  if (call) {
    const w = wager(s, 'holdem', rd.ante * 2, table(s, tableId), true);
    if (!w.ok) return w;
  }
  T.holdemFinish(rd, call);
  const stake = rd.ante * (call ? 3 : 1);
  const st = settle(s, 'holdem', stake, rd.ret);
  if (rd.outcome === 'You win' && holdemCat(rd) >= Hand.Flush) feat(s, 'holdem_flush');
  return { ok: true, ...st, round: rd };
}

export const holdemCat = (rd: T.HoldemRound): number => category(best([...rd.you, ...rd.board]).score);

export const gameName = (g: GameId): string => GAME[g].name;
