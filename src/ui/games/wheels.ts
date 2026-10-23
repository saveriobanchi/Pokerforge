import * as Q from '../../core/games/quick';
import { plinkoDrop, rouletteSpin, wheelSpin } from '../../core/play';
import { audio } from '../../platform/audio';
import { h } from '../dom';
import { type GameView, type TableCtx, chipFor, chipImg, ease, fmtN, pixelCanvas, short, sleep } from './common';

const TAU = Math.PI * 2;
const RED = '#c8303a', BLACK = '#1c1c24', GREEN = '#2a9a4a', GOLD = '#f0c040', CREAM = '#f8f0dc';

// ───────────────────────── roulette ─────────────────────────

export function rouletteView(ctx: TableCtx): GameView {
  const bet = ctx.betBox({ label: 'Chip' });
  const W = 240;
  const { el: canvas, g } = pixelCanvas(W, W, 'roulette-wheel');
  let angle = 0, ballA = 0, ballR = 0.8;
  let result: number | null = null;
  const bets: Record<string, number> = {};
  let last: Record<string, number> = {};
  let busy = false;
  const cells = new Map<string, HTMLElement>();
  const resultEl = h('div', { class: 'r-result' });
  const history = h('div', { class: 'history' });

  function draw() {
    const c = W / 2, R = W / 2 - 4;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#5a3418'; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    g.fillStyle = '#8a5a2a'; g.beginPath(); g.arc(c, c, R - 6, 0, TAU); g.fill();
    const n = Q.WHEEL_ORDER.length, seg = TAU / n;
    for (let i = 0; i < n; i++) {
      const num = Q.WHEEL_ORDER[i];
      const a0 = angle + i * seg - seg / 2;
      g.fillStyle = num === 0 ? GREEN : Q.RED.has(num) ? RED : BLACK;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, R - 10, a0, a0 + seg); g.closePath(); g.fill();
      g.save(); g.translate(c, c); g.rotate(a0 + seg / 2); g.fillStyle = CREAM; g.font = 'bold 9px Atkinson, sans-serif'; g.textAlign = 'center'; g.fillText(String(num), R - 20, 3); g.restore();
    }
    g.fillStyle = '#6a4220'; g.beginPath(); g.arc(c, c, R * 0.55, 0, TAU); g.fill();
    g.fillStyle = '#b8863a'; g.beginPath(); g.arc(c, c, R * 0.42, 0, TAU); g.fill();
    for (let k = 0; k < 4; k++) { g.save(); g.translate(c, c); g.rotate(angle + k * TAU / 4); g.fillStyle = GOLD; g.fillRect(-3, -R * 0.4, 6, R * 0.8); g.restore(); }
    g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(c, c, 8, 0, TAU); g.fill();
    // ball
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c + Math.cos(ballA) * R * ballR, c + Math.sin(ballA) * R * ballR, 4.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
  }

  // the betting board
  const board = h('div', { class: 'r-board' });
  const cell = (id: string, label: string, cls: string) => {
    const el = h('button', { class: 'r-cell ' + cls, onclick: () => place(id) }, h('span', { class: 'lb', text: label }), h('span', { class: 'stack' }));
    cells.set(id, el);
    return el;
  };
  board.append(cell('n0', '0', 'zero green'));
  const nums = h('div', { class: 'r-nums' });
  for (let col = 1; col <= 12; col++) for (let row = 2; row >= 0; row--) {
    const n = col * 3 - row;
    nums.append(cell('n' + n, String(n), Q.RED.has(n) ? 'red' : 'black'));
  }
  board.append(nums, h('div', { class: 'r-cols' }, cell('c3', '2:1', 'col'), cell('c2', '2:1', 'col'), cell('c1', '2:1', 'col')));
  const outside = h('div', { class: 'r-out' }, cell('d1', '1st 12', 'out'), cell('d2', '2nd 12', 'out'), cell('d3', '3rd 12', 'out'), cell('low', '1–18', 'out'), cell('even', 'Even', 'out'), cell('red', '◆', 'out red'), cell('black', '◆', 'out black'), cell('odd', 'Odd', 'out'), cell('high', '19–36', 'out'));

  function drawBets() {
    for (const [id, el] of cells) {
      const v = bets[id] ?? 0;
      (el.querySelector('.stack') as HTMLElement).replaceChildren(...(v ? [chipImg(chipFor(v, ctx.limit())), h('span', { class: 'num', text: short(v) })] : []));
      el.classList.toggle('has', v > 0);
      el.classList.toggle('hit', result !== null && Q.rouletteCovers(id, result));
    }
    const total = Object.values(bets).reduce((a, b) => a + b, 0);
    spin.textContent = total ? `Spin · ${fmtN(total)}` : last && Object.keys(last).length ? 'Rebet & spin' : 'Spin';
  }

  function place(id: string) {
    if (busy) return;
    bets[id] = Math.min(ctx.limit(), (bets[id] ?? 0) + bet.value());
    result = null;
    audio.play('chip');
    drawBets();
  }

  async function go() {
    if (busy) return;
    if (!Object.keys(bets).length) Object.assign(bets, last);
    const stake = Object.values(bets).reduce((a, b) => a + b, 0);
    const r = ctx.run(() => rouletteSpin(ctx.s(), ctx.table.id, { ...bets }), 'whoosh');
    if (!r) return;
    busy = true;
    last = { ...bets };
    result = null;
    drawBets();
    const n = r.n!;
    const idx = Q.WHEEL_ORDER.indexOf(n);
    const seg = TAU / Q.WHEEL_ORDER.length;
    const dur = ctx.reduced() ? 300 : 4200;
    const a0 = angle, b0 = ballA;
    const turnsW = 2 + Math.random();
    const endW = a0 + turnsW * TAU;
    // the ball ends at the pocket of n (wheel angle at end + pocket offset)
    let endB = endW + idx * seg;
    while (endB > b0 - 4 * TAU) endB -= TAU;
    const t0 = performance.now();
    let lastTick = 0;
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        angle = a0 + (endW - a0) * ease(t);
        ballA = b0 + (endB - b0) * ease(Math.min(1, t * 1.08));
        ballR = t < 0.7 ? 0.86 : 0.86 - (t - 0.7) / 0.3 * 0.2 + (t > 0.75 && t < 0.9 ? Math.abs(Math.sin(t * 60)) * 0.04 : 0);
        draw();
        const tick = Math.floor(ballA / seg);
        if (tick !== lastTick && t < 0.95) { lastTick = tick; if (Math.random() < 0.6 - t * 0.4) audio.play('tick'); }
        if (t < 1 && !ctx.closed()) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    result = n;
    resultEl.textContent = String(n);
    resultEl.className = 'r-result show ' + (n === 0 ? 'green' : Q.RED.has(n) ? 'red' : 'black');
    history.prepend(h('span', { class: 'h-num ' + (n === 0 ? 'green' : Q.RED.has(n) ? 'red' : 'black'), text: String(n) }));
    while (history.childElementCount > 12) history.lastElementChild?.remove();
    for (const k of Object.keys(bets)) delete bets[k];
    drawBets();
    ctx.reveal(r, stake, `${n} ${n === 0 ? 'green' : Q.RED.has(n) ? 'red' : 'black'}`);
    busy = false;
  }

  const spin = h('button', { class: 'btn primary', onclick: () => void go() }, 'Spin');
  const clear = h('button', { class: 'btn', onclick: () => { if (busy) return; for (const k of Object.keys(bets)) delete bets[k]; result = null; audio.play('tap'); drawBets(); } }, 'Clear');
  const dbl = h('button', { class: 'btn', onclick: () => { if (busy) return; for (const k of Object.keys(bets)) bets[k] = Math.min(ctx.limit(), bets[k] * 2); audio.play('chip'); drawBets(); } }, 'Double');
  draw();
  drawBets();
  const el = h('div', { class: 'game roulette' },
    h('div', { class: 'felt r-felt' }, h('div', { class: 'wheel-wrap' }, canvas, resultEl), h('div', { class: 'board-wrap' }, board, outside)),
    history,
    h('div', { class: 'controls' }, bet.el, h('div', { class: 'actions' }, clear, dbl, spin)));
  return { el };
}

