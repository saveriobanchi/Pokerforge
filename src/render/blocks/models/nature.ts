import type { Canvas, Face, Tex, V3 } from '../iso';
import { Paint, type TexLib } from '../tex';

const h = (a: number, b: number, c = 0) => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export type Wood = 'oak' | 'beech' | 'maple' | 'pine' | 'eucalyptus';

/** Leaf cut-out per species (luminance below which texels become see-through gaps). */
const CUT: Record<Wood, number> = { oak: 92, beech: 96, maple: 80, pine: 26, eucalyptus: 70 };

/**
 * Block tree on one tile: a slim log trunk and a crown of leaf blocks in
 * half-block steps that spills a little over the neighbours.
 */
export function tree(c: Canvas, L: TexLib, wood: Wood, seed: number, sway = 0, fruit = 0, tint: [number, number, number] = [1, 1, 1], leafWood: Wood = wood, leafTex?: Tex): void {
  const log: Face = { tex: L.get(`a/${wood}_log_side`) };
  const logTop: Face = { tex: L.get(`a/${wood}_log_top`) };
  // airy outer leaves (dark texels cut away) over a shaded inner core
  const lt = leafTex ?? L.get(`a/${leafWood}_leaves`);
  const leaves: Face = { tex: lt, cut: CUT[leafWood], tint };
  const core: Face = { tex: lt, tint: [0.62 * tint[0], 0.68 * tint[1], 0.72 * tint[2]] };
  const trunkH = wood === 'pine' ? 2.5 : 2;
  c.box([0.3125, 0.3125, 0], [0.6875, 0.6875, trunkH], logTop, log, log, 2);
  // roots
  c.box([0.25, 0.25, 0], [0.75, 0.75, 0.1875], logTop, log, log, 2);
  const s = sway * 0.0625;
  if (wood === 'pine') {
    for (let k = 0; k < 4; k++) {
      const r = 0.9 - k * 0.2, z = 1.25 + k * 0.5;
      c.box([0.5 - r + s * k, 0.5 - r, z], [0.5 + r + s * k, 0.5 + r, z + 0.5], leaves, leaves, leaves, 3);
    }
    c.box([0.375 + s * 4, 0.375, 3.25], [0.625 + s * 4, 0.625, 3.5], leaves, leaves, leaves, 3);
    return;
  }
  // main crown: a 2×2 core with stepped lumps, upper part sways
  c.box([-0.25, -0.25, 1.8], [1.25, 1.25, 2.7], core, core, core, 3);
  c.box([-0.375, -0.375, 1.75], [1.375, 1.375, 2.75], leaves, leaves, leaves, 3);
  c.box([-0.125 + s, -0.125, 2.75], [1.125 + s, 1.125, 3.25], leaves, leaves, leaves, 3);
  for (let i = 0; i < 6; i++) {
    const a = h(seed, i, 1) * Math.PI * 2;
    const r = 0.95;
    const x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r, z = 1.75 + Math.floor(h(seed, i, 2) * 3) * 0.25;
    c.box([x - 0.25, y - 0.25, z], [x + 0.25, y + 0.25, z + 0.5], leaves, leaves, leaves, 3);
  }
  c.box([0.125 + s, 0.125, 3.25], [0.875 + s, 0.875, 3.5], leaves, leaves, leaves, 3);
  // fruit / blossoms dotted on the crown's visible faces
  for (let i = 0; i < fruit; i++) {
    const side = i % 3;
    const t1 = h(seed, i, 7), t2 = h(seed, i, 8);
    const p: [number, number, number] = side === 0 ? [-0.375 + t1 * 1.75, 1.39, 1.85 + t2 * 0.8] : side === 1 ? [1.39, -0.375 + t1 * 1.75, 1.85 + t2 * 0.8] : [-0.3 + t1 * 1.6, -0.3 + t2 * 1.6, 2.76];
    c.box(p, [p[0] + 0.0625 * 1.5, p[1] + 0.0625 * 1.5, p[2] + 0.0625 * 1.5], { tex: L.get('as/default_apple') , uv: [6, 6, 8, 8] }, { tex: L.get('as/default_apple'), uv: [5, 7, 7, 9] }, { tex: L.get('as/default_apple'), uv: [5, 7, 7, 9] }, 4);
  }
}

