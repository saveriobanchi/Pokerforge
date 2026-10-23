import { P } from '../render/art/palette';
import { PixelCanvas, rgb, type RGBA } from '../render/art/pixel';
import { art } from '../render/artpack';

const cache = new Map<string, string>();

function toUrl(pc: PixelCanvas): string {
  return pc.toCanvas().toDataURL();
}

/** Draw a glyph from an ASCII bitmap: '#' main, '+' accent, '.' shade. */
function bitmap(rows: string[], main: RGBA = P.cream[2], accent: RGBA = P.gold[3], shade: RGBA = P.cream[0]): PixelCanvas {
  const h = rows.length, w = rows[0].length;
  const c = new PixelCanvas(w + 2, h + 2);
  void shade;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '#') c.set(x + 1, y + 1, main);
    else if (ch === '+') c.set(x + 1, y + 1, accent);
  }));
  // soft drop shadow down-right only, so thin strokes stay crisp
  const sh: [number, number][] = [];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.alpha(x, y) > 200 && !c.alpha(x + 1, y + 1)) sh.push([x + 1, y + 1]);
  for (const [x, y] of sh) c.set(x, y, rgb(0x0a0e10, 150));
  return c;
}

const G: Record<string, string[]> = {
  build: [
    '...######....',
    '..########...',
    '..#######++..',
    '...####..++..',
    '......#+.....',
    '.....#+......',
    '....#+.......',
    '...#+........',
    '..#+.........',
    '.#+..........',
    '#+...........',
  ],
  craft: [
    '....+...+....',
    '.....+.+.....',
    '......+......',
    '.....+.+.....',
    '....+...+....',
    '.............',
    '#############',
    '#############',
    '.##.......##.',
    '.##.......##.',
    '.##.......##.',
  ],
  stash: [
    '....#####....',
    '...##...##...',
    '..##.....##..',
    '.###########.',
    '##.........##',
    '#....+++....#',
    '#....+.+....#',
    '#....+++....#',
    '#...........#',
    '#...........#',
    '##.........##',
    '.###########.',
  ],
  journal: [
    '.###########.',
    '.#+........#.',
    '.#+.#####..#.',
    '.#+........#.',
    '.#+.####...#.',
    '.#+........#.',
    '.#+.#####..#.',
    '.#+........#.',
    '.#+.###....#.',
    '.#+........#.',
    '.###########.',
    '...+.........',
  ],
  eye: [
    '.............',
    '....#####....',
    '..##.....##..',
    '.#...###...#.',
    '#...#+++#...#',
    '#...#+#+#...#',
    '#...#+++#...#',
    '.#...###...#.',
    '..##.....##..',
    '....#####....',
    '.............',
  ],
  menu: [
    '.............',
    '.###########.',
    '.............',
    '.............',
    '.###########.',
    '.............',
    '.............',
    '.###########.',
    '.............',
  ],
  close: [
    '#.......#',
    '.#.....#.',
    '..#...#..',
    '...#.#...',
    '....#....',
    '...#.#...',
    '..#...#..',
    '.#.....#.',
    '#.......#',
  ],
  rotate: [
    '...#####.....',
    '.##.....##.+.',
    '#.........#++',
    '#..........+.',
    '#............',
    '#...........#',
    '#...........#',
    '.#.........#.',
    '..##.....##..',
    '....#####....',
  ],
  trash: [
    '....###....',
    '###########',
    '.#.......#.',
    '.#.#.#.#.#.',
    '.#.#.#.#.#.',
    '.#.#.#.#.#.',
    '.#.#.#.#.#.',
    '.#.......#.',
    '..#######..',
  ],
  move: [
    '.....+.....',
    '....+++....',
    '.....#.....',
    '..+..#..+..',
    '.++#####++.',
    '..+..#..+..',
    '.....#.....',
    '....+++....',
    '.....+.....',
  ],
  check: [
    '..........#',
    '.........##',
    '........##.',
    '#......##..',
    '##....##...',
    '.##..##....',
    '..####.....',
    '...##......',
  ],
  land: [
    '.....+.....',
    '...+++++...',
    '.+++++++++.',
    '#+++++++++#',
    '###+++++###',
    '.####+####.',
    '...#####...',
    '....###....',
    '.....#.....',
  ],
  hand: [
    '....#.#.#..',
    '....#.#.#.#',
    '..#.#.#.#.#',
    '..#.#.#.#.#',
    '..#########',
    '..#########',
    '#.########.',
    '##########.',
    '.########..',
    '..######...',
  ],
  spark: [
    '.....+.....',
    '.....+.....',
    '....+#+....',
    '++++###++++',
    '....+#+....',
    '.....+.....',
    '.....+.....',
  ],
};

export function glyph(name: string): string {
  const k = 'g:' + name;
  let u = cache.get(k);
  if (!u) {
    const rows = G[name];
    u = toUrl(bitmap(rows, name === 'close' ? P.cream[1] : P.cream[2]));
    cache.set(k, u);
  }
  return u;
}

/** Building thumbnail from the baked art (its fullest-looking variant). */
export function thumb(type: string): string {
  const sp = art.sprites.get(type);
  if (!sp) return '';
  const v = ['st3', 'd1'].find((k) => sp.variants[k]) ?? sp.main;
  return art.url(`${type}:${v}:0`);
}

/** Land tile thumbnail: a lone top piece of that floor. */
export function landThumb(floor: string): string {
  return art.url(`top:${floor}:15:0`);
}

/** Painted interface icon (build, stash, journal …) from the art pack. */
export function uiIcon(name: string): string {
  return art.url(`ui:${name}`);
}

export function appMark(): string {
  return thumb('tree');
}

export { rgb };
