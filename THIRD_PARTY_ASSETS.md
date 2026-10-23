# Third-party assets

Pokerforge reuses the engine, art pipeline and asset set of **Aetherforge**
(same owner, `saveriobanchi/Claude-AETHERFORGE`). Everything visible or audible
that is not listed below is original work generated in code:

- All casino buildings, tables, decor, floors, the Pokerforge wonder, patrons,
  playing cards, dice, chips, slot symbols and lucky tokens are built or painted
  in code (`src/render/blocks/models/casino.ts`, `src/render/blocks/icons.ts`)
  and textured from the CC0 packs below by the bake step (`npm run art`).
- All sound (chips, cards, reels, wheels, jingles, ambience) is synthesised at
  runtime with the Web Audio API (`src/platform/audio.ts`). No samples are used.

## Art packs (CC0, vendored in `art/cc0/`)

| Folder | Pack | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `art/cc0/blocks-a/` | 16x16 Block Texture Set (blocks + plants) | ARoachIFoundOnMyPillow | https://opengameart.org/content/16x16-block-texture-set | CC0 1.0 |
| `art/cc0/blocks-b/` | 16*16 Block Textures | ARoachIFoundOnMyPillow | https://opengameart.org/content/1616-block-textures | CC0 1.0 |
| `art/cc0/assorted/` | Assorted Minecraft style textures | JoeEnderman | https://opengameart.org/content/assorted-minecraft-style-textures-defaultsteelblockpng | CC0 1.0 |
| `art/cc0/kenney-voxel/` | Voxel Pack (felt "cotton" tiles, wood, track, ores…) | Kenney (www.kenney.nl) | https://kenney.nl/assets/voxel-pack | CC0 1.0 — `art/cc0/kenney-voxel/License.txt` |

Kenney's 128×128 tiles are averaged down to the 16-texel block grid at bake
time. Credit is not required for CC0 work but is given here with thanks.

## Fonts

| Asset | Author | Licence |
| --- | --- | --- |
| Pixelify Sans (`src/assets/fonts/PixelifySans.ttf`) | The Pixelify Sans Project Authors | SIL OFL 1.1 — `licenses/PixelifySans-OFL.txt` |
| VT323 (`src/assets/fonts/VT323.woff2`) | The VT323 Project Authors (Peter Hull) | SIL OFL 1.1 — `licenses/VT323-OFL.txt` |
| Atkinson Hyperlegible (`src/assets/fonts/AtkinsonHyperlegible.ttf`) | Braille Institute of America | SIL OFL 1.1 — `licenses/AtkinsonHyperlegible-OFL.txt` |

## Code libraries (bundled)

| Library | Licence |
| --- | --- |
| PixiJS 8 (`pixi.js`) | MIT |

Build/test tooling (Vite, TypeScript, Vitest, Playwright, ESLint, esbuild, pngjs) is not shipped.

## Note on further packs

Popular free card/casino packs (Kenney's Playing Cards and Boardgame packs,
OpenGameArt pixel cards) were considered, but their hosts were unreachable from
the build environment; the cards and chips are instead painted in code in the
same pixel style as the rest of the game.