/** The great elder tree: a wide maple crown with lanterns hung under it. */
export function elderTree(c: Canvas, L: TexLib, sway = 0): void {
  const log: Face = { tex: L.get('a/oak_log_side'), tint: [0.8, 0.72, 0.68] };
  const logTop: Face = { tex: L.get('a/oak_log_top') };
  const leaves: Face = { tex: L.get('a/maple_leaves'), cut: CUT.maple };
  const core: Face = { tex: L.get('a/maple_leaves'), tint: [0.62, 0.66, 0.72] };
  c.box([0.25, 0.25, 0], [0.75, 0.75, 2.6], logTop, log, log, 2);
  c.box([0.125, 0.125, 0], [0.875, 0.875, 0.3125], logTop, log, log, 2);
  for (const [x0, y0, x1, y1] of [[0.6, 0.4, 1.3, 0.6], [-0.3, 0.4, 0.4, 0.6], [0.4, -0.3, 0.6, 0.4]]) c.box([x0, y0, 1.75], [x1, y1, 1.95], logTop, log, log, 2);
  const s = sway * 0.0625;
  c.box([-0.7, -0.7, 2.3], [1.7, 1.7, 3.3], core, core, core, 3);
  c.box([-0.875, -0.875, 2.25], [1.875, 1.875, 3.375], leaves, leaves, leaves, 3);
  c.box([-0.375 + s, -0.375, 3.375], [1.375 + s, 1.375, 3.875], leaves, leaves, leaves, 3);
  c.box([0.125 + s * 1.5, 0.125, 3.875], [0.875 + s * 1.5, 0.875, 4.125], leaves, leaves, leaves, 3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const x = 0.5 + Math.cos(a) * 1.35, y = 0.5 + Math.sin(a) * 1.35, z = 2.25 + Math.floor(h(9, i, 2) * 3) * 0.25;
    c.box([x - 0.3, y - 0.3, z], [x + 0.3, y + 0.3, z + 0.5], leaves, leaves, leaves, 3);
  }
  // lanterns hanging from the lower boughs
  const lan = L.get('as/default_torch_on_floor');
  for (const [x, y] of [[1.25, 0.55], [0.55, 1.25], [-0.2, 0.55]] as [number, number][]) {
    c.quad([x, y, 2.25], [0, 0, 0.001], [0, 0, -0.35], { tex: L.get('as/default_steel_block'), uv: [0, 0, 1, 16] }, [1, 1, 1], 6);
    c.sprite([x, y, 1.6], { tex: lan, glow: true }, 6, 2);
    c.light([x, y, 1.75], [130, 90, 30], 1.4);
  }
}

/** Young tree in three growth stages. */
export function sapling(c: Canvas, L: TexLib, stage: number, sway = 0): void {
  if (stage === 0) { c.sprite([0.5, 0.5, 0], { tex: L.get('a/plants/sapling_oak') }, 2, 2); return; }
  const log: Face = { tex: L.get('a/oak_log_side') };
  const leaves: Face = { tex: L.get('a/oak_leaves'), cut: CUT.oak };
  const tH = stage === 1 ? 0.75 : 1.25;
  c.box([0.4375, 0.4375, 0], [0.5625, 0.5625, tH], log, log, log, 2);
  const r = stage === 1 ? 0.3 : 0.5, s = sway * 0.04;
  c.box([0.5 - r + s, 0.5 - r, tH - 0.125], [0.5 + r + s, 0.5 + r, tH + r * 1.2], leaves, leaves, leaves, 3);
  if (stage === 2) c.box([0.3 + s * 1.5, 0.3, tH + 0.6], [0.7 + s * 1.5, 0.7, tH + 0.85], leaves, leaves, leaves, 3);
}

