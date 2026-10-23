import { COIN_MAX_RIDE, COIN_PAY, COIN_STREAK, TICKETS, TICKET, type TicketId, diceChance, diceMult } from '../../core/games/quick';
import * as SL from '../../core/games/slots';
import { type CoinRound, type SlotRound, coinCollect, coinStreakBonus, coinToss, diceRoll, scratchBuy, slotSpin } from '../../core/play';
import { maxBet } from '../../core/economy';
import { audio } from '../../platform/audio';
import { art } from '../../render/artpack';
import { h, img } from '../dom';
import { type GameView, type TableCtx, fmtN, short, sleep } from './common';

// ───────────────────────── coin toss ─────────────────────────

export function coinView(ctx: TableCtx): GameView {
  const coin = h('div', { class: 'coin3d' }, h('div', { class: 'face heads' }, img(art.url('ui:crown'), 'px')), h('div', { class: 'face tails' }, img(art.url('tok:star'), 'px')));
  const stage = h('div', { class: 'coin-stage felt' }, coin);
  const potEl = h('div', { class: 'coin-pot' });
  const bet = ctx.betBox();
  const heads = h('button', { class: 'btn big-call', onclick: () => go('heads') }, 'Heads');
  const tails = h('button', { class: 'btn big-call', onclick: () => go('tails') }, 'Tails');
  const collect = h('button', { class: 'btn primary', onclick: () => cash() }, 'Collect');
  const history = h('div', { class: 'history' });
  let busy = false;
  let side: 'heads' | 'tails' = 'heads';

  const round = () => ctx.s().rounds.coin as CoinRound | undefined;
  const sync = () => {
    const rd = round();
    if (rd) {
      const bonus = coinStreakBonus(ctx.s(), rd.streak);
      potEl.replaceChildren(h('span', { class: 'caps', text: `Streak ${rd.streak}${rd.streak >= COIN_STREAK ? ' · bonus +' + Math.round(bonus * 100) + '%' : ''}` }), h('span', { class: 'num big', text: fmtN(rd.pot) }), h('span', { class: 'muted', text: rd.streak < COIN_MAX_RIDE ? `Ride it to ${fmtN(Math.floor(rd.pot * COIN_PAY))}` : 'Ten in a row!' }));
      collect.textContent = `Collect ${short(Math.floor(rd.pot * (1 + bonus)))}`;
      collect.style.display = '';
      bet.el.style.display = 'none';
      heads.textContent = 'Ride on heads'; tails.textContent = 'Ride on tails';
    } else {
      potEl.replaceChildren(h('span', { class: 'caps', text: 'Call it in the air' }), h('span', { class: 'muted', text: `A win pays ${COIN_PAY}×. Win ${COIN_STREAK} in a row for a streak bonus.` }));
      collect.style.display = 'none';
      bet.el.style.display = '';
      heads.textContent = 'Heads'; tails.textContent = 'Tails';
    }
  };

  async function go(call: 'heads' | 'tails') {
    if (busy) return;
    const rd0 = round();
    const riding = !!rd0;
    const stake = rd0 ? rd0.stake : bet.value();
    const r = ctx.run(() => coinToss(ctx.s(), ctx.table.id, bet.value(), call), 'flip');
    if (!r) return;
    busy = true;
    audio.play('whoosh');
    const turns = 4 + (r.side === side ? 0 : 1);
    side = r.side!;
    coin.style.setProperty('--turns', String(turns));
    coin.classList.remove('spin', 'show-heads', 'show-tails');
    void coin.offsetWidth;
    coin.classList.add('spin', 'show-' + side);
    await sleep(ctx.reduced() ? 200 : 1000);
    audio.play('coin');
    history.prepend(h('i', { class: 'h-dot ' + (r.side === 'heads' ? 'gold' : 'silver'), title: r.side }));
    while (history.childElementCount > 14) history.lastElementChild?.remove();
    if (r.win && r.round) ctx.banner(`${side === 'heads' ? 'Heads' : 'Tails'}! Pot ${short(r.round.pot)}`, 'win', 1200);
    else if (r.win) ctx.reveal(r, stake, 'Ten in a row!');
    else ctx.reveal(r, stake, riding ? 'The pot is gone' : undefined);
    busy = false;
    sync();
  }

  function cash() {
    const rd = round();
    if (!rd || busy) return;
    const stake = rd.stake;
    const r = ctx.run(() => coinCollect(ctx.s()), 'cash');
    if (r) { ctx.reveal(r, stake, rd.streak >= COIN_STREAK ? `Streak of ${rd.streak}!` : undefined); sync(); }
  }

  sync();
  const el = h('div', { class: 'game coin' }, stage, potEl, h('div', { class: 'controls' }, bet.el, h('div', { class: 'actions' }, heads, tails), collect), history);
  return { el };
}

