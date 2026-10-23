// Compose a review gallery from public/art. Usage: node scripts/art-gallery.mjs <out.png> [prefix] [scale]
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePNG, encodePNG } from './png.mjs';
const [out, prefix = 'sprite', sc = '1'] = process.argv.slice(2);
const S = Number(sc);
const man = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const sheets = Array.from({ length: man.sheets }, (_, i) => decodePNG(readFileSync(`public/art/sheet${i}.png`)));
let keys;
if (prefix === 'sprite') keys = Object.entries(man.sprites).map(([t, s]) => `${t}:${s.main}:0`);
else if (prefix.startsWith('@')) keys = readFileSync(prefix.slice(1), 'utf8').split('\n').filter(Boolean);
else keys = Object.keys(man.rects).filter((k) => k.startsWith(prefix)).sort();
const W = 2000, pad = 12;
let x = pad, y = pad, rowH = 0;
const pos = [];
for (const k of keys) {
  const r = man.rects[k]; if (!r) continue;
  const w = r[3] * S, h = r[4] * S;
  if (x + w > W) { x = pad; y += rowH + pad; rowH = 0; }
  pos.push([k, x, y]); x += w + pad; rowH = Math.max(rowH, h);
}
const H = y + rowH + pad;
const img = new Uint8ClampedArray(W * H * 4);
for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const t = yy / H, k = (yy * W + xx) * 4; img[k] = 110 + t * 100; img[k + 1] = 140 + t * 60; img[k + 2] = 190 - t * 40; img[k + 3] = 255; }
for (const [k, ox, oy] of pos) {
  const [si, sx, sy, w, h] = man.rects[k]; const sh = sheets[si];
  for (let yy = 0; yy < h * S; yy++) for (let xx = 0; xx < w * S; xx++) {
    const s = ((sy + Math.floor(yy / S)) * sh.w + sx + Math.floor(xx / S)) * 4, d = ((oy + yy) * W + ox + xx) * 4, a = sh.data[s + 3] / 255;
    for (let c = 0; c < 3; c++) img[d + c] = img[d + c] * (1 - a) + sh.data[s + c] * a;
  }
}
writeFileSync(out, encodePNG(W, H, img, 6));
console.log(out, W, H);