// ───────────────────────── fortune wheel ─────────────────────────

const multColor = (m: number): string => (m === 0 ? '#3a3448' : m < 1.5 ? '#3a7ad8' : m < 2 ? '#2a9a4a' : m < 3 ? '#8a4ad8' : m < 5 ? '#e87a2a' : m < 20 ? '#d83a4a' : '#f0c040');

export function wheelView(ctx: TableCtx): GameView {
  let risk: Q.Risk = 'medium';
  const bet = ctx.betBox();
  const W = 260;
  const { el: canvas, g } = pixelCanvas(W, W, 'fortune');
  let angle = 0, glowIdx = -1;
  let busy = false;
  const legend = h('div', { class: 'paytable mini' });

  function draw() {
    const seg = Q.WHEEL[risk], n = seg.length, c = W / 2, R = W / 2 - 10, step = TAU / n;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#5a3a1a'; g.beginPath(); g.arc(c, c, R + 8, 0, TAU); g.fill();
    for (let i = 0; i < n; i++) {
      const a0 = angle + i * step - Math.PI / 2 - step / 2;
      g.fillStyle = multColor(seg[i]);
      if (i === glowIdx) g.fillStyle = '#fff2b0';
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, a0, a0 + step); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,240,200,.35)'; g.lineWidth = 1; g.stroke();
      if (seg[i] > 0) { g.save(); g.translate(c, c); g.rotate(a0 + step / 2); g.fillStyle = i === glowIdx ? '#2a1606' : CREAM; g.font = 'bold 9px Atkinson, sans-serif'; g.textAlign = 'right'; g.fillText(seg[i] + '×', R - 6, 3); g.restore(); }
    }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.fillStyle = i % 2 ? '#fff2b0' : GOLD; g.beginPath(); g.arc(c + Math.cos(a) * (R + 4), c + Math.sin(a) * (R + 4), 2, 0, TAU); g.fill(); }
    g.fillStyle = GOLD; g.beginPath(); g.arc(c, c, 16, 0, TAU); g.fill();
    g.fillStyle = '#8a5a10'; g.beginPath(); g.arc(c, c, 8, 0, TAU); g.fill();
    // pointer
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(c - 9, 2); g.lineTo(c + 9, 2); g.lineTo(c, 20); g.closePath(); g.fill();
    g.fillStyle = '#d83a4a'; g.beginPath(); g.moveTo(c - 6, 3); g.lineTo(c + 6, 3); g.lineTo(c, 16); g.closePath(); g.fill();
  }

  function legendDraw() {
    const counts = new Map<number, number>();
    for (const m of Q.WHEEL[risk]) counts.set(m, (counts.get(m) ?? 0) + 1);
    legend.replaceChildren(...[...counts.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => h('span', { class: 'pt' }, h('i', { class: 'sw', style: `background:${multColor(m)}` }), h('b', { class: 'num', text: m + '×' }), h('span', { class: 'muted', text: `${n}/30` }))));
  }

  const riskSeg = h('div', { class: 'seg' });
  for (const r of ['low', 'medium', 'high'] as Q.Risk[]) riskSeg.append(h('button', { class: r === risk ? 'on' : '', onclick: (e: MouseEvent) => { if (busy) return; risk = r; glowIdx = -1; audio.play('tap'); riskSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); draw(); legendDraw(); } }, r[0].toUpperCase() + r.slice(1)));

  async function go() {
    if (busy) return;
    const stake = bet.value();
    const r = ctx.run(() => wheelSpin(ctx.s(), ctx.table.id, stake, risk), 'whoosh');
    if (!r) return;
    busy = true;
    glowIdx = -1;
    const n = Q.WHEEL[risk].length, step = TAU / n;
    // segment i sits under the pointer when angle ≡ −i·step
    let target = -r.index! * step;
    while (target < angle + 3 * TAU) target += TAU;
    const a0 = angle, dur = ctx.reduced() ? 300 : 3800, t0 = performance.now();
    let last = Math.floor(a0 / step);
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        angle = a0 + (target - a0) * ease(t);
        const k = Math.floor(angle / step);
        if (k !== last) { last = k; audio.play('tick', 1.2); }
        draw();
        if (t < 1 && !ctx.closed()) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    glowIdx = r.index!;
    draw();
    ctx.reveal(r, stake, `${r.mult}×`);
    busy = false;
  }

  draw();
  legendDraw();
  const el = h('div', { class: 'game wheel' }, h('div', { class: 'felt wheel-felt' }, canvas), legend, h('div', { class: 'controls' }, riskSeg, bet.el, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => void go() }, 'Spin'))));
  return { el };
}

