// App icons from the baked art: the slot machine on a velvet-and-gold medallion.
// Usage: npm run art && node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePNG, encodePNG } from './png.mjs';

const man = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const sheets = Array.from({ length: man.sheets }, (_, i) => decodePNG(readFileSync(`public/art/sheet${i}.png`)));

function crop(key) {
  const [s, x, y, w, h] = man.rects[key];
  const sh = sheets[s], data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) data.set(sh.data.subarray(((y + j) * sh.w + x) * 4, ((y + j) * sh.w + x + w) * 4), j * w * 4);
  return { w, h, data };
}

function icon(size, { maskable = false, flat = false } = {}) {
  const out = new Uint8ClampedArray(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
    const k = (y * size + x) * 4;
    // deep velvet with a warm glow in the middle
    let r = 70 + 90 * (1 - d), g = 12 + 20 * (1 - d), b = 34 + 30 * (1 - d);
    if (!maskable && !flat) {
      // a gold ring for the round medallion look
      if (d > 0.86 && d < 0.95) { const t = (x + y) / (2 * size); r = 200 + 55 * (1 - t); g = 150 + 70 * (1 - t); b = 40; }
      if (d >= 0.95) { r = 40; g = 10; b = 24; }
    }
    out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = 255;
  }
  // the machine (shadow dropped), framed on its solid pixels
  const art = crop('slots:d0:0');
  let x0 = art.w, y0 = art.h, x1 = 0, y1 = 0;
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) if (art.data[(y * art.w + x) * 4 + 3] >= 200) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const fill = maskable ? 0.56 : flat ? 0.84 : 0.66;
  let f = (size * fill) / Math.max(bw, bh);
  if (f >= 1) f = Math.floor(f);
  const dw = Math.round(bw * f), dh = Math.round(bh * f);
  const ox = Math.round(c - dw / 2), oy = Math.round(c - dh / 2);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = x0 + Math.min(bw - 1, Math.floor(x / f)), sy = y0 + Math.min(bh - 1, Math.floor(y / f));
    const s = (sy * art.w + sx) * 4;
    if (art.data[s + 3] < 200) continue;
    const d = ((oy + y) * size + ox + x) * 4;
    for (let ch = 0; ch < 3; ch++) out[d + ch] = art.data[s + ch];
  }
  return out;
}

const write = (name, size, opts) => writeFileSync(`public/icons/${name}`, encodePNG(size, size, icon(size, opts)));
write('icon-512.png', 512);
write('icon-192.png', 192);
write('icon-maskable-512.png', 512, { maskable: true });
write('apple-touch-icon.png', 180, { flat: true });
write('favicon-32.png', 32, { flat: true });
console.log('icons written');
