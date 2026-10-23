import * as Q from '../../core/games/quick';
import * as T from '../../core/games/tables';
import { type CrashRound, type MinesRound, crashEnd, crashStart, derbyBet, derbyRound, kenoPlay, minesCash, minesPick, minesStart } from '../../core/play';
import { perkRank } from '../../core/state';
import { audio } from '../../platform/audio';
import { art } from '../../render/artpack';
import { h, img } from '../dom';
import { type GameView, type TableCtx, artImage, ease, fmtN, pixelCanvas, sleep } from './common';

const TAU = Math.PI * 2;

// ───────────────────────── gem mines ─────────────────────────

const GEMS = ['as/default_diamond', 'tok:emerald', 'tok:ruby', 'sym:D'];

export function minesView(ctx: TableCtx): GameView {
  let mines = 3;
  const bet = ctx.betBox();
  const grid = h('div', { class: 'mine-grid' });
  const info = h('div', { class: 'mine-info' });
  const slider = h('input', { type: 'range', min: '1', max: '24', value: String(mines), class: 'mine-slider' }) as HTMLInputElement;
  const minesLbl = h('span', { class: 'num' });
  const start = h('button', { class: 'btn primary', onclick: () => go() }, 'Dig');
  const cash = h('button', { class: 'btn primary', onclick: () => cashOut() }, 'Cash out');
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < Q.MINES_CELLS; i++) {
    const c = h('button', { class: 'mine-cell', onclick: () => pick(i) }) as HTMLButtonElement;
    cells.push(c);
    grid.append(c);
  }
  const round = () => ctx.s().rounds.mines as MinesRound | undefined;
  slider.addEventListener('input', () => { mines = +slider.value; audio.play('tick'); sync(); });

  function sync() {
    const rd = round();
    const active = !!rd?.active;
    minesLbl.textContent = `${active ? rd!.mines : mines} dud${(active ? rd!.mines : mines) > 1 ? 's' : ''}`;
    slider.disabled = active;
    start.style.display = active ? 'none' : '';
    cash.style.display = active ? '' : 'none';
    bet.el.style.display = active ? 'none' : '';
    const m = active ? rd!.mines : mines;
    const opened = active ? rd!.open.length : 0;
    const cur = Q.minesMult(m, opened), next = opened < Q.MINES_CELLS - m ? Q.minesMult(m, opened + 1) : cur;
    const stake = active ? rd!.bet : bet.value();
    info.replaceChildren(
      h('div', {}, h('span', { class: 'caps', text: 'Now' }), h('b', { class: 'num', text: `${cur.toFixed(2)}× · ${fmtN(stake * cur)}` })),
      h('div', {}, h('span', { class: 'caps', text: 'Next gem' }), h('b', { class: 'num', text: `${next.toFixed(2)}×` })),
      h('div', {}, h('span', { class: 'caps', text: 'Safe' }), h('b', { class: 'num', text: `${(((Q.MINES_CELLS - m - opened) / (Q.MINES_CELLS - opened)) * 100).toFixed(0)}%` })));
    cash.textContent = opened ? `Cash out ${fmtN(stake * cur)}` : 'Cash out';
    cash.toggleAttribute('disabled', !opened);
  }

  function paint(showAll: boolean) {
    const rd = round();
    cells.forEach((c, i) => {
      const open = !!rd && rd.open.includes(i);
      const dud = !!rd && rd.layout.includes(i);
      c.className = 'mine-cell' + (open ? ' gem' : '') + (showAll && dud ? ' dud' : '') + (rd && rd.busted === i ? ' boom' : '') + (showAll && !open && !dud ? ' ghost' : '');
      c.replaceChildren();
      if (open || (showAll && !dud)) c.append(img(art.url(GEMS[i % GEMS.length].startsWith('as/') ? 'ui:gem' : GEMS[i % GEMS.length]), 'px'));
      else if (showAll && dud) c.append(h('span', { class: 'dud-face', text: '✖' }));
    });
  }

  function go() {
    const r = ctx.run(() => minesStart(ctx.s(), ctx.table.id, bet.value(), mines), 'chip');
    if (!r) return;
    paint(false);
    sync();
  }

  function pick(i: number) {
    const rd = round();
    if (!rd?.active) return;
    const r = ctx.run(() => minesPick(ctx.s(), i), 'tap');
    if (!r) return;
    if (r.bust) {
      audio.play('pop');
      paint(true);
      ctx.reveal(r, rd.bet, 'A dud!');
    } else {
      audio.play('coin', 1 + rd.open.length * 0.04);
      paint(false);
      if (!round()?.active) { paint(true); ctx.reveal(r, rd.bet, 'Cleared the mine!'); }
    }
    sync();
  }

  function cashOut() {
    const rd = round();
    if (!rd?.active) return;
    const r = ctx.run(() => minesCash(ctx.s()), 'cash');
    if (!r) return;
    paint(true);
    ctx.reveal(r, rd.bet, `${r.mult}×`);
    sync();
  }

  paint(false);
  sync();
  const el = h('div', { class: 'game mines' }, h('div', { class: 'felt mine-felt' }, grid), info, h('div', { class: 'controls' }, h('div', { class: 'row-c' }, h('span', { class: 'caps', text: 'Duds' }), slider, minesLbl), bet.el, h('div', { class: 'actions' }, start, cash)));
  return { el };
}

