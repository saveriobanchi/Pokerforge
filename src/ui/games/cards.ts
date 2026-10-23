import * as BJ from '../../core/games/blackjack';
import { HAND_NAMES, best, category } from '../../core/games/cards';
import * as T from '../../core/games/tables';
import { bacPlay, bacRound, bjAct, bjDeal, bjRound, holdemDecide, holdemStart, vpFinish, vpStart, vpToggle } from '../../core/play';
import { perkRank } from '../../core/state';
import { audio } from '../../platform/audio';
import { h } from '../dom';
import { type GameView, type TableCtx, cardImg, chipFor, chipImg, flipTo, fmtN, short, sleep } from './common';

const dealt = (card: number, delay: number, down = false) => {
  const el = cardImg(down ? -1 : card, 'deal');
  el.style.animationDelay = `${delay}ms`;
  window.setTimeout(() => audio.play('card', 0.9 + Math.random() * 0.2), delay);
  return el;
};

// ───────────────────────── blackjack ─────────────────────────

export function blackjackView(ctx: TableCtx): GameView {
  const bet = ctx.betBox();
  const dealerRow = h('div', { class: 'hand dealer' });
  const dealerTot = h('div', { class: 'total' });
  const handsEl = h('div', { class: 'hands' });
  const countEl = h('div', { class: 'count muted' });
  const hit = h('button', { class: 'btn', onclick: () => act('hit') }, 'Hit');
  const stand = h('button', { class: 'btn', onclick: () => act('stand') }, 'Stand');
  const dbl = h('button', { class: 'btn', onclick: () => act('double') }, 'Double');
  const split = h('button', { class: 'btn', onclick: () => act('split') }, 'Split');
  const deal = h('button', { class: 'btn primary', onclick: () => void doDeal() }, 'Deal');
  let busy = false;
  let shownDealer = 0;
  let shownHands: number[] = [];
  let stakeNow = 0;

  const sense = () => perkRank(ctx.s(), 'cardsense') > 0;
  const counter = () => perkRank(ctx.s(), 'counter') > 0;

  function render(full: boolean) {
    const rd = bjRound(ctx.s());
    const playing = rd.phase === 'play';
    // dealer: hole card face down while playing
    if (full) { dealerRow.replaceChildren(); shownDealer = 0; }
    rd.dealer.forEach((c, i) => {
      if (i < shownDealer) {
        const el = dealerRow.children[i] as HTMLImageElement;
        if (i === 1 && !playing && el.dataset.card === '-1') flipTo(el, c);
        return;
      }
      dealerRow.append(dealt(c, (i - shownDealer) * 220 + (full ? 0 : 300), i === 1 && playing));
    });
    shownDealer = rd.dealer.length;
    const dt = BJ.handTotal(playing ? [rd.dealer[0]] : rd.dealer);
    dealerTot.textContent = rd.dealer.length ? (playing ? `Shows ${dt.total}` : `Dealer ${dt.total}${dt.total > 21 ? ' · bust' : ''}`) : '';
    // player hands
    if (full || rd.hands.length !== shownHands.length) { handsEl.replaceChildren(); shownHands = rd.hands.map(() => 0); }
    rd.hands.forEach((hd, hi) => {
      let box = handsEl.children[hi] as HTMLElement | undefined;
      if (!box) { box = h('div', { class: 'hand-box' }, h('div', { class: 'hand' }), h('div', { class: 'total' }), h('div', { class: 'stake' })); handsEl.append(box); }
      const row = box.children[0] as HTMLElement;
      for (let i = shownHands[hi]; i < hd.cards.length; i++) row.append(dealt(hd.cards[i], (i - shownHands[hi]) * 220 + (full && i < 2 ? i * 220 : 0)));
      shownHands[hi] = hd.cards.length;
      const t = BJ.handTotal(hd.cards);
      (box.children[1] as HTMLElement).textContent = BJ.isBlackjack(hd) ? 'Blackjack!' : `${t.soft && t.total < 21 ? 'Soft ' : ''}${t.total}${t.total > 21 ? ' · bust' : ''}`;
      (box.children[2] as HTMLElement).replaceChildren(chipImg(chipFor(hd.bet, ctx.limit())), h('span', { class: 'num', text: fmtN(hd.bet) + (hd.doubled ? ' ×2' : '') }));
      box.classList.toggle('active', playing && rd.active === hi && rd.hands.length > 1);
      const res = rd.results[hi];
      box.dataset.res = res ? res.outcome : '';
    });
    for (const b of [hit, stand, dbl, split]) b.style.display = playing ? '' : 'none';
    deal.style.display = playing ? 'none' : '';
    bet.el.style.display = playing ? 'none' : '';
    if (playing) {
      dbl.toggleAttribute('disabled', !BJ.canDouble(rd));
      split.toggleAttribute('disabled', !BJ.canSplit(rd));
      const advice = sense() ? BJ.basic(rd) : null;
      for (const [b, a] of [[hit, 'hit'], [stand, 'stand'], [dbl, 'double'], [split, 'split']] as const) b.classList.toggle('advice', advice === a);
    }
    countEl.textContent = counter() ? `Running count ${rd.count >= 0 ? '+' : ''}${rd.count} · true ${BJ.trueCount(rd).toFixed(1)} · ${Math.round(rd.shoe.length / 52)} decks left` : '';
  }

  async function doDeal() {
    if (busy) return;
    stakeNow = bet.value();
    const r = ctx.run(() => bjDeal(ctx.s(), ctx.table.id, stakeNow), 'chip');
    if (!r) return;
    busy = true;
    render(true);
    await sleep(ctx.reduced() ? 100 : 950);
    if (r.round?.phase === 'done') await finish(r);
    busy = false;
  }

  async function act(a: 'hit' | 'stand' | 'double' | 'split') {
    if (busy) return;
    const rd0 = bjRound(ctx.s());
    const extra = a === 'double' || a === 'split' ? rd0.hands[rd0.active]?.bet ?? 0 : 0;
    const r = ctx.run(() => bjAct(ctx.s(), ctx.table.id, a), a === 'stand' ? 'tap' : 'chip');
    if (!r) return;
    stakeNow += extra;
    busy = true;
    render(a === 'split');
    await sleep(ctx.reduced() ? 60 : a === 'split' ? 700 : 380);
    if (r.round?.phase === 'done') await finish(r);
    busy = false;
  }

  async function finish(r: ReturnType<typeof bjDeal>) {
    render(false);
    await sleep(ctx.reduced() ? 80 : 300 + Math.max(0, bjRound(ctx.s()).dealer.length - 2) * 260);
    const rd = bjRound(ctx.s());
    const bj = rd.results.some((x) => x.outcome === 'blackjack');
    ctx.reveal(r, stakeNow, bj ? 'Blackjack!' : rd.results.length > 1 ? rd.results.map((x) => x.outcome).join(' · ') : undefined);
  }

  render(true);
  const el = h('div', { class: 'game blackjack' },
    h('div', { class: 'felt bj-felt' }, h('div', { class: 'arc', text: 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17' }), dealerRow, dealerTot, handsEl, countEl),
    h('div', { class: 'controls' }, bet.el, h('div', { class: 'actions' }, hit, stand, dbl, split, deal)));
  return { el };
}

// ───────────────────────── video poker ─────────────────────────

export function pokerView(ctx: TableCtx): GameView {
  const bet = ctx.betBox();
  const row = h('div', { class: 'vp-hand' });
  const table = h('div', { class: 'paytable vp' }, ...T.VP_PAYS.map((p) => h('div', { class: 'pt', 'data-name': p.name }, h('span', { text: p.name }), h('b', { class: 'num', text: `${p.pay}×` }))));
  const btn = h('button', { class: 'btn primary', onclick: () => void go() }, 'Deal');
  let busy = false;
  let stake = 0;
  const round = () => ctx.s().rounds.poker as T.VpRound | undefined;

  function render(animate: boolean, changed: boolean[] = [true, true, true, true, true]) {
    const rd = round();
    if (!rd) { row.replaceChildren(...[0, 1, 2, 3, 4].map(() => cardImg(-1))); return; }
    const advice = rd.phase === 'draw' && perkRank(ctx.s(), 'cardsense') ? T.vpAdvice(rd.hand) : null;
    const kids = [...row.children] as HTMLElement[];
    rd.hand.forEach((c, i) => {
      let slot = kids[i];
      if (!slot || !slot.classList.contains('vp-slot')) {
        slot = h('button', { class: 'vp-slot', onclick: () => toggle(i) }, cardImg(-1), h('span', { class: 'held', text: 'HELD' }));
        if (kids[i]) row.replaceChild(slot, kids[i]); else row.append(slot);
      }
      const im = slot.children[0] as HTMLImageElement;
      if (changed[i]) { if (animate) { window.setTimeout(() => { flipTo(im, c); audio.play('card'); }, i * 110); } else { im.src = cardImg(c).src; im.dataset.card = String(c); } }
      slot.classList.toggle('on', rd.held[i]);
      slot.classList.toggle('advice', !!advice?.[i]);
    });
    for (const p of table.children) p.classList.toggle('hit', rd.phase === 'done' && rd.result?.name === (p as HTMLElement).dataset.name);
    btn.textContent = rd.phase === 'draw' ? 'Draw' : 'Deal';
    bet.el.style.display = rd.phase === 'draw' ? 'none' : '';
  }

  function toggle(i: number) {
    const rd = round();
    if (busy || rd?.phase !== 'draw') return;
    vpToggle(ctx.s(), i);
    audio.play('tap', rd.held[i] ? 1.2 : 0.9);
    render(false, [false, false, false, false, false]);
  }

  async function go() {
    if (busy) return;
    const rd = round();
    if (rd?.phase === 'draw') {
      const held = [...rd.held];
      const r = ctx.run(() => vpFinish(ctx.s()), 'card');
      if (!r) return;
      busy = true;
      render(true, held.map((x) => !x));
      await sleep(ctx.reduced() ? 80 : 650);
      ctx.reveal(r, stake, r.round?.result?.mult ? r.round.result.name : undefined);
      busy = false;
      return;
    }
    stake = bet.value();
    const r = ctx.run(() => vpStart(ctx.s(), ctx.table.id, stake), 'chip');
    if (!r) return;
    busy = true;
    render(true);
    await sleep(ctx.reduced() ? 60 : 600);
    busy = false;
  }

  if (round()?.phase === 'draw') stake = round()!.bet;
  render(false);
  const el = h('div', { class: 'game poker' }, table, h('div', { class: 'felt vp-felt' }, row, h('div', { class: 'muted small', text: 'Tap cards to hold them, then draw.' })), h('div', { class: 'controls' }, bet.el, h('div', { class: 'actions' }, btn)));
  return { el };
}

// ───────────────────────── baccarat ─────────────────────────

const BAC_SPOTS: { id: T.BacBet; name: string; pays: string }[] = [
  { id: 'ppair', name: 'P Pair', pays: '11:1' },
  { id: 'player', name: 'Player', pays: '1:1' },
  { id: 'tie', name: 'Tie', pays: '8:1' },
  { id: 'banker', name: 'Banker', pays: '0.95:1' },
  { id: 'bpair', name: 'B Pair', pays: '11:1' },
];

export function baccaratView(ctx: TableCtx): GameView {
  const bet = ctx.betBox({ label: 'Chip' });
  const bets: Partial<Record<T.BacBet, number>> = {};
  let last: Partial<Record<T.BacBet, number>> = {};
  const pRow = h('div', { class: 'hand' }), bRow = h('div', { class: 'hand' });
  const pTot = h('div', { class: 'total' }), bTot = h('div', { class: 'total' });
  const road = h('div', { class: 'road' });
  const countEl = h('div', { class: 'count muted' });
  const spots = h('div', { class: 'bac-spots' });
  let busy = false;
  const spotEls = new Map<T.BacBet, HTMLElement>();
  for (const sp of BAC_SPOTS) {
    const el = h('button', { class: 'bac-spot ' + sp.id, onclick: () => add(sp.id) }, h('span', { class: 'nm', text: sp.name }), h('span', { class: 'muted', text: sp.pays }), h('span', { class: 'stack' }));
    spotEls.set(sp.id, el);
    spots.append(el);
  }
  function drawSpots() {
    for (const [id, el] of spotEls) {
      const v = bets[id] ?? 0;
      (el.querySelector('.stack') as HTMLElement).replaceChildren(...(v ? [chipImg(chipFor(v, ctx.limit())), h('span', { class: 'num', text: short(v) })] : []));
      el.classList.toggle('has', v > 0);
    }
    const total = Object.values(bets).reduce((a, b) => a + (b ?? 0), 0);
    dealBtn.textContent = total ? `Deal · ${fmtN(total)}` : 'Deal';
  }
  function add(id: T.BacBet) {
    if (busy) return;
    const v = Math.min(ctx.limit(), (bets[id] ?? 0) + bet.value());
    bets[id] = v;
    audio.play('chip');
    drawSpots();
  }
  function drawRoad() {
    const rd = bacRound(ctx.s());
    road.replaceChildren(...rd.history.map((w) => h('i', { class: 'bead ' + w, text: w[0].toUpperCase() })));
    countEl.textContent = perkRank(ctx.s(), 'counter') ? `Shoe count ${rd.count >= 0 ? '+' : ''}${rd.count} · ${Math.round(rd.shoe.length / 52)} decks left` : '';
  }
  async function go() {
    if (busy) return;
    if (!Object.values(bets).some((v) => (v ?? 0) > 0)) { Object.assign(bets, last); drawSpots(); }
    const stake = Object.values(bets).reduce((a, b) => a + (b ?? 0), 0);
    const r = ctx.run(() => bacPlay(ctx.s(), ctx.table.id, { ...bets }), 'chip');
    if (!r) return;
    busy = true;
    last = { ...bets };
    const rd = r.round!;
    pRow.replaceChildren(); bRow.replaceChildren(); pTot.textContent = ''; bTot.textContent = '';
    const step = ctx.reduced() ? 40 : 420;
    for (let i = 0; i < 2; i++) { pRow.append(dealt(rd.player[i], 0)); await sleep(step); bRow.append(dealt(rd.banker[i], 0)); await sleep(step); }
    pTot.textContent = `Player ${T.bacTotal(rd.player.slice(0, 2))}`; bTot.textContent = `Banker ${T.bacTotal(rd.banker.slice(0, 2))}`;
    if (rd.player[2] !== undefined) { await sleep(step); pRow.append(dealt(rd.player[2], 0)); pTot.textContent = `Player ${T.bacTotal(rd.player)}`; }
    if (rd.banker[2] !== undefined) { await sleep(step); bRow.append(dealt(rd.banker[2], 0)); bTot.textContent = `Banker ${T.bacTotal(rd.banker)}`; }
    await sleep(step);
    spotEls.forEach((el, id) => el.classList.toggle('won', T.bacReturn(rd, id, 1) > (id === 'player' || id === 'banker' ? 1 : 0)));
    drawRoad();
    ctx.reveal(r, stake, rd.winner === 'tie' ? 'Tie!' : `${rd.winner === 'player' ? 'Player' : 'Banker'} wins ${Math.max(T.bacTotal(rd.player), T.bacTotal(rd.banker))}`);
    for (const k of Object.keys(bets)) delete bets[k as T.BacBet];
    drawSpots();
    busy = false;
  }
  const dealBtn = h('button', { class: 'btn primary', onclick: () => void go() }, 'Deal');
  const clearBtn = h('button', { class: 'btn', onclick: () => { if (busy) return; for (const k of Object.keys(bets)) delete bets[k as T.BacBet]; audio.play('tap'); drawSpots(); } }, 'Clear');
  drawSpots();
  drawRoad();
  const el = h('div', { class: 'game baccarat' },
    h('div', { class: 'felt bac-felt' }, h('div', { class: 'bac-sides' }, h('div', { class: 'side-p' }, h('div', { class: 'caps', text: 'Player' }), pRow, pTot), h('div', { class: 'side-b' }, h('div', { class: 'caps', text: 'Banker' }), bRow, bTot)), spots),
    road, countEl,
    h('div', { class: 'controls' }, bet.el, h('div', { class: 'actions' }, clearBtn, dealBtn)));
  return { el };
}

// ───────────────────────── casino hold'em ─────────────────────────

export function holdemView(ctx: TableCtx): GameView {
  const bet = ctx.betBox({ label: 'Ante', unit: 3 });
  const dealerRow = h('div', { class: 'hand' }), boardRow = h('div', { class: 'hand board' }), youRow = h('div', { class: 'hand' });
  const dealerNm = h('div', { class: 'total' }), youNm = h('div', { class: 'total' });
  const call = h('button', { class: 'btn primary', onclick: () => void decide(true) }, 'Call');
  const fold = h('button', { class: 'btn', onclick: () => void decide(false) }, 'Fold');
  const ante = h('button', { class: 'btn primary', onclick: () => void start() }, 'Ante up');
  const pays = h('div', { class: 'paytable mini' }, ...([['Royal Flush', '100:1'], ['Straight Flush', '20:1'], ['Four of a Kind', '10:1'], ['Full House', '3:1'], ['Flush', '2:1'], ['Straight or less', '1:1']] as [string, string][]).map(([n, p]) => h('span', { class: 'pt' }, h('span', { text: n }), h('b', { class: 'num', text: p }))));
  let busy = false;
  const round = () => ctx.s().rounds.holdem as T.HoldemRound | undefined;
  const handName = (cards: number[]) => HAND_NAMES[category(best(cards).score)];

  function render(fresh: boolean) {
    const rd = round();
    const open = rd?.phase === 'flop';
    call.style.display = fold.style.display = open ? '' : 'none';
    ante.style.display = open ? 'none' : '';
    bet.el.style.display = open ? 'none' : '';
    if (!rd) { for (const r of [dealerRow, youRow]) r.replaceChildren(cardImg(-1), cardImg(-1)); boardRow.replaceChildren(...[0, 1, 2, 3, 4].map(() => cardImg(-1, 'ghost'))); return; }
    if (fresh) {
      dealerRow.replaceChildren(dealt(rd.dealer[0], 0, true), dealt(rd.dealer[1], 120, true));
      youRow.replaceChildren(dealt(rd.you[0], 240), dealt(rd.you[1], 360));
      boardRow.replaceChildren(...rd.board.map((c, i) => (i < 3 ? dealt(c, 520 + i * 140) : cardImg(-1, 'ghost'))));
      dealerNm.textContent = 'Dealer';
      youNm.textContent = handName([...rd.you, ...rd.board.slice(0, 3)]);
    }
    const advice = open && perkRank(ctx.s(), 'cardsense') ? T.holdemAdvice(rd) : null;
    call.classList.toggle('advice', advice === 'call');
    fold.classList.toggle('advice', advice === 'fold');
    call.textContent = `Call ${fmtN(rd.ante * 2)}`;
  }

  async function start() {
    if (busy) return;
    const r = ctx.run(() => holdemStart(ctx.s(), ctx.table.id, bet.value()), 'chip');
    if (!r) return;
    busy = true;
    render(true);
    await sleep(ctx.reduced() ? 60 : 1000);
    busy = false;
  }

  async function decide(c: boolean) {
    if (busy) return;
    const rd0 = round();
    if (!rd0) return;
    const stake = rd0.ante * (c ? 3 : 1);
    const r = ctx.run(() => holdemDecide(ctx.s(), ctx.table.id, c), c ? 'chip' : 'tap');
    if (!r) return;
    busy = true;
    const rd = r.round!;
    const step = ctx.reduced() ? 40 : 380;
    if (c) {
      for (let i = 3; i < 5; i++) { flipTo(boardRow.children[i] as HTMLImageElement, rd.board[i]); boardRow.children[i].classList.remove('ghost'); audio.play('card'); await sleep(step); }
      for (let i = 0; i < 2; i++) { flipTo(dealerRow.children[i] as HTMLImageElement, rd.dealer[i]); audio.play('card'); await sleep(step / 2); }
      youNm.textContent = handName([...rd.you, ...rd.board]);
      dealerNm.textContent = 'Dealer: ' + handName([...rd.dealer, ...rd.board]);
      await sleep(step);
    }
    ctx.reveal(r, stake, rd.outcome);
    render(false);
    busy = false;
  }

  render(false);
  if (round()?.phase === 'flop') render(true);
  const el = h('div', { class: 'game holdem' },
    h('div', { class: 'felt holdem-felt' }, dealerNm, dealerRow, boardRow, youRow, youNm),
    h('div', { class: 'controls' }, bet.el, h('div', { class: 'muted small', text: 'Keep three antes on hand: the call is twice the ante.' }), h('div', { class: 'actions' }, fold, call, ante)),
    pays);
  return { el };
}
