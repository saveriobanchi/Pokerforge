import { GAME, type GameId } from '../../core/content/games';
import { maxBet, minBet } from '../../core/economy';
import type { Play } from '../../core/play';
import type { Building, GameState } from '../../core/state';
import type { Game } from '../../game';
import { type Sfx, audio, haptic } from '../../platform/audio';
import { art } from '../../render/artpack';
import { h, img } from '../dom';

/** What a game screen gets from the table it sits at. */
export interface TableCtx {
  g: Game;
  game: GameId;
  table: Building;
  s(): GameState;
  limit(): number;
  min(): number;
  /** Run a play; on failure, says why and returns null. Winnings stay hidden from the HUD until `reveal`. */
  run<T extends Play>(fn: () => T, sound?: Sfx): T | null;
  /** Show a hidden win (after the animation) with sound, a banner and a floater. */
  reveal(r: Play, stake: number, label?: string): void;
  banner(text: string, kind?: 'win' | 'lose' | 'push' | 'big' | 'info', ms?: number): void;
  /** A bet selector remembered per game. */
  betBox(opts?: { label?: string; unit?: number; onChange?: (v: number) => void }): BetBox;
  /** Called when the modal closes. */
  onClose(fn: () => void): void;
  closed(): boolean;
  /** Per-frame hook while open. */
  onFrame(fn: (dt: number) => void): void;
  /** Header refresh (chips, till, level). */
  refresh(): void;
  reduced(): boolean;
}

export interface GameView { el: HTMLElement }

export const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

export const fmtN = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** Compact amounts for chips on felt: 1.2k, 35k, 4.5m. */
export function short(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'b';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'm';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.floor(n));
}

export function cardImg(card: number, cls = ''): HTMLImageElement {
  const el = img(art.url(`card:${card}`), 'px card-img ' + cls);
  el.dataset.card = String(card);
  return el;
}

/** Turn a face-down card over (or swap a card) with a flip. */
export function flipTo(el: HTMLImageElement, card: number): void {
  el.classList.remove('flip');
  void el.offsetWidth;
  el.classList.add('flip');
  window.setTimeout(() => { el.src = art.url(`card:${card}`); el.dataset.card = String(card); }, 120);
}

export function chipImg(i: number, cls = ''): HTMLImageElement {
  return img(art.url(`chip:${i}`), 'px chip-img ' + cls);
}

/** Chip colour for an amount relative to the table limit. */
export function chipFor(amount: number, limit: number): number {
  const r = amount / Math.max(1, limit);
  return r >= 1 ? 5 : r >= 0.5 ? 4 : r >= 0.2 ? 3 : r >= 0.08 ? 2 : r >= 0.02 ? 1 : 0;
}

export function dieImg(n: number, cls = ''): HTMLImageElement {
  return img(art.url(`die:${n}`), 'px die-img ' + cls);
}

/** Ladder of friendly bet sizes. */
export function ladder(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = 1; e <= 1e12; e *= 10) for (const k of [1, 2, 5]) {
    const v = k * e;
    if (v >= min && v <= max) out.push(v);
  }
  if (!out.includes(min)) out.unshift(min);
  if (!out.includes(max)) out.push(max);
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface BetBox { el: HTMLElement; value(): number; set(v: number): void; refresh(): void }

const memory = new Map<string, number>();

export function makeBetBox(ctx: TableCtx, opts: { label?: string; unit?: number; onChange?: (v: number) => void } = {}): BetBox {
  const key = ctx.game + (opts.label ?? '');
  const valEl = h('span', { class: 'num bet-val' });
  const chip = h('span', { class: 'bet-chip' });
  let v = memory.get(key) ?? ctx.min();
  const clamp = (x: number) => Math.max(ctx.min(), Math.min(ctx.limit(), Math.floor(x)));
  const show = () => {
    v = clamp(v);
    valEl.textContent = fmtN(v);
    chip.replaceChildren(chipImg(chipFor(v, ctx.limit())));
    const cost = v * (opts.unit ?? 1);
    el.classList.toggle('poor', cost > ctx.s().chips);
    memory.set(key, v);
  };
  const step = (dir: number) => {
    const l = ladder(ctx.min(), ctx.limit());
    let i = l.findIndex((x) => x >= v);
    if (i < 0) i = l.length - 1;
    if (dir > 0) i = l[i] > v ? i : i + 1; else i = l[i] >= v ? i - 1 : i;
    v = l[Math.max(0, Math.min(l.length - 1, i))];
    audio.play('chip');
    show();
    opts.onChange?.(v);
  };
  const btn = (label: string, fn: () => void, cls = '') => h('button', { class: 'btn small bet-b ' + cls, onclick: () => { fn(); } }, label);
  const el = h('div', { class: 'betbox' },
    h('span', { class: 'caps', text: opts.label ?? 'Bet' }),
    btn('½', () => { v = clamp(v / 2); audio.play('chip'); show(); opts.onChange?.(v); }),
    btn('−', () => step(-1)),
    h('span', { class: 'bet-mid' }, chip, valEl),
    btn('+', () => step(1)),
    btn('×2', () => { v = clamp(v * 2); audio.play('chip'); show(); opts.onChange?.(v); }),
    btn('MAX', () => { v = clamp(Math.min(ctx.limit(), Math.floor(ctx.s().chips / (opts.unit ?? 1)))); audio.play('chip'); show(); opts.onChange?.(v); }, 'max'));
  show();
  return { el, value: () => clamp(v), set: (x: number) => { v = x; show(); }, refresh: show };
}

/** Short haptic + sound bundle for outcomes. */
export function outcomeFx(ctx: TableCtx, kind: 'win' | 'big' | 'lose' | 'push'): void {
  const hap = ctx.g.settings.haptics;
  if (kind === 'big') { audio.play('bigwin'); haptic([20, 40, 20, 40, 60], hap); }
  else if (kind === 'win') { audio.play('win'); haptic([10, 30, 10], hap); }
  else if (kind === 'lose') audio.play('lose');
  else audio.play('tap');
}

export function ruleLine(game: GameId): string {
  const d = GAME[game];
  return `${d.flavor} · returns about ${(d.rtp * 100).toFixed(1)}% with good play`;
}

export function limitText(s: GameState, game: GameId, t: Building): string {
  return `Bets ${fmtN(minBet(game))}–${fmtN(maxBet(s, game, t))}`;
}

/** A pixel canvas sized for crisp drawing at device resolution. */
export function pixelCanvas(w: number, h0: number, cls = ''): { el: HTMLCanvasElement; g: CanvasRenderingContext2D; scale: number } {
  const el = document.createElement('canvas');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  el.width = Math.round(w * scale);
  el.height = Math.round(h0 * scale);
  el.className = 'game-canvas ' + cls;
  el.style.aspectRatio = `${w} / ${h0}`;
  const g = el.getContext('2d')!;
  g.scale(scale, scale);
  g.imageSmoothingEnabled = false;
  return { el, g, scale };
}

/** Load a baked art image for drawing on a canvas. */
const imgCache = new Map<string, HTMLImageElement>();
export function artImage(key: string): HTMLImageElement {
  let im = imgCache.get(key);
  if (!im) { im = new Image(); im.src = art.url(key); imgCache.set(key, im); }
  return im;
}

export const ease = (t: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