// ───────────────────────── slots ─────────────────────────

const SYM_URL = (s: SL.Sym) => art.url(`sym:${s}`);

export function slotsView(ctx: TableCtx): GameView {
  const bet = ctx.betBox({ label: 'Line bet', unit: 1 });
  let lines = 1;
  const reels: HTMLElement[] = [];
  const strips: HTMLElement[] = [];
  for (let r = 0; r < 3; r++) {
    const strip = h('div', { class: 'strip' });
    for (let k = 0; k < 3; k++) strip.append(img(SYM_URL(SL.STRIPS[r][(k + r * 5) % SL.STRIPS[r].length] as SL.Sym), 'px sym'));
    strips.push(strip);
    reels.push(h('div', { class: 'reel' }, strip));
  }
  const lineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lineSvg.setAttribute('viewBox', '0 0 300 300');
  lineSvg.setAttribute('class', 'paylines');
  const window_ = h('div', { class: 'reels' }, ...reels);
  window_.append(lineSvg);
  const jackpot = h('div', { class: 'jackpot' });
  const free = h('div', { class: 'free-spins' });
  const lineSeg = h('div', { class: 'seg' });
  for (const n of SL.LINE_CHOICES) lineSeg.append(h('button', { class: n === lines ? 'on' : '', onclick: (e: MouseEvent) => { lines = n; audio.play('tap'); lineSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); drawLines([]); total(); } }, `${n} line${n > 1 ? 's' : ''}`));
  const totalEl = h('span', { class: 'muted' });
  const total = () => { totalEl.textContent = `Total ${fmtN(bet.value() * lines)}`; };
  const spinBtn = h('button', { class: 'btn primary spin-btn', onclick: () => void spin() }, 'Spin');
  let auto = 0;
  const autoBtn = h('button', { class: 'btn', onclick: () => { auto = auto ? 0 : 10; autoBtn.classList.toggle('on', !!auto); autoBtn.textContent = auto ? 'Stop' : 'Auto ×10'; if (auto && !busy) void spin(); } }, 'Auto ×10');
  let busy = false;

  function drawLines(won: number[]) {
    lineSvg.replaceChildren();
    const ys = [50, 150, 250];
    const cols = ['#ffd040', '#ff6a8a', '#6ad8ff', '#8aff7a', '#d88aff'];
    for (let i = 0; i < lines; i++) {
      const L = SL.LINES[i];
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', L.map((row, r) => `${50 + r * 100},${ys[row]}`).join(' '));
      pl.setAttribute('class', won.includes(i) ? 'won' : '');
      pl.setAttribute('stroke', cols[i]);
      lineSvg.append(pl);
    }
  }

  const sync = () => {
    const s = ctx.s();
    jackpot.replaceChildren(img(art.url('sym:K'), 'px'), h('span', { class: 'caps', text: 'Crown jackpot' }), h('span', { class: 'num', text: fmtN(s.jackpot) }));
    const rd = s.rounds.slots as SlotRound | undefined;
    free.textContent = rd && rd.free > 0 ? `★ ${rd.free} free spin${rd.free > 1 ? 's' : ''} · won ${fmtN(rd.freeWon)}` : '';
    spinBtn.textContent = rd && rd.free > 0 ? 'Free spin' : 'Spin';
    total();
  };

  async function spin() {
    if (busy) return;
    const s = ctx.s();
    const freeNow = ((s.rounds.slots as SlotRound | undefined)?.free ?? 0) > 0;
    const stake = freeNow ? 0 : bet.value() * lines;
    const r = ctx.run(() => slotSpin(ctx.s(), ctx.table.id, bet.value(), lines), 'reel');
    if (!r) { auto = 0; autoBtn.classList.remove('on'); autoBtn.textContent = 'Auto ×10'; return; }
    busy = true;
    drawLines([]);
    const res = r.spin!;
    // spin each reel, stopping left to right
    const fast = ctx.reduced();
    await Promise.all(strips.map(async (strip, ri) => {
      const sym = SL.STRIPS[ri];
      const n = fast ? 3 : 14 + ri * 6;
      const seq: SL.Sym[] = [];
      for (let k = 0; k < n; k++) seq.push(sym[Math.floor(Math.random() * sym.length)] as SL.Sym);
      seq.push(...res.window[ri]);
      strip.replaceChildren(...seq.map((x) => img(SYM_URL(x), 'px sym')));
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      void strip.offsetWidth;
      const dur = fast ? 150 : 700 + ri * 380;
      strip.style.transition = `transform ${dur}ms cubic-bezier(.2,.9,.3,1.04)`;
      strip.style.transform = `translateY(-${(n / (n + 3)) * 100}%)`;
      await sleep(dur);
      audio.play('reel', 1 + ri * 0.08);
      strip.replaceChildren(...res.window[ri].map((x) => img(SYM_URL(x), 'px sym')));
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
    }));
    drawLines(res.lines.map((l) => l.line));
    for (const l of res.lines) {
      const L = SL.LINES[l.line];
      L.forEach((row, ri) => strips[ri].children[row]?.classList.add('hit'));
    }
    if (res.scatter >= 3) for (const st of strips) for (const c of st.children) if ((c as HTMLImageElement).src === SYM_URL('S')) c.classList.add('hit');
    if (r.jackpot) { audio.play('jackpot'); ctx.banner(`JACKPOT! ${fmtN(r.jackpot)}`, 'big', 3200); }
    if (res.freeSpins) ctx.banner(`Free spins! +${res.freeSpins}`, 'big', 1600);
    ctx.reveal(r, stake, r.jackpot ? 'Crown jackpot!' : undefined);
    busy = false;
    sync();
    const left = (ctx.s().rounds.slots as SlotRound | undefined)?.free ?? 0;
    if (!ctx.closed() && (left > 0 || auto > 1)) {
      if (left <= 0) auto--;
      await sleep(fast ? 250 : 650);
      if (!ctx.closed() && (left > 0 || auto > 0)) void spin();
    } else { auto = 0; autoBtn.classList.remove('on'); autoBtn.textContent = 'Auto ×10'; }
  }

  const pays = h('div', { class: 'paytable mini' },
    ...([['7', '7 7 7', SL.PAYS['7']], ['R', 'Bar ×3', SL.PAYS.R], ['B', 'Bell ×3', SL.PAYS.B], ['L', 'Lemon ×3', SL.PAYS.L], ['C', 'Cherry ×3', SL.PAYS.C], ['D', 'Diamonds ×3', SL.PAYS.D]] as [SL.Sym, string, number][])
      .map(([sym, name, pay]) => h('span', { class: 'pt' }, img(SYM_URL(sym), 'px'), h('span', { text: name }), h('b', { class: 'num', text: `${pay}×` }))),
    h('span', { class: 'pt' }, img(SYM_URL('C'), 'px'), h('span', { text: 'Cherry first · two' }), h('b', { class: 'num', text: '1× · 2×' })),
    h('span', { class: 'pt' }, img(SYM_URL('D'), 'px'), h('span', { text: 'Wild, doubles' }), h('b', { class: 'num', text: '×2' })),
    h('span', { class: 'pt' }, img(SYM_URL('S'), 'px'), h('span', { text: '3 anywhere' }), h('b', { class: 'num', text: `${SL.FREE_SPINS} free` })));
  bet.el.addEventListener('click', total);
  ctx.onFrame(() => { const j = ctx.s().jackpot; const n = jackpot.querySelector('.num'); if (n && n.textContent !== fmtN(j)) n.textContent = fmtN(j); });
  sync();
  drawLines([]);
  void maxBet;
  const el = h('div', { class: 'game slots' }, jackpot, h('div', { class: 'cabinet' }, window_), free, h('div', { class: 'controls' }, bet.el, h('div', { class: 'row-c' }, lineSeg, totalEl), h('div', { class: 'actions' }, autoBtn, spinBtn)), pays);
  return { el };
}

