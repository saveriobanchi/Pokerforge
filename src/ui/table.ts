import { BUILDINGS } from '../core/content/buildings';
import { GAME, type GameId, MAX_TABLE_LEVEL, levelBetMult, levelTakeMult, masteryStar, nextStarAt } from '../core/content/games';
import { canUpgrade, gameOfType, hotGame, maxBet, minBet, upgradeCost } from '../core/economy';
import * as A from '../core/actions';
import type { Play } from '../core/play';
import { roundOpen } from '../core/play';
import { seatTake, tillCap } from '../core/sim';
import type { Building } from '../core/state';
import type { Game } from '../game';
import { audio, type Sfx } from '../platform/audio';
import { h, img } from './dom';
import { glyph, thumb, uiIcon } from './glyphs';
import { type GameView, type TableCtx, fmtN, makeBetBox, outcomeFx, ruleLine, short } from './games/common';
import { blackjackView, baccaratView, holdemView, pokerView } from './games/cards';
import { coinView, diceView, scratchView, slotsView } from './games/luck';
import { crashView, derbyView, kenoView, minesView } from './games/thrill';
import { plinkoView, rouletteView, wheelView } from './games/wheels';

const VIEWS: Record<GameId, (ctx: TableCtx) => GameView> = {
  coin: coinView, slots: slotsView, dice: diceView, scratch: scratchView, blackjack: blackjackView, roulette: rouletteView,
  plinko: plinkoView, wheel: wheelView, poker: pokerView, mines: minesView, keno: kenoView, crash: crashView,
  baccarat: baccaratView, derby: derbyView, holdem: holdemView,
};

export const STAR = (n: number) => '★'.repeat(Math.min(5, n)) + '☆'.repeat(Math.max(0, 5 - n)) + (n > 5 ? ` +${n - 5}` : '');

export interface OpenTable {
  id: number;
  el: HTMLElement;
  frame(dt: number): void;
  close(): void;
}

