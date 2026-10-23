# Architecture

```
src/
  core/            pure TypeScript simulation — no DOM, fully unit-tested
    content/       games, buildings, land, perks, tokens, goals, feats, daily luck
    games/         the rules of every game (cards, slots, quick games, table games)
    play.ts        rounds: stakes out through wager(), winnings back through settle()
    economy.ts     bet limits, payouts and profit bonuses, comps, XP, tokens, jackpot
    state.ts       world state, tile/building indices, seeded RNG
    sim.ts         fixed 20 Hz tick: patrons, tills, cashiers, the well, goals
    actions.ts     every player command (place, expand, pave, upgrade, perks, …)
    offline.ts     time-away model (estimated patron take, capped)
    save.ts        versioned JSON save, export/import
  render/
    hd/            offline art renderer (runs in Node at build time):
      sdf.ts       signed-distance model kit (boxes, cylinders, roofs, blobs…)
      render.ts    iso sphere tracer: soft shadows, AO, sky/sun/bounce light,
                   pixel-art palette snapping and selective outlines
      mats.ts      procedural materials (planks, masonry, foliage, metal…)
      models/      every building, tree, item icon, terrain piece and decor
      catalog.ts   what to bake: frames, variants, lights, smoke points
    artpack.ts     loads the baked sheets and hands out textures / UI URLs
    art/           small pixel-canvas helpers for effects and UI glyphs
    world.ts       Pixi scene: chunked terrain, depth-sorted buildings, patrons,
                   lights, overlays, celebrations
    sky.ts         golden-hour sky gradient, sun bloom, painterly clouds,
                   distant voxel islets with waterfalls, stars, cloud sea
    camera.ts      inertial pan, focal pinch-zoom, eased focus, soft bounds
    effects.ts     pooled particles
    atlas.ts       shelf-packed texture atlas (few draw calls)
  input/gestures.ts  touch-first gestures (mouse emulates a finger)
  ui/              DOM interface (HUD, build tray, panels, journal, settings)
  platform/        IndexedDB storage, Web Audio synth, haptics
  game.ts          loop, modes, input→actions with feedback, persistence
```

Pokerforge keeps Aetherforge's renderer, art pipeline, sky, camera, gestures,
storage and audio engine; the simulation, content, interface and casino art are
new. Each casino game's screen lives in `src/ui/games/`.

## Simulation

- Deterministic fixed-step tick (`TICK = 0.05 s`). Every gamble and patron
  draws from one seeded RNG stored in the save, so identical inputs replay
  identically (tested).
- Patrons arrive at a rate set by glamour, perks, luck, season and services,
  take a free seat (weighted toward richer tables), walk in, play for a while
  and fill the table's till with its take. Per-table take and till capacity are
  cached and refreshed each second.
- Rounds of multi-step games (blackjack, video poker, mines, crash, hold'em,
  coin streaks, slot free spins) live in `s.rounds`, so a reload never loses a
  stake. Blackjack and baccarat shoes persist between hands.

## Offline progression

Short absences (< 90 s) are simulated exactly. Longer ones estimate seat
occupancy from the arrival rate and stay length, at 50% efficiency for up to
four hours (six with a Gold Vault). Tables beside a cashier bank straight away;
others fill their tills.

## Rendering & performance

- All game art is built from Minecraft-style blocks in code
  (src/render/blocks) and textured with the vendored CC0 packs in `art/cc0/`
  (see THIRD_PARTY_ASSETS.md). `npm run art` (part of `npm run dev` and
  `npm run build`) bakes it into one PNG sheet plus a manifest in
  `public/art/` (~0.8 MB, generated, not committed) in a few seconds, and
  skips the work when the sources and textures are unchanged.
- The block renderer rasterises textured faces in the game's exact
  isometric projection (16×16 textures at 2×2 world pixels per texel) with a
  z-buffer, then lights the picture: ray-traced sun shadows (objects also
  bake a translucent ground shadow), screen-space ambient occlusion, a sun
  rim on exposed top edges, warm point lights, depth haze under the island
  and a 1 px hue-shifted outline. Machine faces (furnace mouths, gears,
  saws, sails, belts…) are painted from pack textures; animation frames are
  separate bakes.
- Terrain is one rock-column sprite plus one top sprite per tile (chosen by
  depth-from-edge and the open-edge mask), drawn back to front. Each top is
  rendered with its back neighbours present (then cut away) so edge
  highlights only appear on real island edges. Decor and waterfalls are
  scattered deterministically per tile.
- The interface frames (panels, buttons, slots) are baked from the same
  textures and applied with CSS `border-image` at whole-pixel scales.
- The world is drawn crisp at a whole number of device pixels per art pixel
  into an offscreen texture, then scaled smoothly to the exact zoom, so pixels
  stay even-sized and pans/zooms glide sub-pixel without shimmer. The sky is
  drawn with smooth filtering on its own.
- Buildings, terrain, items and decor come from one baked sheet → heavily batched.
- Off-screen buildings are culled; sprites, items and particles are pooled.
- Night lights are additive sprites, drawn only when it is dark.
- Adaptive quality: if a device cannot hold ~40 fps it switches once to 1×
  resolution, fewer clouds and particles (overridable in Settings).
- Measured: ~2 ms CPU per frame for a mid-size factory; ~0.03 ms per sim tick
  for ~30 machines (linear in machine count).

## Saves

`save` key in IndexedDB (localStorage fallback), autosave every ~20 s and on
hide/close, three rotating backups every 5 minutes, migrations by version,
corrupt-slot recovery, text export/import.
