# Testing

`npm run check` runs lint, typecheck and the unit suite. `npm run e2e` runs the
browser smoke tests against the production build. CI runs all of it.

## Unit (Vitest, `tests/unit`)

- **rtp.test.ts** — the odds. Exact returns for slots (full reel enumeration,
  free spins included), plinko, the fortune wheel, keno, scratch cards, dice
  and mines; simulated returns with good play for blackjack (basic strategy),
  video poker (the hold advisor), baccarat, Casino Hold'em (the advisor) and
  the derby; crash burst rates; poker hand ranking; honest scratch cards (a
  winning card shows exactly one triple, a losing card none).
- **core.test.ts** — the fresh casino, the well and the broke-player purse,
  wager limits, comps and renown, coin streaks, table upgrades, blackjack
  settlement, patrons filling tills and cashiers banking them, offline
  earnings, save round-trips and export/import, determinism.
- **pacing.test.ts** — a scripted player (`tests/bot.ts`) plays the real game
  through the public API (sensible bets and strategy, building, paving,
  decorating, upgrading, perks) and must reach renown milestones, every table
  and the completed Pokerforge inside measured windows (≈0.7h to renown 10,
  ≈3.4h to renown 20, ≈17h to finish for a tireless player).

## End to end (Playwright, `tests/e2e`, phone landscape + desktop)

Boot without errors; fish the well and toss a coin through the world, and the
casino survives a reload; build a slot machine from the tray and spin it;
every one of the fifteen tables opens and plays a round in the demo casino.

## Visual checks

`scripts/tables.mjs` and `scripts/menus.mjs` screenshot every game screen and
menu against a running dev server; `scripts/art-gallery.mjs` lays out baked art.
