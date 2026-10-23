import { BUILDINGS, WONDER_STAGES } from './content/buildings';
import { GAME, GAME_BY_BUILDING, type GameId, MAX_TABLE_LEVEL, levelBetMult, masteryBonus, masteryStar } from './content/games';
import { TOKENS, TOKEN_CHANCE, TOKEN_SETS } from './content/tokens';
import { dayIndex, hotPick, weatherFor } from './content/weather';
import { COMP_RATE, levelGift, xpForLevel } from './content/world';
import { type Building, type GameState, boostOn, isNight, perkRank, rand } from './state';

export interface Result { ok: boolean; reason?: string }

// ───────────────────────── bonuses ─────────────────────────

export const hasSet = (s: GameState, id: string): boolean => s.codex.includes(id);

/** Every game a table on the island hosts. */
export function ownedGames(s: GameState): GameId[] {
  const out = new Set<GameId>();
  for (const b of s.buildings.values()) { const g = gameOfType(b.type); if (g) out.add(g); }
  return [...out];
}

export function gameOfType(type: string): GameId | null {
  return GAME_BY_BUILDING[type]?.id ?? null;
}

/** Today's hot table (stable through the day). */
export function hotGame(s: GameState): GameId | null {
  return hotPick(dayIndex(s.time), s.seed, ownedGames(s).sort());
}

export const weatherNow = (s: GameState) => weatherFor(dayIndex(s.time), s.seed);

/** Bonus applied to the profit of every winning bet at a game. */
export function profitBonus(s: GameState, game: GameId): number {
  let b = perkRank(s, 'favor') * 0.01;
  b += masteryBonus(masteryStar(s.stats.playsBy[game] ?? 0));
  if (hotGame(s) === game) b += weatherNow(s).hot;
  if (hasSet(s, 'charms')) b += 0.02;
  if (isNight(s)) b += perkRank(s, 'nightowl') * 0.01;
  if (s.wonder.stage >= 2) b += 0.03;
  b += perkRank(s, 'fortune') * 0.005;
  if (boostOn(s, 'hot_streak')) b += 0.1;
  return b;
}

export function xpMult(s: GameState): number {
  let m = 1 + perkRank(s, 'scholar') * 0.1;
  if (isNight(s)) m += perkRank(s, 'nightowl') * 0.15;
  if (hasSet(s, 'treasure')) m += 0.15;
  if (s.wonder.stage >= 2) m += 0.25;
  m *= weatherNow(s).xp;
  if (boostOn(s, 'tonic')) m *= 2;
  return m;
}

export function compRate(s: GameState): number {
  return COMP_RATE + perkRank(s, 'loyal') * 0.005 + (hasSet(s, 'treasure') ? 0.01 : 0);
}

/** Global bet-limit multiplier. */
export function limitMult(s: GameState): number {
  return (1 + perkRank(s, 'highroller') * 0.2) * (hasSet(s, 'relics') ? 1.25 : 1) * (s.wonder.stage >= 1 ? 1.25 : 1) * (1 + s.wonder.legend * 0.1);
}

export function maxBet(s: GameState, game: GameId, table?: Building): number {
  const lvl = table?.level ?? 1;
  return Math.max(GAME[game].minBet, Math.floor(GAME[game].maxBet * levelBetMult(lvl) * limitMult(s)));
}

export function minBet(game: GameId): number {
  return GAME[game].minBet;
}

// ───────────────────────── table upgrades ─────────────────────────

export function upgradeCost(s: GameState, b: Building): number {
  const base = Math.max(60, BUILDINGS[b.type].cost);
  return Math.round(base * 2.6 ** b.level * (1 - perkRank(s, 'builder') * 0.06));
}

export function canUpgrade(s: GameState, b: Building): Result {
  if (BUILDINGS[b.type].kind !== 'table') return { ok: false, reason: 'Only tables can be upgraded.' };
  if (b.level >= MAX_TABLE_LEVEL) return { ok: false, reason: 'This table is at its best.' };
  const cost = upgradeCost(s, b);
  if (s.chips < cost) return { ok: false, reason: `Needs ${cost.toLocaleString('en-US')} chips.` };
  return { ok: true };
}

// ───────────────────────── wagering ─────────────────────────

/**
 * Take a stake for a game round. `extra` stakes (doubling, splitting, a
 * hold'em call) do not count as a new play.
 */
export function wager(s: GameState, game: GameId, amount: number, table: Building | undefined, extra = false): Result {
  amount = Math.floor(amount);
  if (!(amount > 0)) return { ok: false, reason: 'Place a bet first.' };
  if (amount > s.chips) return { ok: false, reason: 'Not enough chips.' };
  if (!extra) {
    if (amount < GAME[game].minBet) return { ok: false, reason: `Minimum bet is ${GAME[game].minBet}.` };
    if (amount > maxBet(s, game, table) * roundCap(game)) return { ok: false, reason: `Table limit is ${maxBet(s, game, table).toLocaleString('en-US')}.` };
  }
  s.chips -= amount;
  s.stats.wagered += amount;
  s.stats.wageredBy[game] = (s.stats.wageredBy[game] ?? 0) + amount;
  s.stats.netBy[game] = (s.stats.netBy[game] ?? 0) - amount;
  s.comps += amount * compRate(s);
  addXp(s, amount * xpMult(s));
  if (game === 'slots') s.jackpot += amount * 0.02 * (1 + perkRank(s, 'jackpot') * 0.3);
  if (!extra) {
    const before = masteryStar(s.stats.playsBy[game] ?? 0);
    s.stats.plays++;
    s.stats.playsBy[game] = (s.stats.playsBy[game] ?? 0) + 1;
    const after = masteryStar(s.stats.playsBy[game]!);
    if (after > before) s.events.push({ type: 'mastery', game, star: after });
    for (const bo of s.boosts) if (bo.bets !== undefined && bo.bets > 0) bo.bets--;
    s.boosts = s.boosts.filter((bo) => (bo.until === undefined || bo.until > s.time) && (bo.bets === undefined || bo.bets > 0));
  }
  if (table) table.cycles++;
  return { ok: true };
}

