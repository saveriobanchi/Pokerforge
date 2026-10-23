import { Paint, type TexLib } from './tex';
import { CHIP_COLS, text } from './models/casino';

/**
 * Painted pixel art for the interface: playing cards, dice, chips, slot
 * symbols, lucky tokens and currency, all in the packs' palette so the
 * menus match the island.
 */

const SUIT7: string[][] = [
  ['...a...', '..aaa..', '.aaaaa.', 'aaaaaaa', 'aaaaaaa', '.a.a.a.', '...a...', '..aaa..'],
  ['.aa.aa.', 'aaaaaaa', 'aaaaaaa', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'],
  ['...a...', '..aaa..', '.aaaaa.', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'],
  ['..aaa..', '..aaa..', 'aa.a.aa', 'aaaaaaa', 'aa.a.aa', '...a...', '..aaa..'],
];
const SUIT5: string[][] = [
  ['..a..', '.aaa.', 'aaaaa', '.aaa.', '..a..'].map((r, i) => (i === 3 ? 'a.a.a' : r)),
  ['aa.aa', 'aaaaa', 'aaaaa', '.aaa.', '..a..'],
  ['..a..', '.aaa.', 'aaaaa', '.aaa.', '..a..'],
  ['.aaa.', 'aaaaa', 'a.a.a', '..a..', '.aaa.'],
];
const RANK = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RED = 0xd02838, BLACK = 0x1a1a28;

export const CARD_W = 22, CARD_H = 30;

/** A card face (0..51) or the back (−1). */
export function cardTex(card: number): Paint {
  const p = new Paint(CARD_W, CARD_H);
  // rounded white card with a soft shadow edge
  p.rect(1, 0, CARD_W - 2, CARD_H, 0xf8f4ec).rect(0, 1, CARD_W, CARD_H - 2, 0xf8f4ec);
  p.rect(1, CARD_H - 1, CARD_W - 2, 1, 0xc8c0b0).rect(CARD_W - 1, 1, 1, CARD_H - 2, 0xd8d0c0);
  if (card < 0) {
    p.rect(2, 2, CARD_W - 4, CARD_H - 4, 0xb82838);
    for (let y = 3; y < CARD_H - 3; y++) for (let x = 3; x < CARD_W - 3; x++) if ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) p.set(x, y, 0xd84a5a);
    p.frame(3, 3, CARD_W - 6, CARD_H - 6, 0xf0c050);
    p.draw(SUIT7[0], { a: 0xf0c050 }, 7, 11);
    return p;
  }
  const r = card % 13, s = Math.floor(card / 13);
  const col = s === 1 || s === 2 ? RED : BLACK;
  text(p, RANK[r], 2, 2, col);
  p.draw(SUIT5[s], { a: col }, 2, 8);
  // bottom-right corner (not rotated: readable at a glance)
  text(p, RANK[r], CARD_W - 2 - (RANK[r].length * 4 - 1), CARD_H - 7, col);
  if (r >= 9 && r <= 11) {
    // court cards: a gold-framed portrait band
    p.rect(7, 7, 12, 16, r === 9 ? 0x3a6ad8 : r === 10 ? 0xd84a8a : 0xd8a83a).frame(7, 7, 12, 16, 0xe8b440);
    p.rect(10, 9, 6, 5, 0xf0c8a0).rect(10, 9, 6, 1, r === 11 ? 0xf0d050 : 0x5a3a2a);
    if (r !== 9) p.rect(10, 8, 6, 1, 0xf0d050);
    p.set(11, 11, 0x1a1a28); p.set(14, 11, 0x1a1a28);
    p.draw(SUIT5[s], { a: col }, 11, 16);
  } else {
    p.draw(SUIT7[s], { a: col }, 9, 11);
    if (r === 12) p.draw(SUIT7[s], { a: col }, 9, 11); // ace: one proud pip
  }
  return p;
}

export function dieTex(n: number): Paint {
  const p = new Paint(14, 14).rect(1, 0, 12, 14, 0xf4f0e8).rect(0, 1, 14, 12, 0xf4f0e8);
  p.rect(1, 13, 12, 1, 0xc8c0b4).rect(13, 1, 1, 12, 0xc8c0b4);
  const at: Record<number, [number, number][]> = {
    1: [[6, 6]], 2: [[3, 3], [9, 9]], 3: [[3, 3], [6, 6], [9, 9]], 4: [[3, 3], [9, 3], [3, 9], [9, 9]],
    5: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]], 6: [[3, 3], [9, 3], [3, 6], [9, 6], [3, 9], [9, 9]],
  };
  for (const [x, y] of at[n]) p.rect(x, y, 2, 2, n === 1 ? 0xd02838 : 0x1a1a28);
  return p;
}