// ───────────────────────── keno ─────────────────────────

export function kenoView(ctx: TableCtx): GameView {
  const bet = ctx.betBox();
  const picks = new Set<number>();
  const board = h('div', { class: 'keno-board' });
  const nums: HTMLButtonElement[] = [];
  const pays = h('div', { class: 'paytable mini keno-pays' });
  let busy = false;
  for (let n = 1; n <= Q.KENO_NUMBERS; n++) {
    const b = h('button', { class: 'kn', onclick: () => toggle(n) }, String(n)) as HTMLButtonElement;
    nums.push(b);
    board.append(b);
  }
  function toggle(n: number) {
    if (busy) return;
    if (picks.has(n)) picks.delete(n);
    else if (picks.size < 10) picks.add(n);
    else { ctx.banner('Ten numbers at most', 'info', 900); return; }
    audio.play('tap', 0.9 + picks.size * 0.04);
    clearMarks();
    sync();
  }
  function clearMarks() { for (const b of nums) b.classList.remove('drawn', 'hit'); }
  function sync() {
    nums.forEach((b, i) => b.classList.toggle('pick', picks.has(i + 1)));
    const n = picks.size;
    pays.replaceChildren(...(n ? Q.KENO_PAY[n].map((m, hits) => (m > 0 ? h('span', { class: 'pt' }, h('span', { text: `${hits} hit${hits === 1 ? '' : 's'}` }), h('b', { class: 'num', text: `${m}×` })) : null)).filter(Boolean) as HTMLElement[] : [h('span', { class: 'muted', text: 'Pick 1 to 10 numbers.' })]));
    play.textContent = n ? `Play ${n} spot${n > 1 ? 's' : ''}` : 'Play';
  }
  async function go() {
    if (busy) return;
    const stake = bet.value();
    const r = ctx.run(() => kenoPlay(ctx.s(), ctx.table.id, stake, [...picks]), 'chip');
    if (!r) return;
    busy = true;
    clearMarks();
    for (const n of r.drawn!) {
      const b = nums[n - 1];
      b.classList.add('drawn');
      if (picks.has(n)) { b.classList.add('hit'); audio.play('coin', 1.1); } else audio.play('tick');
      await sleep(ctx.reduced() ? 20 : 170);
    }
    ctx.reveal(r, stake, `${r.hits} of ${picks.size} caught`);
    busy = false;
  }
  const quick = h('button', { class: 'btn', onclick: () => { if (busy) return; picks.clear(); const k = Math.max(1, Math.min(10, [...picks].length || 6)); while (picks.size < k) picks.add(1 + Math.floor(Math.random() * Q.KENO_NUMBERS)); audio.play('chip'); clearMarks(); sync(); } }, 'Quick pick');
  const clr = h('button', { class: 'btn', onclick: () => { if (busy) return; picks.clear(); clearMarks(); sync(); audio.play('tap'); } }, 'Clear');
  const play = h('button', { class: 'btn primary', onclick: () => void go() }, 'Play');
  sync();
  const el = h('div', { class: 'game keno' }, h('div', { class: 'felt keno-felt' }, board), pays, h('div', { class: 'controls' }, bet.el, h('div', { class: 'actions' }, clr, quick, play)));
  return { el };
}