/** A clump of tall fibrous grass. */
export function tuft(c: Canvas, L: TexLib, sway = 0, biome: 'meadow' | 'marsh' | 'dunes' | 'frost' = 'meadow'): void {
  const sets = {
    meadow: ['grass_tall', 'sedge', 'grass3', 'horsetail', 'grass_tall', 'fern2'],
    marsh: ['cattail', 'horsetail', 'cattail', 'sedge', 'horsetail', 'cattail'],
    dunes: ['grass3', 'sagebrush', 'grass3', 'grass2', 'creosote', 'grass3'],
    frost: ['grass_tall', 'grass3', 'grass_tall', 'grass2', 'grass_tall', 'grass3'],
  };
  const tint: [number, number, number] = biome === 'dunes' ? [1.15, 1, 0.6] : biome === 'frost' ? [0.85, 0.98, 1.12] : [1, 1, 1];
  const names = sets[biome];
  for (let i = 0; i < 6; i++) {
    const x = 0.5 + (h(i, 1, 4) - 0.5) * 0.6 + (i % 2 ? sway * 0.02 : 0), y = 0.5 + (h(i, 2, 4) - 0.5) * 0.6;
    c.sprite([x, y, 0], { tex: L.get('a/plants/' + names[i]), tint }, 2, 2);
  }
}

/** Resource nodes: a copper-veined boulder, a spring, a shard cluster. */
export function node(c: Canvas, L: TexLib, kind: 'node_vein' | 'node_spring' | 'node_shard', f = 0): void {
  const F = (n: string, o: Partial<Face> = {}): Face => ({ tex: L.get(n), ...o });
  if (kind === 'node_vein') {
    const ore = F('as/default_mineral_copper');
    c.box([0.1, 0.15, 0], [0.75, 0.85, 0.55], ore, ore, F('b/stone'), 4);
    c.box([0.5, 0.05, 0], [0.92, 0.5, 0.38], F('b/stone'), F('as/default_mineral_copper'), F('as/default_mineral_copper'), 4);
    c.box([0.25, 0.3, 0.55], [0.6, 0.7, 0.8], F('b/andesite'), F('as/default_mineral_copper'), F('b/andesite'), 4);
    c.sprite([0.3, 0.95, 0], { tex: L.get('as/default_copper_lump') }, 5, 1);
    return;
  }
  if (kind === 'node_spring') {
    const ring = F('a/cobblestone_mossy');
    for (const [a, b] of [[[0, 0, 0], [1, 0.18, 0.3]], [[0, 0.82, 0], [1, 1, 0.3]], [[0, 0, 0], [0.18, 1, 0.3]], [[0.82, 0, 0], [1, 1, 0.3]]] as [V3, V3][]) c.box(a, b, ring, ring, ring, 4);
    const water: Face = { tex: springTex(f) };
    c.quad([0.18, 0.18, 0.24], [0.64, 0, 0], [0, 0.64, 0], water, [1.02, 1.02, 1.06], 4, 0, true);
    c.sprite([0.5, 0.5, 0.24 + ((f * 2) % 1) * 0.3], { tex: L.get('as/bubble'), glow: true }, 5, 1);
    c.sprite([0.15, 0.95, 0], { tex: L.get('a/plants/cattail') }, 5, 2);
    c.light([0.5, 0.5, 0.4], [30, 80, 120], 1.3);
    return;
  }
  c.box([0.15, 0.2, 0], [0.85, 0.8, 0.25], F('a/basalt'), F('a/basalt'), F('a/basalt'), 4);
  const am = (o: Partial<Face> = {}): Face => F('a/amethyst', { glow: true, tint: [1.15, 0.95, 0.6], ...o });
  const pulse = 1 + Math.sin(f * Math.PI * 2) * 0.08;
  for (const [x, y, w, hh] of [[0.4, 0.4, 0.2, 0.9], [0.2, 0.55, 0.14, 0.55], [0.62, 0.3, 0.15, 0.65], [0.55, 0.65, 0.12, 0.4]]) c.box([x, y, 0.2], [x + w, y + w, 0.2 + hh * pulse], am(), am(), am({ tint: [0.95, 0.75, 0.5] }), 4);
  c.light([0.5, 0.5, 0.6], [140, 110, 40], 1.4);
}