export function chipTex(i: number): Paint {
  const col = CHIP_COLS[i % CHIP_COLS.length];
  const p = new Paint();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (d > 7.5) continue;
    const a = Math.atan2(y - 7.5, x - 7.5);
    let c = col;
    if (d > 5.6 && Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0) c = 0xf8f4ec;
    if (d > 3.6 && d < 4.4) c = 0xf8f4ec;
    if (d > 7) c = shade(col, 0.6);
    p.set(x, y, c);
  }
  p.set(5, 4, 0xffffff);
  return p;
}

function shade(c: number, k: number): number {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

/** Slot symbols C L B R 7 D K S. */
export function symTex(sym: string, L: TexLib): Paint {
  switch (sym) {
    case 'C': return new Paint(16, 16, L.get('as/cherry'));
    case 'L': return new Paint().draw([
      '................', '......aa........', '.....abba.......', '...aabbbbaa.....', '..abbbbbbbbba...', '.abbcbbbbbbbba..', '.abccbbbbbbbbba.', '.abbbbbbbbbbbba.',
      '.abbbbbbbbbbbda.', '..abbbbbbbbbda..', '...abbbbbbdda...', '....aabbddaa....', '......aaaa......'], { a: 0x8a6a10, b: 0xf8e040, c: 0xfff8b0, d: 0xd8b020 }, 0, 1);
    case 'B': return new Paint().draw([
      '.......aa.......', '......abba......', '.....abbbba.....', '....abbcbbba....', '....abbcbbba....', '...abbbcbbbba...', '...abbbbbbbba...', '..abbbbbbbbbba..',
      '..abbbbbbbbbba..', '.abbbbbbbbbbbba.', '.aaaaaaaaaaaaaa.', '......adda......', '.......aa.......'], { a: 0x7a4a0a, b: 0xf0b020, c: 0xfff0a0, d: 0xc87a10 }, 0, 1);
    case 'R': { const p = new Paint(); p.rect(1, 1, 14, 3, 0x1a1a24).rect(1, 5, 14, 7, 0x1a1a24).rect(1, 13, 14, 2, 0x1a1a24); text(p, 'BAR', 2, 6, 0xf0f0f8); return p; }
    case '7': return new Paint().draw([
      '................', '.aaaaaaaaaaaaa..', '.abbbbbbbbbbbba.', '.abccccccccccba.', '.aaaaaaaaaabcba.', '.........abcba..', '........abcba...', '.......abcba....',
      '......abcba.....', '.....abcba......', '.....abcba......', '....abcba.......', '....abcba.......', '....aaaaa.......'], { a: 0x6a0a10, b: 0xd82838, c: 0xff8a7a }, 0, 1);
    case 'D': return new Paint(16, 16, L.get('as/default_diamond'));
    case 'K': return crownTex();
    case 'S': return starTex(0xffd040, 0xfff6c0, 0x8a5a0a);
    default: return new Paint();
  }
}

export function crownTex(): Paint {
  return new Paint().draw([
    '................', '.a.....a.....a..', 'aba...aba...aba.', '.ba...aba...ab..', '.bba.abbba.abb..', '.bbbabbcbbabbb..', '.bbbbbbbbbbbbb..', '.bdbbbdbbbdbbb..',
    '.bbbbbbbbbbbbb..', '.aaaaaaaaaaaaa..', '.beebeebeebeeb..', '.aaaaaaaaaaaaa..'], { a: 0x8a5a0a, b: 0xf0c040, c: 0xfff6c0, d: 0xd82838, e: 0x3a7ad8 }, 1, 2);
}

export function starTex(main: number, hi: number, edge: number): Paint {
  const p = new Paint();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const a = Math.atan2(y + 0.5 - 8.5, x + 0.5 - 8) + Math.PI / 2;
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8.5);
    const R = 3.2 + 4.2 * Math.pow(Math.abs(Math.cos(a * 2.5)), 3);
    if (d < R) p.set(x, y, d > R - 1 ? edge : d < 2.5 ? hi : main);
  }
  return p;
}

export function gemTex(L: TexLib): Paint {
  return new Paint(16, 16, L.get('as/default_diamond')).tint([1.25, 0.7, 1.15]);
}