/** Roulette and keno-style games may put several limit-sized bets on one round. */
function roundCap(game: GameId): number {
  return game === 'roulette' ? 10 : game === 'baccarat' ? 3 : game === 'slots' ? 5 : game === 'plinko' ? 10 : 1;
}

export interface Settled {
  /** Chips paid back (stake included). */
  ret: number;
  /** Bonus chips from profit boosts. */
  bonus: number;
  token: string | null;
  second: number;
}

/**
 * Pay out a finished round: `stake` is what was wagered on it, `ret` the
 * raw return. Profit is boosted by perks, mastery and luck; a loss may be
 * half refunded (Second Chance); tokens may drop.
 */
export function settle(s: GameState, game: GameId, stake: number, ret: number, opts: { tokenMult?: number; feat?: string } = {}): Settled {
  ret = Math.max(0, ret);
  let bonus = 0;
  if (ret > stake) bonus = Math.floor((ret - stake) * profitBonus(s, game));
  let pay = Math.round(ret) + bonus;
  let second = 0;
  if (pay === 0 && stake > 0 && rand(s) < perkRank(s, 'second') * 0.02) { second = Math.floor(stake / 2); pay = second; s.events.push({ type: 'second', amount: second }); }
  s.chips += pay;
  s.stats.returned += pay;
  s.stats.netBy[game] = (s.stats.netBy[game] ?? 0) + pay;
  if (pay > stake) { s.stats.wins++; s.stats.winsBy[game] = (s.stats.winsBy[game] ?? 0) + 1; }
  const mult = stake > 0 ? pay / stake : 0;
  if (pay - stake > s.stats.biggestWin) s.stats.biggestWin = pay - stake;
  if (mult > s.stats.biggestMult) s.stats.biggestMult = mult;
  if (mult > (s.stats.bestBy[game] ?? 0)) s.stats.bestBy[game] = mult;
  if (mult >= 10 && pay >= 50) s.events.push({ type: 'bigwin', game, mult, amount: pay });
  if (opts.feat) feat(s, opts.feat);
  if (s.chips > s.stats.maxChips) s.stats.maxChips = s.chips;
  // lucky tokens
  let chance = TOKEN_CHANCE * (opts.tokenMult ?? 1) * (1 + perkRank(s, 'finder') * 0.25) * weatherNow(s).tokens;
  if (mult >= 5) chance *= 3;
  if (mult >= 25) chance *= 3;
  if (boostOn(s, 'magnet')) chance *= 3;
  const token = rand(s) < chance ? findToken(s) : null;
  return { ret: pay, bonus, token, second };
}

export function feat(s: GameState, id: string, n = 1): void {
  s.stats.feats[id] = (s.stats.feats[id] ?? 0) + n;
}

/** The slots jackpot: pays the pool scaled by the line bet against the table limit. */
export function payJackpot(s: GameState, lineBet: number, limit: number, table?: Building): number {
  const share = Math.min(1, lineBet / Math.max(1, limit));
  const amount = Math.floor(s.jackpot * share);
  s.jackpot = Math.max(jackpotSeed(s, table), s.jackpot - amount);
  s.stats.jackpots++;
  s.events.push({ type: 'jackpot', amount });
  return amount;
}

export function jackpotSeed(s: GameState, table?: Building): number {
  return Math.round(100 * maxBet(s, 'slots', table) * (weatherNow(s).id === 'starfall' ? 3 : 1));
}

// ───────────────────────── tokens ─────────────────────────

export function findToken(s: GameState): string {
  const t = TOKENS[Math.floor(rand(s) * TOKENS.length)];
  const had = s.tokens[t.id] ?? 0;
  s.tokens[t.id] = had + 1;
  s.stats.tokens++;
  if (had > 0) s.gems++;
  s.events.push({ type: 'token', id: t.id, dup: had > 0 });
  for (const set of TOKEN_SETS) {
    if (s.codex.includes(set.id)) continue;
    if (set.tokens.every((id) => (s.tokens[id] ?? 0) > 0)) { s.codex.push(set.id); s.gems += 3; s.events.push({ type: 'codex', set: set.id }); }
  }
  return t.id;
}

// ───────────────────────── renown ─────────────────────────

export function addXp(s: GameState, n: number): void {
  const r = s.renown;
  r.xp += n;
  while (r.xp >= xpForLevel(r.level)) {
    r.xp -= xpForLevel(r.level);
    r.level++;
    r.points++;
    const gift = levelGift(r.level);
    s.chips += gift;
    if (r.level % 5 === 0) s.gems += 2;
    s.events.push({ type: 'levelup', level: r.level, gift });
  }
}

/** Comps are claimed as chips. */
export function claimComps(s: GameState): number {
  const n = Math.floor(s.comps);
  if (n <= 0) return 0;
  s.comps -= n;
  s.chips += n;
  return n;
}

// ───────────────────────── wonder ─────────────────────────

export function wonderNext(s: GameState): { chips: number; gems: number } | null {
  const st = WONDER_STAGES[s.wonder.stage];
  return st ? { chips: st.chips, gems: st.gems } : null;
}

export { isNight };
