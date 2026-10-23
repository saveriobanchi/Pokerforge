import { BUILDINGS } from '../core/content/buildings';
import { Rectangle, Texture } from 'pixi.js';

/**
 * Runtime side of the baked art pack (public/art, produced by
 * scripts/bake-art.mjs). Sheets become GPU textures; every image is a
 * sub-texture with its anchor. The interface gets data URLs of crops.
 */

export interface ArtImage { tex: Texture; ax: number; ay: number; w: number; h: number }

export interface ArtSprite {
  fps: number;
  lamp: boolean;
  main: string;
  /** Night glows relative to the anchor in world px: [x, y, colour, radius]. */
  lights: [number, number, number, number][];
  smoke?: [number, number];
  /** Smoke source per facing, for buildings baked in four directions. */
  smoke4?: [number, number][];
  /** Light offsets per facing (same lights as `lights`). */
  lights4?: [number, number][][];
  variants: Record<string, ArtImage[]>;
  frames: ArtImage[];
}

type Rect = [number, number, number, number, number, number, number];
interface Manifest {
  version: string;
  R: number;
  sheets: number;
  depths: number[];
  colVariants: number;
  topVariants?: number;
  decorKinds: string[];
  decorSets?: Record<string, string[]>;
  decorVariants: number;
  sprites: Record<string, { fps: number; main: string; lamp: boolean; variants: Record<string, number>; lights: [number, number, number, number][]; smoke?: [number, number]; smoke4?: [number, number][]; lights4?: [number, number][][] }>;
  rects: Record<string, Rect>;
}

class Art {
  ready = false;
  R = 2;
  depths: number[] = [];
  colVariants = 1;
  topVariants = 1;
  decorKinds: string[] = [];
  decorSets: Record<string, string[]> = {};
  decorVariants = 1;
  sprites = new Map<string, ArtSprite>();
  private man: Manifest | null = null;
  private sheets: (HTMLImageElement | ImageBitmap)[] = [];
  private textures: Texture[] = [];
  private cache = new Map<string, ArtImage>();
  private urls = new Map<string, string>();

  has(key: string): boolean {
    return !!this.man?.rects[key];
  }

  img(key: string): ArtImage {
    let a = this.cache.get(key);
    if (a) return a;
    const r = this.man?.rects[key];
    if (!r) {
      // never crash over one picture: show nothing and say so once
      console.warn('missing art: ' + key);
      a = { tex: Texture.EMPTY, ax: 0, ay: 0, w: 1, h: 1 };
      this.cache.set(key, a);
      return a;
    }
    const [s, x, y, w, h, ax, ay] = r;
    a = { tex: new Texture({ source: this.textures[s].source, frame: new Rectangle(x, y, w, h) }), ax, ay, w, h };
    this.cache.set(key, a);
    return a;
  }

  private alpha = new Map<unknown, { data: Uint8ClampedArray; w: number }>();

  /** Opacity (0–255) of a texel of a sheet texture, for pixel-precise taps. */
  alphaAt(tex: Texture, x: number, y: number): number {
    const src = tex.source;
    let a = this.alpha.get(src);
    if (!a) {
      const i = this.textures.findIndex((t) => t.source === src);
      const im = this.sheets[i];
      if (!im) return 255;
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(im as CanvasImageSource, 0, 0);
      // keep only the opacity channel (a quarter of the memory)
      const rgba = g.getImageData(0, 0, c.width, c.height).data;
      const data = new Uint8ClampedArray(c.width * c.height);
      for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];
      a = { data, w: c.width };
      this.alpha.set(src, a);
    }
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 0 || py < 0 || px >= a.w) return 0;
    return a.data[py * a.w + px] ?? 0;
  }

  private silhouettes = new Map<string, Texture>();

  /** A white, fully opaque copy of a frame's shape (tinted to draw outlines). */
  silhouette(tex: Texture): Texture {
    const f = tex.frame;
    const k = `${this.textures.findIndex((t) => t.source === tex.source)}:${f.x},${f.y},${f.width},${f.height}`;
    let t = this.silhouettes.get(k);
    if (t) return t;
    const w = Math.max(1, Math.round(f.width)), hh = Math.max(1, Math.round(f.height));
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const g = c.getContext('2d')!;
    const im = g.createImageData(w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (this.alphaAt(tex, f.x + x, f.y + y) > 60) { const i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = im.data[i + 3] = 255; }
    }
    g.putImageData(im, 0, 0);
    t = Texture.from(c);
    t.source.scaleMode = 'nearest';
    this.silhouettes.set(k, t);
    return t;
  }

  /** PNG data URL of an image (for the DOM interface). */
  url(key: string): string {
    let u = this.urls.get(key);
    if (u) return u;
    const r = this.man?.rects[key];
    if (!r) return '';
    const [s, x, y, w, h] = r;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(this.sheets[s] as CanvasImageSource, x, y, w, h, 0, 0, w, h);
    u = c.toDataURL();
    this.urls.set(key, u);
    return u;
  }

  async load(base = './art/'): Promise<void> {
    const res = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('art pack missing — run `npm run art`');
    const man = (await res.json()) as Manifest;
    // an art pack from an older deploy (a stale cache) lacks newer pictures
    const lacking = Object.keys(BUILDINGS).filter((id) => !man.sprites[id]).concat(['person:0:0', 'card:0', 'tok:clover'].filter((k) => !man.rects[k]));
    if (lacking.length) throw new StaleArtError(lacking);
    this.man = man;
    this.R = man.R;
    this.depths = man.depths;
    this.colVariants = man.colVariants;
    this.topVariants = man.topVariants ?? 1;
    this.decorKinds = man.decorKinds;
    this.decorSets = man.decorSets ?? { grass: man.decorKinds };
    this.decorVariants = man.decorVariants;
    this.sheets = await Promise.all(Array.from({ length: man.sheets }, (_, i) => new Promise<HTMLImageElement>((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error('art sheet failed to load'));
      im.src = `${base}sheet${i}.png?v=${man.version}`;
    })));
    this.textures = this.sheets.map((im) => {
      const t = Texture.from(im as HTMLImageElement);
      t.source.scaleMode = 'nearest';
      return t;
    });
    for (const [type, sp] of Object.entries(man.sprites)) {
      const variants: Record<string, ArtImage[]> = {};
      for (const [v, n] of Object.entries(sp.variants)) variants[v] = Array.from({ length: n }, (_, i) => this.img(`${type}:${v}:${i}`));
      this.sprites.set(type, { fps: sp.fps, lamp: sp.lamp, main: sp.main, lights: sp.lights, smoke: sp.smoke, smoke4: sp.smoke4, lights4: sp.lights4, variants, frames: variants[sp.main] });
    }
    this.ready = true;
  }
}

export const art = new Art();

/** Thrown when the art pack on hand is older than the game code (a stale cache). */
export class StaleArtError extends Error {
  constructor(public lacking: string[]) { super(`missing art: ${lacking.slice(0, 4).join(', ')}${lacking.length > 4 ? '…' : ''}`); }
}
