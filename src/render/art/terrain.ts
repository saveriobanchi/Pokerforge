/** Isometric tile geometry: tiles are 64×32 world pixels. */
export const TILE_W = 64;
export const TILE_H = 32;

/** World-pixel centre of tile (x, y). */
export function tileCenter(x: number, y: number): [number, number] {
  return [(x - y) * 32, (x + y) * 16];
}