function springTex(f: number): Tex {
  const p = { w: 16, h: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
  const pal = [[42, 90, 154], [58, 120, 184], [74, 146, 204], [106, 178, 224], [184, 230, 244]];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const ring = Math.abs(((d - f * 8) % 4 + 4) % 4 - 2) < 0.5 ? 2 : 0;
    const n = h(x, y, 3);
    const i = Math.min(4, 1 + ring + (n > 0.85 ? 1 : 0));
    p.data.set([...pal[i], 255], (y * 16 + x) * 4);
  }
  return p;
}

/** Small floating sky islet for the far background (drawn at half scale). */
export function islet(c: Canvas, L: TexLib, seed: number, withTree: boolean): void {
  const cells: [number, number][] = [];
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if ((x === 0 && y === 0) || h(seed, x * 3 + y, 1) > 0.35) cells.push([x, y]);
  const g: Face = { tex: L.get('a/grass_top') }, gs: Face = { tex: L.get('a/grass_side') };
  for (const [x, y] of cells.sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
    const d = (x === 0 && y === 0 ? 3 : 1) + Math.floor(h(seed, x, y) * 2);
    c.box([x, y, -1], [x + 1, y + 1, 0], g, gs, gs, 1);
    for (let k = 1; k <= d; k++) {
      const n = k === 1 ? 'a/dirt' : h(x, y, k) > 0.5 ? 'b/stone' : 'b/andesite';
      const t: Face = { tex: L.get(n) };
      const inset = Math.min(0.4, (k - 1) * 0.12);
      c.box([x + inset, y + inset, -1 - k], [x + 1 - inset, y + 1 - inset, -k], t, t, t, 1);
    }
  }
  if (withTree) { c.castOn = true; tree(c, L, h(seed, 9) > 0.5 ? 'pine' : 'oak', seed); c.castOn = false; }
}

/** Fruit tree: a beech-like crown heavy with apples. */
export function fruitTree(c: Canvas, L: TexLib, sway = 0, apples = 12): void {
  tree(c, L, 'beech', 5, sway, 0);
  // plump apples on the crown's visible faces
  const ap = (p: V3) => c.box(p, [p[0] + 0.14, p[1] + 0.14, p[2] + 0.14], { tex: L.get('as/default_apple'), uv: [6, 6, 9, 9] }, { tex: L.get('as/default_apple'), uv: [5, 6, 8, 9] }, { tex: L.get('as/default_apple'), uv: [5, 6, 8, 9], tint: [0.8, 0.8, 0.85] }, 4);
  for (let i = 0; i < apples; i++) {
    const side = i % 3, t1 = h(5, i, 7), t2 = h(5, i, 8);
    ap(side === 0 ? [-0.3 + t1 * 1.6, 1.37, 1.85 + t2 * 0.7] : side === 1 ? [1.37, -0.3 + t1 * 1.6, 1.85 + t2 * 0.7] : [-0.2 + t1 * 1.3, -0.2 + t2 * 1.3, 2.76]);
  }
}