/** Lucky tokens. */
export function tokenTex(id: string, L: TexLib): Paint {
  switch (id) {
    case 'clover': return new Paint().draw([
      '................', '...aa....aa.....', '..abba..abba....', '..abbba.abbba...', '...abbbabbba....', '....aabbbaa.....', '..aabbbcbbbaa...', '.abbbbbabbbbba..',
      '.abbbba.abbbba..', '..abba...abba...', '...aa..d..aa....', '.......d........', '......d.........'], { a: 0x1a4a1a, b: 0x4ab84a, c: 0x8ae87a, d: 0x3a6a2a }, 0, 1);
    case 'horseshoe': return new Paint().draw([
      '................', '...aaaaaaaaa....', '..abbbbbbbbba...', '.abbcaaaaacbba..', '.abba.....abba..', '.abca.....acba..', '.abba.....abba..', '.abca.....acba..',
      '.abba.....abba..', '.abba.....abba..', '.aaaa.....aaaa..'], { a: 0x4a4a5a, b: 0xb8b8c8, c: 0x6a6a7a }, 0, 2);
    case 'rabbit_foot': return new Paint().draw([
      '................', '.....aaa........', '....abbba.......', '....abbba.......', '....abbbba......', '....abbbba......', '...abbbbbba.....', '...abbbbbba.....',
      '..abbbcbcbba....', '..abbcbcbcba....', '...aaaaaaaa.....', '.....dddd.......', '.....deed.......'], { a: 0x8a7a6a, b: 0xf0e8d8, c: 0xe8a8b8, d: 0xc89a3a, e: 0xf0d060 }, 1, 1);
    case 'ladybug': return new Paint().draw([
      '................', '......aaaa......', '.....aaaaaa.....', '...abbbabbbba...', '..abbcbabcbbba..', '..abbbbabbbcba..', '.abcbbbabbbbbba.', '.abbbbcabbbcbba.',
      '.abbbbbabbbbbba.', '..abbcbabcbbba..', '...abbbabbbba...', '....aaaaaaaa....'], { a: 0x1a1a24, b: 0xd82838, c: 0x1a1a24 }, 0, 1);
    case 'golden_dice': { const p = new Paint(); p.rect(2, 3, 11, 11, 0xf0c040).frame(2, 3, 11, 11, 0x8a5a0a); for (const [x, y] of [[4, 5], [7, 8], [10, 11], [10, 5], [4, 11]]) p.rect(x, y, 2, 2, 0x5a3a0a); p.rect(3, 4, 4, 1, 0xfff6c0); return p; }
    case 'ace_spades': { const p = new Paint(); p.rect(3, 1, 10, 14, 0xf8f4ec).frame(3, 1, 10, 14, 0xb8b0a0); p.draw(SUIT7[0], { a: 0x1a1a28 }, 5, 4); text(p, 'A', 4, 2, 0x1a1a28); return p; }
    case 'red_chip': return chipTex(0);
    case 'marked_card': { const p = new Paint(); p.rect(3, 1, 10, 14, 0xb82838).frame(3, 1, 10, 14, 0x6a1020); for (let y = 3; y < 13; y += 2) p.rect(5, y, 6, 1, 0xd84a5a); p.rect(9, 2, 3, 3, 0xf0d050); return p; }
    case 'moon': { const p = new Paint(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const a = Math.hypot(x + 0.5 - 8, y + 0.5 - 8), b = Math.hypot(x + 0.5 - 11, y + 0.5 - 6); if (a < 6.5 && b > 5) p.set(x, y, a > 5.6 ? 0xb8a040 : 0xfff0a0); } return p; }
    case 'star': return starTex(0xffd040, 0xffffff, 0x8a5a0a);
    case 'comet': { const p = new Paint(); for (let k = 0; k < 10; k++) p.rect(1 + k, 12 - k, 2, 2, k > 6 ? 0xfff6c0 : k > 3 ? 0x8ad8ff : 0x3a6ad8); p.rect(11, 2, 4, 4, 0xffffff).frame(10, 1, 6, 6, 0x8ad8ff); return p; }
    case 'owl': return new Paint().draw([
      '................', '..a.........a...', '..aa.......aa...', '..abaaaaaaaba...', '..abbbbbbbbba...', '.abccbbbbccbba..', '.abcdcbbbcdcba..', '.abccbbebbccba..',
      '.abbbbbebbbbba..', '.abbffffffbbba..', '..abffffffbba...', '...abbbbbbba....', '....ag...ga.....'], { a: 0x3a2a1a, b: 0x8a6a4a, c: 0xf0d8a0, d: 0x1a1a24, e: 0xf0a020, f: 0xc8a888, g: 0xf0a020 }, 0, 1);
    case 'pearl': { const p = new Paint(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d < 6) p.set(x, y, d > 5 ? 0xb8b0c8 : x + y < 12 ? 0xffffff : 0xe8e0f0); } p.rect(5, 5, 2, 2, 0xffffff); return p; }
    case 'ruby': return new Paint(16, 16, L.get('as/ruby'));
    case 'emerald': return new Paint(16, 16, L.get('as/emerald'));
    case 'crown': return crownTex();
    default: return new Paint();
  }
}

