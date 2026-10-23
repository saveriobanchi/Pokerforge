// Bakes all game art (buildings, terrain, decor, icons, sky islets)
// with the block renderer in src/render/blocks, textured from the CC0 packs
// in art/cc0, into packed PNG sheets plus a manifest in public/art. Skips work when the art sources are unchanged.
// Usage: node scripts/bake-art.mjs [--force]
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { encodePNG } from './png.mjs';

const root = process.cwd();
const out = join(root, 'public', 'art');
const force = process.argv.includes('--force');

// cache key: every source file the art depends on
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') || p.endsWith('.png')) files.push(p); } };
walk(join(root, 'src/render/blocks'));
walk(join(root, 'art/cc0'));
files.push(join(root, 'src/core/content/tokens.ts'), join(root, 'src/core/content/buildings.ts'), join(root, 'src/core/content/games.ts'), join(root, 'scripts/bake-art.mjs'));
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f.slice(root.length)).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 16);
const manifestPath = join(out, 'manifest.json');
if (!force && existsSync(manifestPath)) {
  try { if (JSON.parse(readFileSync(manifestPath, 'utf8')).version === version) { console.log('art up to date', version); process.exit(0); } } catch { /* rebake */ }
}

const tmp = join(root, 'node_modules', '.cache', 'bake-art');
mkdirSync(tmp, { recursive: true });
const entry = join(tmp, 'catalog.mjs');
await build({ entryPoints: [join(root, 'src/render/blocks/catalog.ts')], bundle: true, format: 'esm', platform: 'node', outfile: entry, logLevel: 'warning' });
const url = pathToFileURL(entry).href + '?' + version;
const cat = await import(url);
const loaderSrc = `
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pngjs from 'pngjs';
export const load = (rel) => { const png = pngjs.PNG.sync.read(readFileSync(join(${JSON.stringify(root)}, 'art', 'cc0', rel))); return { w: png.width, h: png.height, data: new Uint8ClampedArray(png.data) }; };
`;
const loaderFile = join(tmp, 'loader.mjs');
writeFileSync(loaderFile, loaderSrc);
const jobs = Object.keys(cat.JOBS);
// heaviest jobs first so workers finish together
const weight = (k) => (k.startsWith('sprite:pokerforge') || k.startsWith('sprite:derby') || k.startsWith('sprite:holdem') || k.startsWith('sprite:plinko') ? 0 : k.startsWith('top') || k.startsWith('sprite') ? 1 : 2);
jobs.sort((a, b) => weight(a) - weight(b));

const wfile = join(tmp, 'worker.mjs');
writeFileSync(wfile, `
import { parentPort, workerData } from 'node:worker_threads';
const { JOBS, setLoader } = await import(workerData.url);
const { load } = await import(workerData.loader);
setLoader(load);
parentPort.on('message', (k) => { const t = Date.now(); const r = JOBS[k](); parentPort.postMessage({ k, r, ms: Date.now() - t }); });
`);
const t0 = Date.now();
const images = new Map();
const metas = {};
const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(cpus().length, queue.length) }, () => new Promise((res, rej) => {
  const w = new Worker(wfile, { workerData: { url, loader: pathToFileURL(loaderFile).href } });
  const next = () => { const k = queue.shift(); if (k) w.postMessage(k); else { w.terminate(); res(); } };
  w.on('message', ({ k, r, ms }) => { for (const [name, img] of r) { if (name.startsWith('meta:')) metas[name.slice(5)] = img.meta; else images.set(name, img); } if (ms > 4000) console.log(`  ${k} ${ms} ms`); next(); });
  w.on('error', rej);
  next();
})));

// shelf-pack into 2048×2048 sheets, tallest first
const SIZE = 2048, PAD = 2;
const order = [...images.keys()].sort((a, b) => images.get(b).h - images.get(a).h || images.get(b).w - images.get(a).w);
const sheets = [];
let cur = null;
const rects = {};
for (const k of order) {
  const im = images.get(k);
  if (im.w + PAD > SIZE || im.h + PAD > SIZE) throw new Error(`${k} too large: ${im.w}×${im.h}`);
  if (!cur || (cur.x + im.w + PAD > SIZE && cur.y + cur.rowH + im.h + PAD > SIZE) || (cur.x + im.w + PAD <= SIZE ? false : false)) {
    cur = { items: [], x: 0, y: 0, rowH: 0 }; sheets.push(cur);
  }
  if (cur.x + im.w + PAD > SIZE) { cur.x = 0; cur.y += cur.rowH + PAD; cur.rowH = 0; }
  if (cur.y + im.h + PAD > SIZE) { cur = { items: [], x: 0, y: 0, rowH: 0 }; sheets.push(cur); }
  cur.items.push([k, cur.x, cur.y]);
  rects[k] = [sheets.length - 1, cur.x, cur.y, im.w, im.h, im.ax, im.ay];
  cur.x += im.w + PAD;
  cur.rowH = Math.max(cur.rowH, im.h);
}

// clear old sheets in place (dev servers keep watching the folder)
mkdirSync(out, { recursive: true });
for (const n of readdirSync(out)) if (/^sheet\d+\.png$|^manifest\.json$/.test(n)) rmSync(join(out, n));
let bytes = 0;
sheets.forEach((sh, i) => {
  const h = Math.min(SIZE, sh.y + sh.rowH);
  const data = new Uint8ClampedArray(SIZE * h * 4);
  for (const [k, x, y] of sh.items) {
    const im = images.get(k);
    for (let yy = 0; yy < im.h; yy++) data.set(im.data.subarray(yy * im.w * 4, (yy + 1) * im.w * 4), ((y + yy) * SIZE + x) * 4);
  }
  const png = encodePNG(SIZE, h, data, 9);
  bytes += png.length;
  writeFileSync(join(out, `sheet${i}.png`), png);
});

const sprites = {};
for (const [type, sp] of Object.entries(cat.SPRITES)) {
  sprites[type] = {
    fps: sp.fps, main: sp.main ?? '_', lamp: !!sp.lamp,
    variants: sp.variants ?? { _: sp.frames },
    lights: metas[type]?.lights ?? [],
    smoke: metas[type]?.smoke,
    smoke4: metas[type]?.smoke4,
    lights4: metas[type]?.lights4,
  };
}
const manifest = { version, R: cat.ART_R, sheets: sheets.length, depths: cat.DEPTHS, colVariants: cat.COL_VARIANTS, topVariants: cat.TOP_VARIANTS, decorKinds: cat.DECOR_KINDS, decorSets: cat.DECOR_SETS, decorVariants: cat.DECOR_VARIANTS, sprites, rects };
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`baked ${images.size} images into ${sheets.length} sheet(s), ${(bytes / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