// ───────────────────────── plinko ─────────────────────────

export function plinkoView(ctx: TableCtx): GameView {
  let rows = 12, risk: Q.Risk = 'medium';
  const bet = ctx.betBox();
  const W = 300, H = 300;
  const { el: canvas, g } = pixelCanvas(W, H, 'plinko-board');
  interface Ball { path: number[]; t: number; mult: number; pocket: number; done: boolean; play: ReturnType<typeof plinkoDrop>; stake: number; lastRow: number }
  const balls: Ball[] = [];
  const flash = new Map<number, number>();
  let live = 0;

  const geom = () => {
    const top = 22, bottom = H - 34, gap = (bottom - top) / rows, sx = (W - 20) / (rows + 1);
    return { top, gap, sx };
  };
  const pegXY = (r: number, k: number) => { const { top, gap, sx } = geom(); return [W / 2 + (k - r / 2) * sx, top + r * gap] as [number, number]; };

  function draw() {
    g.clearRect(0, 0, W, H);
    const { sx } = geom();
    g.fillStyle = '#d8e0f0';
    for (let r = 1; r < rows + 1; r++) for (let k = 0; k <= r; k++) { const [x, y] = pegXY(r, k); g.fillRect(Math.round(x) - 1.5, Math.round(y) - 1.5, 3, 3); }
    const mults = Q.PLINKO[rows][risk];
    for (let k = 0; k <= rows; k++) {
      const x = W / 2 + (k - rows / 2) * sx, m = mults[k];
      const f = flash.get(k) ?? 0;
      g.fillStyle = multColor(m >= 10 ? 20 : m >= 3 ? 5 : m >= 1.5 ? 3 : m >= 1 ? 1.2 : 0);
      if (m < 1) g.fillStyle = m >= 0.5 ? '#3a7ad8' : '#3a3448';
      g.fillRect(Math.round(x - sx / 2 + 1), H - 26 - f * 4, Math.round(sx - 2), 20);
      g.fillStyle = CREAM; g.font = `bold ${rows > 12 ? 7 : 8}px Atkinson, sans-serif`; g.textAlign = 'center';
      g.fillText(m >= 100 ? String(Math.round(m)) : String(m), x, H - 13 - f * 4);
    }
    for (const b of balls) {
      if (b.done) continue;
      const [x, y] = ballXY(b);
      g.fillStyle = '#ff6ac8'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
      g.fillStyle = '#ffd0f0'; g.fillRect(x - 2, y - 2, 2, 2);
    }
  }

  function ballXY(b: Ball): [number, number] {
    // t in rows: between rows the ball arcs from one gap to the next
    const r = Math.floor(b.t), f = b.t - r;
    const ks = b.path.slice(0, r).reduce((a, c) => a + c, 0);
    const [x0, y0] = pegXY(r, ks);
    const nk = r < rows ? ks + b.path[r] : ks;
    const [x1, y1] = r < rows ? pegXY(r + 1, nk) : [x0, y0 + 12];
    const hop = Math.sin(f * Math.PI) * 6;
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f * f - hop - 6];
  }

  ctx.onFrame((dt) => {
    let any = false;
    for (const b of balls) {
      if (b.done) continue;
      any = true;
      b.t += dt * (ctx.reduced() ? 40 : 7);
      const row = Math.floor(b.t);
      if (row !== b.lastRow && row <= rows) { b.lastRow = row; audio.play('peg', 0.9 + row / rows * 0.4); }
      if (b.t >= rows + 0.6) {
        b.done = true;
        live--;
        flash.set(b.pocket, 1);
        ctx.reveal(b.play, b.stake, `${b.mult}×`);
      }
    }
    for (const [k, f] of flash) { const n = f - dt * 3; if (n <= 0) flash.delete(k); else flash.set(k, n); }
    for (let i = balls.length - 1; i >= 0; i--) if (balls[i].done) balls.splice(i, 1);
    if (any || flash.size) draw();
  });

  function drop() {
    if (live >= 10) return;
    const stake = bet.value();
    const r = ctx.run(() => plinkoDrop(ctx.s(), ctx.table.id, stake, rows, risk), 'tap');
    if (!r) return;
    live++;
    balls.push({ path: r.path!, t: 0, mult: r.mult!, pocket: r.pocket!, done: false, play: r, stake, lastRow: -1 });
  }

  const setRows = h('div', { class: 'seg' });
  for (const n of Q.PLINKO_ROWS) setRows.append(h('button', { class: n === rows ? 'on' : '', onclick: (e: MouseEvent) => { if (live) return; rows = n; audio.play('tap'); setRows.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); draw(); } }, `${n} rows`));
  const setRisk = h('div', { class: 'seg' });
  for (const r of ['low', 'medium', 'high'] as Q.Risk[]) setRisk.append(h('button', { class: r === risk ? 'on' : '', onclick: (e: MouseEvent) => { if (live) return; risk = r; audio.play('tap'); setRisk.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); draw(); } }, r[0].toUpperCase() + r.slice(1)));
  const auto = h('button', { class: 'btn', onclick: async () => { for (let i = 0; i < 10 && !ctx.closed(); i++) { drop(); await sleep(220); } } }, 'Drop ×10');
  draw();
  const el = h('div', { class: 'game plinko' }, h('div', { class: 'felt plinko-felt' }, canvas), h('div', { class: 'controls' }, h('div', { class: 'row-c' }, setRows, setRisk), bet.el, h('div', { class: 'actions' }, auto, h('button', { class: 'btn primary', onclick: () => drop() }, 'Drop ball'))));
  return { el };
}

export { multColor };