/** Young fruit tree in three growth stages. */
export function fruitSapling(c: Canvas, L: TexLib, stage: number, sway = 0): void {
  if (stage === 0) { c.sprite([0.5, 0.5, 0], { tex: L.get('a/plants/sapling_beech') }, 2, 2); return; }
  const log: Face = { tex: L.get('a/beech_log_side') };
  const leaves: Face = { tex: L.get('a/beech_leaves'), cut: CUT.beech };
  const tH = stage === 1 ? 0.75 : 1.25;
  c.box([0.4375, 0.4375, 0], [0.5625, 0.5625, tH], log, log, log, 2);
  const r = stage === 1 ? 0.3 : 0.5, s = sway * 0.04;
  c.box([0.5 - r + s, 0.5 - r, tH - 0.125], [0.5 + r + s, 0.5 + r, tH + r * 1.2], leaves, leaves, leaves, 3);
  if (stage === 2) for (const [x, y, z] of [[0.05, 0.6, 1.4], [0.6, 0.02, 1.6], [0.95, 0.5, 1.3]] as V3[]) c.box([x, y, z], [x + 0.1, y + 0.1, z + 0.1], { tex: L.get('as/default_apple'), uv: [6, 6, 8, 8] }, { tex: L.get('as/default_apple'), uv: [5, 7, 7, 9] }, { tex: L.get('as/default_apple'), uv: [5, 7, 7, 9] }, 4);
}


// ───────────────────────── biome trees & fruit species ─────────────────────────

/** Small fruit boxes dotted over a crown's visible faces. */
function fruitOnCrown(c: Canvas, col: [number, number, number, number], n: number, size: number, seed: number, crown = { x0: -0.3, x1: 1.3, z0: 1.85, z1: 2.6, top: 2.76, face: 1.37 }): void {
  const p = new Paint(4, 4);
  const [r, g, b] = col;
  const shade = (k: number) => ((Math.min(255, r * k) << 16) | (Math.min(255, g * k) << 8) | Math.min(255, b * k));
  p.rect(0, 0, 4, 4, shade(1)).rect(0, 0, 2, 1, shade(1.35)).rect(3, 1, 1, 3, shade(0.7)).rect(0, 3, 4, 1, shade(0.75));
  const F: Face = { tex: p };
  for (let i = 0; i < n; i++) {
    const side = i % 3, t1 = h(seed, i, 7), t2 = h(seed, i, 8);
    const q: V3 = side === 0 ? [crown.x0 + t1 * (crown.x1 - crown.x0), crown.face, crown.z0 + t2 * (crown.z1 - crown.z0)] : side === 1 ? [crown.face, crown.x0 + t1 * (crown.x1 - crown.x0), crown.z0 + t2 * (crown.z1 - crown.z0)] : [crown.x0 + 0.1 + t1 * (crown.x1 - crown.x0 - 0.2), crown.x0 + 0.1 + t2 * (crown.x1 - crown.x0 - 0.2), crown.top];
    c.box(q, [q[0] + size, q[1] + size, q[2] + size], F, F, F, 4);
  }
}

/** A palm: a leaning ringed trunk and drooping fronds. */
export function palm(c: Canvas, L: TexLib, seed: number, sway = 0, dates = 0): void {
  const bark = new Paint(16, 16, L.get('a/eucalyptus_log_side')).tint([0.9, 0.78, 0.6]);
  for (let y = 0; y < 16; y += 4) bark.rect(0, y, 16, 1, 0x5a4428);
  const log: Face = { tex: bark };
  const top: Face = { tex: L.get('a/eucalyptus_log_top') };
  let x = 0.4, y = 0.4;
  for (let k = 0; k < 9; k++) {
    const z = k * 0.3;
    c.box([x, y, z], [x + 0.22, y + 0.22, z + 0.3], top, log, log, 2);
    x += 0.02 + k * 0.004; y -= 0.012;
  }
  const cx = x + 0.11, cy = y + 0.11, cz = 2.7, s = sway * 0.05;
  const frond: Face = { tex: L.get('a/oak_leaves'), tint: [0.9, 1.15, 0.75] };
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + h(seed, i, 3) * 0.4;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let k = 0; k < 4; k++) {
      const r = 0.2 + k * 0.26, dz = -k * k * 0.07;
      const px = cx + dx * r + s * k, py = cy + dy * r, pz = cz + dz;
      c.box([px - 0.16, py - 0.16, pz], [px + 0.16, py + 0.16, pz + 0.1], frond, frond, frond, 3);
    }
  }
  c.box([cx - 0.18, cy - 0.18, cz - 0.05], [cx + 0.18, cy + 0.18, cz + 0.18], frond, frond, frond, 3);
  if (dates) {
    const d = new Paint(4, 4).rect(0, 0, 4, 4, 0x8a4a1a).rect(0, 0, 2, 1, 0xb8743a).rect(3, 0, 1, 4, 0x5a2a0a);
    for (let i = 0; i < dates; i++) {
      const a = (i / dates) * Math.PI * 2;
      const px = cx + Math.cos(a) * 0.3, py = cy + Math.sin(a) * 0.3;
      c.box([px - 0.08, py - 0.08, cz - 0.42 - (i % 2) * 0.1], [px + 0.08, py + 0.08, cz - 0.12], { tex: d }, { tex: d }, { tex: d }, 4);
    }
  }
}