// ───────────────────────── airship ascent ─────────────────────────

export function crashView(ctx: TableCtx): GameView {
  const bet = ctx.betBox();
  const W = 320, H = 200;
  const { el: canvas, g } = pixelCanvas(W, H, 'crash-sky');
  const multEl = h('div', { class: 'crash-mult num', text: '1.00×' });
  const autoIn = h('input', { type: 'number', min: '1.01', step: '0.1', value: '2', class: 'auto-in' }) as HTMLInputElement;
  const autoOn = h('button', { class: 'toggle', 'aria-label': 'Auto cash-out', onclick: () => { autoOn.classList.toggle('on'); audio.play('tap'); } });
  const launch = h('button', { class: 'btn primary', onclick: () => go() }, 'Launch');
  const cashBtn = h('button', { class: 'btn primary cash', onclick: () => cash() }, 'Cash out');
  const history = h('div', { class: 'history' });
  const ship = artImage('ship:0');
  let flying = false, t0 = 0, stake = 0, burstAt = 0, curM = 1, ended = false;
  let trail: [number, number][] = [];

  function draw(m: number, popped: boolean) {
    g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a2a5a'); sky.addColorStop(1, '#6a8ad0');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // clouds slide by as we climb
    const alt = Math.log(m) * 120;
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) { const y = ((i * 53 + alt) % (H + 40)) - 20; g.fillRect((i * 97) % W, y, 50, 8); g.fillRect((i * 97) % W + 10, y - 5, 30, 6); }
    // curve
    const max = Math.max(2, m * 1.25), tmax = Q.crashTime(max);
    g.strokeStyle = popped ? '#ff6a5a' : '#8aff9a'; g.lineWidth = 3; g.beginPath();
    trail.forEach(([tt, mm], i) => { const x = 10 + (tt / tmax) * (W - 60), y = H - 14 - ((mm - 1) / (max - 1)) * (H - 50); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    const last = trail[trail.length - 1] ?? [0, 1];
    const x = 10 + (last[0] / tmax) * (W - 60), y = H - 14 - ((last[1] - 1) / (max - 1)) * (H - 50);
    if (!popped && ship.complete && ship.naturalWidth) g.drawImage(ship, x - ship.naturalWidth / 4, y - ship.naturalHeight / 2, ship.naturalWidth / 2, ship.naturalHeight / 2);
    if (popped) { g.fillStyle = '#ffb04a'; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.fillRect(x + Math.cos(a) * 14, y + Math.sin(a) * 14, 4, 4); } }
  }

  ctx.onFrame(() => {
    if (!flying) return;
    const tt = (performance.now() - t0) / 1000;
    const m = Math.max(1, Q.crashCurve(tt));
    const rd = ctx.s().rounds.crash as CrashRound | undefined;
    const auto = rd?.auto ?? 0;
    if (auto && m >= auto && auto <= burstAt) { curM = auto; end(auto); return; }
    if (m >= burstAt) { curM = burstAt; end(0); return; }
    curM = m;
    trail.push([tt, m]);
    multEl.textContent = m.toFixed(2) + '×';
    multEl.className = 'crash-mult num' + (m >= 2 ? ' hot' : '');
    cashBtn.textContent = `Cash out ${fmtN(stake * m)}`;
    draw(m, false);
  });

  function sync() {
    launch.style.display = flying ? 'none' : '';
    cashBtn.style.display = flying ? '' : 'none';
    bet.el.style.display = flying ? 'none' : '';
    const rd = ctx.s().rounds.crash as CrashRound | undefined;
    history.replaceChildren(...(rd?.history ?? []).slice().reverse().map((b) => h('span', { class: 'h-roll ' + (b >= 2 ? 'win' : 'lose'), text: b.toFixed(2) + '×' })));
  }

  function go() {
    if (flying) return;
    stake = bet.value();
    const auto = autoOn.classList.contains('on') ? Math.max(1.01, +autoIn.value || 0) : 0;
    const r = ctx.run(() => crashStart(ctx.s(), ctx.table.id, stake, auto), 'whoosh');
    if (!r) return;
    burstAt = r.round!.burst;
    flying = true; ended = false; t0 = performance.now(); trail = [[0, 1]]; curM = 1;
    if (ctx.reduced()) t0 -= Q.crashTime(Math.min(burstAt, auto || burstAt)) * 1000 * 0.9;
    sync();
  }

  function cash() { if (flying && !ended) end(curM); }

  function end(at: number) {
    if (ended) return;
    ended = true;
    flying = false;
    const r = ctx.run(() => crashEnd(ctx.s(), at), at ? 'cash' : 'pop');
    if (!r) { sync(); return; }
    multEl.textContent = (r.won ? r.at! : r.burst!).toFixed(2) + '×';
    multEl.className = 'crash-mult num ' + (r.won ? 'won' : 'lost');
    if (!r.won) { audio.play('pop'); draw(r.burst!, true); }
    ctx.reveal(r, stake, r.won ? `Cashed out at ${r.at!.toFixed(2)}×` : `Burst at ${r.burst!.toFixed(2)}×`);
    sync();
  }

  // a flight left in the air when the table was closed simply bursts
  const pending = ctx.s().rounds.crash as CrashRound | undefined;
  if (pending?.active) { stake = pending.bet; burstAt = pending.burst; flying = true; ended = false; t0 = performance.now(); trail = [[0, 1]]; }
  ctx.onClose(() => { if (flying && !ended) end(curM); });
  draw(1, false);
  sync();
  const el = h('div', { class: 'game crash' }, h('div', { class: 'felt crash-felt' }, canvas, multEl), history,
    h('div', { class: 'controls' }, h('div', { class: 'row-c' }, h('span', { class: 'caps', text: 'Auto cash-out' }), autoOn, autoIn, h('span', { class: 'muted', text: '×' })), bet.el, h('div', { class: 'actions' }, launch, cashBtn)));
  return { el };
}