/** A small stack of chips for the HUD. */
export function chipsIcon(): Paint {
  const p = new Paint();
  const cols = [CHIP_COLS[0], CHIP_COLS[5], CHIP_COLS[1]];
  for (let k = 0; k < 3; k++) {
    const y = 11 - k * 3, col = cols[k];
    p.rect(2, y, 12, 3, shade(col, 0.7)).rect(3, y - 1, 10, 1, col).rect(2, y, 12, 1, col);
    for (let x = 3; x < 14; x += 3) p.set(x, y + 1, 0xf8f4ec);
  }
  p.rect(3, 1, 10, 2, CHIP_COLS[5]).set(4, 1, 0xfff6c0);
  return p;
}

export function compTex(): Paint {
  const p = new Paint();
  p.rect(1, 4, 14, 8, 0xe8d8a8).frame(1, 4, 14, 8, 0x8a6a2a);
  for (let y = 5; y < 11; y += 2) p.set(5, y, 0x8a6a2a);
  text(p, 'VIP', 6, 6, 0xb82838);
  return p;
}

/** Patrons: eight outfits plus the high roller (look 8); frames 0–1 walk, 2 plays (arm up). */
const OUTFITS: [number, number, number][] = [
  // coat, trousers, hair
  [0xb82838, 0x2a2a3a, 0x3a2418], [0x3a6ad8, 0x3a3a4a, 0xe8c070], [0x2a8a4a, 0x4a3a2a, 0x1a1a1a], [0xe8b440, 0x2a2a3a, 0x8a4a1a],
  [0x8a4ad8, 0x2a2a3a, 0xd8d0c8], [0xf0e2c4, 0x5a3a2a, 0x5a3a1a], [0x1a1a24, 0x1a1a24, 0xc8462a], [0xd86a9a, 0x3a3a5a, 0x2a1a10],
  [0x1a1a24, 0x1a1a24, 0x1a1a24],
];
const SKIN = [0xf0c8a0, 0xc8946a, 0x8a5a3a, 0xf8dcc0];

export function personTex(look: number, frame: number): Paint {
  const [coat, legs, hair] = OUTFITS[look % OUTFITS.length];
  const skin = SKIN[look % SKIN.length];
  const vip = look === 8;
  const p = new Paint(10, 22);
  // head
  p.rect(3, 3, 4, 4, skin).rect(3, 2, 4, 2, hair).set(3, 4, hair);
  p.set(6, 4, 0x1a1a24);
  if (vip) p.rect(2, 1, 6, 1, 0x1a1a24).rect(3, -1 + 1, 4, 1, 0x1a1a24).rect(3, 0, 4, 1, 0x1a1a24).rect(3, 1, 4, 1, 0xd8a83a);
  // body
  p.rect(2, 7, 6, 7, coat).rect(4, 7, 2, 2, vip ? 0xf8f4ec : shade(coat, 0.8));
  if (vip) p.set(5, 8, 0xd82838);
  // arms
  const up = frame === 2;
  p.rect(1, up ? 5 : 8, 1, up ? 4 : 5, coat).set(1, up ? 4 : 13, skin);
  p.rect(8, 8, 1, 5, coat).set(8, 13, skin);
  if (up) p.rect(0, 3, 2, 2, 0xe8b440); // a chip held high
  // legs
  const step = frame === 1;
  p.rect(3, 14, 2, step ? 5 : 6, legs).rect(5, 14, 2, step ? 6 : 5, legs);
  p.rect(2, step ? 18 : 19, 3, 1, 0x1a1a1a).rect(5, step ? 19 : 18, 3, 1, 0x1a1a1a);
  return p;
}