/** A willow: a broad crown with leafy curtains hanging to the ground. */
export function willow(c: Canvas, L: TexLib, seed: number, sway = 0, fruit = 0): void {
  tree(c, L, 'eucalyptus', seed, sway, 0, [0.9, 1.08, 0.85]);
  const curtain: Face = { tex: L.get('a/eucalyptus_leaves'), cut: CUT.eucalyptus, tint: [0.85, 1.05, 0.8] };
  const s = sway * 0.05;
  for (let i = 0; i < 10; i++) {
    const side = i % 2, t = -0.3 + h(seed, i, 11) * 1.55, len = 0.6 + h(seed, i, 12) * 0.7;
    const p: V3 = side === 0 ? [t + s, 1.3, 1.85 - len] : [1.3, t, 1.85 - len];
    c.box(p, side === 0 ? [p[0] + 0.14, p[1] + 0.08, 1.85] : [p[0] + 0.08, p[1] + 0.14, 1.85], curtain, curtain, curtain, 3);
  }
  void fruit;
}

/** The island tree's look by biome (oak in meadow). */
export function islandTree(c: Canvas, L: TexLib, look: 'oak' | 'willow' | 'palm' | 'pine', sway: number, fruit: number): void {
  if (look === 'palm') return palm(c, L, 3, sway, 0);
  if (look === 'willow') return willow(c, L, 2, sway, fruit);
  if (look === 'pine') {
    tree(c, L, 'pine', 3, sway);
    // snow on every tier
    const snow: Face = { tex: L.get('a/snow') };
    for (let k = 0; k < 4; k++) {
      const r = 0.9 - k * 0.2 - 0.06, z = 1.75 + k * 0.5;
      c.box([0.5 - r + sway * 0.0625 * k, 0.5 - r, z], [0.5 + r + sway * 0.0625 * k, 0.5 + r, z + 0.0625], snow, snow, snow, 3);
    }
    return;
  }
  tree(c, L, 'oak', 1, sway, fruit);
}

/** Repaint a texture through a colour ramp by luminance (keeps its pattern, alpha and darks). */
function recolor(t: Tex, ramp: number[]): Paint {
  const p = new Paint(t.w, t.h);
  for (let i = 0; i < t.w * t.h; i++) {
    if (t.data[i * 4 + 3] < 128) continue;
    const l = (t.data[i * 4] * 0.3 + t.data[i * 4 + 1] * 0.59 + t.data[i * 4 + 2] * 0.11) / 255;
    const k = Math.min(ramp.length - 1, Math.floor(l * ramp.length * 1.25));
    p.set(i % t.w, Math.floor(i / t.w), ramp[k]);
  }
  return p;
}
const BLOSSOM = [0x5a2a3a, 0x8a3a5a, 0xc8608a, 0xe890b0, 0xf8c0d4, 0xfff0f4];
const PLUMLEAF = [0x1a2a2a, 0x2a3a3a, 0x3a5a4a, 0x4a6a58, 0x6a8a6a, 0x8aa88a];