// ───────────────────────── sky derby ─────────────────────────

export function derbyView(ctx: TableCtx): GameView {
  const bet = ctx.betBox();
  let pick = 0, kind: 'win' | 'place' = 'win';
  const card = h('div', { class: 'race-card' });
  const W = 320, H = 168;
  const { el: canvas, g } = pixelCanvas(W, H, 'race');
  let pos: number[] = [0, 0, 0, 0, 0, 0];
  let busy = false;
  const kindSeg = h('div', { class: 'seg' },
    h('button', { class: 'on', onclick: (e: MouseEvent) => setKind('win', e) }, 'To win'),
    h('button', { onclick: (e: MouseEvent) => setKind('place', e) }, 'To place (top 2)'));
  function setKind(k: 'win' | 'place', e: MouseEvent) { kind = k; audio.play('tap'); kindSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); drawCard(); }

  function drawCard() {
    const rd = derbyRound(ctx.s());
    const scout = perkRank(ctx.s(), 'scout') > 0;
    card.replaceChildren(h('div', { class: 'caps', text: `Race ${rd.race}` }), ...rd.card.field.map((e, i) => {
      const f = T.FLYERS[e.flyer];
      const odds = T.derbyOdds(kind === 'win' ? e.p : e.place);
      return h('button', { class: 'runner' + (i === pick ? ' on' : ''), onclick: () => { pick = i; audio.play('tap'); drawCard(); } },
        h('i', { class: 'silk', style: `background:#${f.color.toString(16).padStart(6, '0')}` }), h('span', { class: 'nm', text: f.name }),
        scout ? h('span', { class: 'muted', text: `${Math.round((kind === 'win' ? e.p : e.place) * 100)}%` }) : null,
        h('b', { class: 'num', text: odds.toFixed(2) }));
    }));
  }

  function draw(order?: number[]) {
    const rd = derbyRound(ctx.s());
    g.fillStyle = '#4a8a3a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c8a870' : '#d8b880'; g.fillRect(0, 8 + i * 25, W, 23); }
    g.fillStyle = '#f8f4ec'; for (let y = 8; y < H - 8; y += 6) g.fillRect(W - 30, y, 4, 3);
    g.fillStyle = '#ffffff'; g.fillRect(18, 8, 2, H - 16);
    rd.card.field.forEach((e, i) => {
      const f = T.FLYERS[e.flyer];
      const x = 20 + pos[i] * (W - 60), y = 14 + i * 25;
      const flap = Math.sin(performance.now() / 70 + i) > 0 ? 0 : 3;
      g.fillStyle = '#' + f.color.toString(16).padStart(6, '0');
      g.fillRect(x, y + 4, 16, 9); g.fillRect(x + 12, y + 1, 7, 7);
      g.fillStyle = '#f0a020'; g.fillRect(x + 19, y + 4, 4, 2);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x + 3, y + 2 + flap, 8, 3);
      g.fillStyle = '#1a1a24'; g.fillRect(x + 16, y + 3, 1, 1);
      if (order) { const place = order.indexOf(i); if (place < 3 && pos[i] >= 1) { g.fillStyle = ['#f0c040', '#d0d8e0', '#c87a3a'][place]; g.font = 'bold 11px Atkinson, sans-serif'; g.fillText(String(place + 1), W - 22, y + 12); } }
      if (i === pick) { g.strokeStyle = '#ffffff'; g.strokeRect(x - 2, y - 1, 26, 17); }
    });
  }

  async function go() {
    if (busy) return;
    const stake = bet.value();
    const r = ctx.run(() => derbyBet(ctx.s(), ctx.table.id, pick, kind, stake), 'bell');
    if (!r) return;
    busy = true;
    const order = r.order!;
    // the field races with surges; finishing times follow the result
    const finish = order.map(() => 0);
    order.forEach((idx, place) => { finish[idx] = 1 + place * 0.06 + Math.random() * 0.03; });
    const dur = ctx.reduced() ? 400 : 5200, t0 = performance.now();
    const save = derbyRound(ctx.s()).card;
    derbyRound(ctx.s()).card = r.card!; // draw the race just run
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        const t = (now - t0) / dur;
        pos = finish.map((fin, i) => Math.min(1, ease(t / fin) + Math.sin(t * 9 + i * 2) * 0.012 * (1 - t)));
        draw(order);
        if (Math.random() < 0.05) audio.play('tick');
        if (t < Math.max(...finish) && !ctx.closed()) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    pos = finish.map(() => 1);
    draw(order);
    const winner = T.FLYERS[r.card!.field[order[0]].flyer].name;
    ctx.reveal(r, stake, `${winner} wins!`);
    derbyRound(ctx.s()).card = save;
    await sleep(ctx.reduced() ? 100 : 1600);
    pos = [0, 0, 0, 0, 0, 0];
    pick = 0;
    drawCard();
    draw();
    busy = false;
  }

  drawCard();
  draw();
  const el = h('div', { class: 'game derby' }, h('div', { class: 'felt derby-felt' }, canvas), card, h('div', { class: 'controls' }, kindSeg, bet.el, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => void go() }, 'Start the race'))));
  return { el };
}