// ───────────────────────── dice ─────────────────────────

export function diceView(ctx: TableCtx): GameView {
  let target = 5000, over = true;
  const bet = ctx.betBox({ onChange: () => info() });
  const roll = h('div', { class: 'dice-roll num', text: '50.00' });
  const slider = h('input', { type: 'range', min: '200', max: '9800', step: '100', value: String(target), class: 'dice-slider' }) as HTMLInputElement;
  const track = h('div', { class: 'dice-track' }, slider);
  const chance = h('span', { class: 'num' }), mult = h('span', { class: 'num' }), payout = h('span', { class: 'num' });
  const dirSeg = h('div', { class: 'seg' },
    h('button', { class: 'on', onclick: (e: MouseEvent) => setDir(true, e) }, 'Roll over'),
    h('button', { onclick: (e: MouseEvent) => setDir(false, e) }, 'Roll under'));
  const history = h('div', { class: 'history' });
  let busy = false;
  function setDir(o: boolean, e: MouseEvent) { over = o; audio.play('tap'); dirSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); info(); }
  function info() {
    const c = diceChance(target, over), m = diceMult(target, over);
    chance.textContent = (c * 100).toFixed(2) + '%';
    mult.textContent = m.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '×';
    payout.textContent = fmtN(bet.value() * m);
    track.style.setProperty('--t', String(target / 10000));
    track.classList.toggle('under', !over);
  }
  slider.addEventListener('input', () => { target = +slider.value; info(); if (Math.random() < 0.5) audio.play('tick'); });
  const presets = h('div', { class: 'chips' }, ...[[5000, true, '2×'], [7550, true, '4×'], [9020, true, '10×'], [9804, true, '50×']].map(([t, o, label]) => h('button', { class: 'rchip', onclick: () => { target = Math.min(9800, t as number); over = o as boolean; slider.value = String(target); info(); audio.play('tap'); } }, label as string)));

  async function go() {
    if (busy) return;
    const stake = bet.value();
    const r = ctx.run(() => diceRoll(ctx.s(), ctx.table.id, stake, target, over), 'dice');
    if (!r) return;
    busy = true;
    const end = performance.now() + (ctx.reduced() ? 100 : 700);
    while (performance.now() < end) { roll.textContent = (Math.random() * 100).toFixed(2); await sleep(40); }
    roll.textContent = (r.roll! / 100).toFixed(2);
    roll.classList.toggle('win', !!r.win);
    roll.classList.toggle('lose', !r.win);
    track.style.setProperty('--r', String(r.roll! / 10000));
    track.classList.add('rolled');
    history.prepend(h('span', { class: 'h-roll ' + (r.win ? 'win' : 'lose'), text: (r.roll! / 100).toFixed(2) }));
    while (history.childElementCount > 10) history.lastElementChild?.remove();
    ctx.reveal(r, stake);
    busy = false;
  }
  info();
  const el = h('div', { class: 'game dice' },
    h('div', { class: 'felt dice-felt' }, roll, track),
    h('div', { class: 'dice-info' }, h('div', {}, h('span', { class: 'caps', text: 'Chance' }), chance), h('div', {}, h('span', { class: 'caps', text: 'Pays' }), mult), h('div', {}, h('span', { class: 'caps', text: 'Win' }), payout)),
    h('div', { class: 'controls' }, h('div', { class: 'row-c' }, dirSeg, presets), bet.el, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => void go() }, 'Roll'))),
    history);
  return { el };
}