const RGB = (c: number): [number, number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

/** Grown fruit tree of a species. */
export function fruitSpecies(c: Canvas, L: TexLib, species: string, sway = 0): void {
  switch (species) {
    case 'apple': return fruitTree(c, L, sway);
    case 'cherry':
      tree(c, L, 'beech', 7, sway, 0, [1, 1, 1], 'beech', recolor(L.get('a/beech_leaves'), BLOSSOM));
      return fruitOnCrown(c, RGB(0xa01828), 16, 0.09, 7);
    case 'orange':
      tree(c, L, 'oak', 8, sway, 0, [0.82, 1, 0.82]);
      return fruitOnCrown(c, RGB(0xf08a20), 12, 0.14, 8);
    case 'pear':
      tree(c, L, 'beech', 9, sway, 0, [1, 1.05, 0.9]);
      return fruitOnCrown(c, RGB(0xc8d040), 11, 0.14, 9);
    case 'plum':
      tree(c, L, 'maple', 10, sway, 0, [1, 1, 1], 'beech', recolor(L.get('a/beech_leaves'), PLUMLEAF));
      return fruitOnCrown(c, RGB(0x6a2a8a), 14, 0.11, 10);
    case 'date': return palm(c, L, 11, sway, 8);
  }
}

/** Young fruit tree of a species in three growth stages. */
export function fruitSaplingOf(c: Canvas, L: TexLib, species: string, stage: number, sway = 0): void {
  if (species === 'apple') return fruitSapling(c, L, stage, sway);
  const sp: Record<string, string> = { cherry: 'sapling_maple', orange: 'sapling_oak', pear: 'sapling_beech', plum: 'sapling_maple', date: 'sapling_eucalyptus' };
  if (stage === 0) { c.sprite([0.5, 0.5, 0], { tex: L.get('a/plants/' + sp[species]) }, 2, 2); return; }
  if (species === 'date') {
    const log: Face = { tex: L.get('a/eucalyptus_log_side'), tint: [0.9, 0.78, 0.6] };
    const fr: Face = { tex: L.get('a/oak_leaves'), tint: [0.9, 1.15, 0.75] };
    const hgt = stage === 1 ? 0.6 : 1.2;
    c.box([0.42, 0.42, 0], [0.58, 0.58, hgt], log, log, log, 2);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const px = 0.5 + Math.cos(a) * 0.3, py = 0.5 + Math.sin(a) * 0.3; c.box([px - 0.14, py - 0.14, hgt - 0.1], [px + 0.14, py + 0.14, hgt], fr, fr, fr, 3); }
    return;
  }
  const leaf: Record<string, [Wood, [number, number, number]]> = { cherry: ['beech', [1, 1, 1]], orange: ['oak', [0.82, 1, 0.82]], pear: ['beech', [1, 1.05, 0.9]], plum: ['beech', [1, 1, 1]] };
  const [w, tint] = leaf[species];
  const log: Face = { tex: L.get('a/beech_log_side') };
  const lt = species === 'cherry' ? recolor(L.get('a/beech_leaves'), BLOSSOM) : species === 'plum' ? recolor(L.get('a/beech_leaves'), PLUMLEAF) : L.get(`a/${w}_leaves`);
  const leaves: Face = { tex: lt, cut: CUT[w], tint };
  const tH = stage === 1 ? 0.75 : 1.25;
  c.box([0.4375, 0.4375, 0], [0.5625, 0.5625, tH], log, log, log, 2);
  const r = stage === 1 ? 0.3 : 0.5, s = sway * 0.04;
  c.box([0.5 - r + s, 0.5 - r, tH - 0.125], [0.5 + r + s, 0.5 + r, tH + r * 1.2], leaves, leaves, leaves, 3);
}
