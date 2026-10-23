import { Rectangle, Texture } from 'pixi.js';
import type { PixelCanvas } from './art/pixel';

/**
 * Shelf-packs many small pixel canvases into a few large pages so the GPU
 * batches buildings, items and effects into very few draw calls.
 */
export class Atlas {
  private pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base: Texture; x: number; y: number; rowH: number }[] = [];
  private readonly size: number;
  private dirty = new Set<number>();

  constructor(size = 2048) {
    this.size = size;
  }

  private newPage() {
    const canvas = document.createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    const base = Texture.from(canvas);
    base.source.scaleMode = 'nearest';
    const p = { canvas, ctx, base, x: 1, y: 1, rowH: 0 };
    this.pages.push(p);
    return p;
  }

  add(pc: PixelCanvas): Texture {
    const w = pc.w, h = pc.h;
    let p = this.pages[this.pages.length - 1] ?? this.newPage();
    if (p.x + w + 1 > this.size) { p.x = 1; p.y += p.rowH + 1; p.rowH = 0; }
    if (p.y + h + 1 > this.size) { p = this.newPage(); }
    const x = p.x, y = p.y;
    p.ctx.putImageData(pc.toImageData(), x, y);
    p.x += w + 1;
    p.rowH = Math.max(p.rowH, h);
    this.dirty.add(this.pages.indexOf(p));
    return new Texture({ source: p.base.source, frame: new Rectangle(x, y, w, h) });
  }

  /** Upload changed pages to the GPU. */
  flush(): void {
    for (const i of this.dirty) this.pages[i].base.source.update();
    this.dirty.clear();
  }
}