// ───────────────────────── scratch ─────────────────────────

const TIER_ICON: Record<TicketId, string[]> = {
  bronze: ['chip:0', 'chip:1', 'chip:2', 'tok:clover', 'tok:horseshoe', 'sym:7', 'sym:K'],
  silver: ['chip:1', 'chip:2', 'tok:horseshoe', 'tok:moon', 'sym:7', 'sym:K'],
  gold: ['chip:5', 'tok:star', 'sym:7', 'tok:crown', 'sym:K'],
};

export function scratchView(ctx: TableCtx): GameView {
  let ticket: TicketId = 'bronze';
  const bet = ctx.betBox({ label: 'Card unit', onChange: () => sync() });
  const tSeg = h('div', { class: 'seg' });
  for (const t of TICKETS) tSeg.append(h('button', { class: t.id === ticket ? 'on' : '', onclick: (e: MouseEvent) => { ticket = t.id; audio.play('tap'); tSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); sync(); } }, t.name.split(' ')[0]));
  const card = h('div', { class: 'scratch-card bronze' });
  const prizes = h('div', { class: 'paytable mini' });
  const buy = h('button', { class: 'btn primary', onclick: () => purchase() }, 'Buy card');
  const all = h('button', { class: 'btn', onclick: () => revealAll() }, 'Scratch all');
  let pending: { r: ReturnType<typeof scratchBuy>; price: number; left: number } | null = null;

  function sync() {
    const t = TICKET[ticket];
    buy.textContent = `Buy · ${fmtN(bet.value() * t.price)}`;
    card.className = 'scratch-card ' + ticket;
    prizes.replaceChildren(...t.prizes.map(([m, p], i) => h('span', { class: 'pt' }, img(art.url(TIER_ICON[ticket][i]), 'px'), h('b', { class: 'num', text: `${m}×` }), h('span', { class: 'muted', text: p >= 0.01 ? `1 in ${Math.round(1 / p)}` : `1 in ${fmtN(1 / p)}` }))));
    all.style.display = pending ? '' : 'none';
    buy.style.display = pending ? 'none' : '';
    if (!pending && !card.childElementCount) for (let i = 0; i < 9; i++) card.append(h('div', { class: 'cell covered' }));
  }

  function purchase() {
    if (pending) return;
    const r = ctx.run(() => scratchBuy(ctx.s(), ctx.table.id, bet.value(), ticket), 'card');
    if (!r) return;
    pending = { r, price: r.price!, left: 9 };
    card.replaceChildren(...r.card!.cells.map((tier, i) => {
      const cell = h('button', { class: 'cell covered', onclick: () => scratch(cell, tier, i) });
      return cell;
    }));
    sync();
  }

  function scratch(cell: HTMLElement, tier: number, _i: number) {
    if (!pending || !cell.classList.contains('covered')) return;
    cell.classList.remove('covered');
    cell.classList.add('shown');
    cell.replaceChildren(img(art.url(TIER_ICON[ticket][tier]), 'px'), h('span', { class: 'num', text: `${TICKET[ticket].prizes[tier][0]}×` }));
    if (pending.r.card!.tier === tier) cell.classList.add('match');
    audio.play('flip', 0.8 + Math.random() * 0.4);
    pending.left--;
    if (pending.left === 0) finish();
  }

  function revealAll() {
    if (!pending) return;
    const cells = [...card.children] as HTMLElement[];
    cells.forEach((c, i) => window.setTimeout(() => c.click(), i * (ctx.reduced() ? 10 : 70)));
  }

  function finish() {
    if (!pending) return;
    const p = pending;
    pending = null;
    card.classList.toggle('winner', (p.r.ret ?? 0) > 0);
    ctx.reveal(p.r, p.price, p.r.card!.win ? `Three alike: ${p.r.card!.win}×` : undefined);
    sync();
  }

  sync();
  const el = h('div', { class: 'game scratch' }, card, h('div', { class: 'controls' }, tSeg, bet.el, h('div', { class: 'actions' }, all, buy)), prizes);
  return { el };
}