/** Build a table screen: header (level, limits, till, upgrade) and the game itself. */
export function openTable(g: Game, b: Building, host: { banner: (text: string, kind: string, ms: number) => void; floatWin: (amount: number) => void; close: () => void }): OpenTable {
  const game = gameOfType(b.type)!;
  const def = GAME[game];
  const closers: (() => void)[] = [];
  const frames: ((dt: number) => void)[] = [];
  let closed = false;
  const s = () => g.s;
  const table = () => g.s.buildings.get(b.id) ?? b;

  const sub = h('div', { class: 'sub' });
  const tillEl = h('button', { class: 'till', onclick: () => collect() });
  const levelEl = h('span', { class: 'lvl-badge' });
  const upBtn = h('button', { class: 'btn small up', onclick: () => upgrade() });
  const infoBtn = h('button', { class: 'btn small ghost', onclick: () => { rules.classList.toggle('open'); audio.play('tap'); } }, '?');
  const moreBtn = h('button', { class: 'btn small ghost', onclick: () => { tools.classList.toggle('open'); audio.play('tap'); } }, '⋯');
  const rules = h('div', { class: 'rules' }, h('p', { text: def.rules }), h('p', { class: 'muted', text: ruleLine(game) }), h('p', { class: 'muted', text: 'Keyboard: Space or Enter plays, Esc leaves the table.' }));
  const tools = h('div', { class: 'tools' },
    h('button', { class: 'btn small', onclick: () => { if (roundOpen(g.s, game)) { g.fail('Finish the round first.'); return; } host.close(); g.setMode({ kind: 'move', id: b.id, dir: b.dir }); } }, img(glyph('move')), 'Move'),
    BUILDINGS[b.type].rotatable ? h('button', { class: 'btn small', onclick: () => { g.act(() => A.rotate(g.s, b.id)); } }, img(glyph('rotate')), 'Turn') : null,
    h('button', { class: 'btn small danger', onclick: () => { if (roundOpen(g.s, game)) { g.fail('Finish the round first.'); return; } host.close(); g.tryRemove(b.x, b.y); } }, img(glyph('trash')), 'Sell (half back)'));
  const head = h('div', { class: 'panel-head table-head' },
    h('div', { class: 'thumb' }, img(thumb(b.type))),
    h('div', { class: 't' }, h('div', { class: 'name' }, def.name, ' ', levelEl), sub),
    tillEl, upBtn, infoBtn, moreBtn,
    h('button', { class: 'close', onclick: () => host.close() }, img(glyph('close'))));

  // this visit's running result
  let session = 0, rounds = 0;
  const refresh = () => {
    const t = table();
    const stars = masteryStar(s().stats.playsBy[game] ?? 0);
    const plays = s().stats.playsBy[game] ?? 0;
    levelEl.textContent = `Lv ${t.level}`;
    sub.replaceChildren(
      h('span', { text: `Bets ${short(minBet(game))}–${short(maxBet(s(), game, t))}` }),
      h('span', { class: 'stars', title: `Mastery: ${plays} plays · next star at ${nextStarAt(plays)}`, text: STAR(stars) }),
      ...(hotGame(s()) === game ? [h('span', { class: 'hot', text: '🔥 Hot table' })] : []),
      ...(rounds ? [h('span', { class: 'session ' + (session >= 0 ? 'good' : 'bad'), title: `This visit: ${rounds} round${rounds > 1 ? 's' : ''}`, text: `${session >= 0 ? '+' : '−'}${short(Math.abs(session))} this visit` })] : []));
    const till = Math.floor(t.till), cap = tillCap(s(), t);
    tillEl.replaceChildren(img(uiIcon('chips'), 'px'), h('span', { class: 'num', text: short(till) }), h('i', { style: `width:${Math.round((till / Math.max(1, cap)) * 100)}%` }));
    tillEl.title = `Patrons’ till: ${fmtN(till)} / ${fmtN(cap)} · ${short(seatTake(s(), t) * def.seats)}/min with every seat filled. Tap to collect.`;
    tillEl.classList.toggle('full', till >= cap - 1);
    if (t.level >= MAX_TABLE_LEVEL) { upBtn.textContent = 'Max level'; upBtn.setAttribute('disabled', ''); }
    else {
      const cost = upgradeCost(s(), t);
      upBtn.replaceChildren(h('span', { text: 'Upgrade' }), h('span', { class: 'num', text: short(cost) }));
      upBtn.title = `Level ${t.level + 1}: bets up to ${fmtN(Math.floor(def.maxBet * levelBetMult(t.level + 1)))} (before bonuses), patrons pay ×${(levelTakeMult(t.level + 1) / levelTakeMult(t.level)).toFixed(1)}`;
      upBtn.classList.toggle('poor', !canUpgrade(s(), t).ok);
      upBtn.removeAttribute('disabled');
    }
  };

  function collect() {
    const n = A.collect(g.s, b.id);
    if (n > 0) { audio.play('cash'); host.floatWin(n); g.markDirty(); refresh(); }
    else audio.play('tap');
  }

  function upgrade() {
    const r = g.act(() => A.upgrade(g.s, b.id), 'cash');
    if (r.ok) { host.banner(`Level ${table().level}! Higher limits`, 'win', 1400); g.view.pulse(b.id, 0.8); bet?.refresh(); }
    refresh();
  }

  let bet: ReturnType<typeof makeBetBox> | null = null;
  const ctx: TableCtx = {
    g, game, table: b, s,
    limit: () => maxBet(g.s, game, table()),
    min: () => minBet(game),
    run<T extends Play>(fn: () => T, sound?: Sfx): T | null {
      const r = fn();
      if (!r.ok) { g.fail(r.reason); return null; }
      if (sound) audio.play(sound);
      g.ui.hideChips(r.ret ?? 0);
      g.markDirty();
      refresh();
      return r;
    },
    reveal(r: Play, stake: number, label?: string) {
      const ret = r.ret ?? 0;
      g.ui.hideChips(-ret);
      session += ret - stake;
      rounds++;
      const mult = stake > 0 ? ret / stake : ret > 0 ? 10 : 0;
      if (r.second) { host.banner(`Second chance: ${fmtN(r.second)} back`, 'push', 1600); audio.play('coin'); }
      else if (ret <= 0) { host.banner(label ?? 'No luck', 'lose', 1300); outcomeFx(ctx, 'lose'); }
      else if (Math.abs(ret - stake) < 0.5) { host.banner(label ? `${label} · push` : 'Push', 'push', 1200); outcomeFx(ctx, 'push'); }
      else if (ret < stake) { host.banner(`${label ? label + ' · ' : ''}${fmtN(ret)} back`, 'push', 1300); outcomeFx(ctx, 'push'); }
      else {
        const big = mult >= 10;
        host.banner(`${label ? label + ' · ' : ''}+${fmtN(ret - stake)}${r.bonus ? ` (incl. ${fmtN(r.bonus)} bonus)` : ''}`, big ? 'big' : 'win', big ? 2600 : 1500);
        outcomeFx(ctx, big ? 'big' : 'win');
        host.floatWin(ret);
        g.view.celebrate(b.id, mult >= 50 ? 'huge' : big ? 'big' : 'small', g.settings.reduced);
      }
      refresh();
    },
    banner: (text, kind = 'info', ms = 1400) => host.banner(text, kind, ms),
    betBox: (opts) => { const box = makeBetBox(ctx, opts); bet = bet ?? box; return box; },
    onClose: (fn) => closers.push(fn),
    closed: () => closed,
    onFrame: (fn) => frames.push(fn),
    refresh,
    reduced: () => g.settings.reduced,
  };

  const view = VIEWS[game](ctx);
  refresh();
  // a tap on the table also empties its till
  if (b.till >= 1) window.setTimeout(collect, 250);
  const el = h('div', { class: `table-modal t-${game}` }, head, rules, tools, h('div', { class: 'table-body scroll' }, view.el));
  let acc = 0;
  return {
    id: b.id,
    el,
    frame(dt: number) {
      for (const f of frames) f(dt);
      acc += dt;
      if (acc > 0.5) { acc = 0; refresh(); }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const f of closers) f();
      g.ui.hideChips(0, true);
    },
  };
}
