# Pokerforge

A mobile-first sky-casino game built on the **Aetherforge** engine: the same
floating isometric block world, art pipeline, sky, music and interface, with
entirely new mechanics. You start on a 3×3 scrap of grass with a wishing well,
an oak and a coin-toss stand — and 100 chips. Play your way up to a floating
resort of fifteen casino games, patrons, high rollers and the Pokerforge itself.

All chips are play money. Nothing can be bought.

## Play

```bash
npm ci
npm run dev          # http://localhost:5173  (?demo shows a finished casino, ?demo=early a small one, ?dev the dev tools)
npm run check        # lint + typecheck + unit tests (odds, economy, saves, pacing bot)
npm run build        # production PWA in dist/
npm run e2e          # Playwright smoke tests against the production build
```

Live at **https://saveriobanchi.github.io/Pokerforge/** (every push to `main` is tested and republished to the `gh-pages` branch). On a phone, open it and *Add to Home Screen*: it runs
full-screen like an app and saves on the device (export/import in Settings).

## The games

Every game uses real odds; the house edge is shown on each table.

| Game | Unlock | What matters |
| --- | --- | --- |
| Coin Toss | start | let it ride for a streak bonus |
| Lucky Reels (slots) | renown 2 | 1/3/5 lines, wild diamonds, free spins, a progressive crown jackpot |
| Sky Dice | 3 | pick any risk: 98% return at every multiplier |
| Scratch Kiosk | 4 | bronze/silver/gold cards — scratch to reveal, tokens galore |
| Blackjack | 5 | 6 decks, 3:2, double, split; *Card Sense* suggests plays, *Card Counter* shows the count |
| Roulette | 7 | full European layout, many bets per spin |
| Plinko | 9 | 8/12/16 rows × three risk tables |
| Fortune Wheel | 11 | low/medium/high risk wheels |
| Video Poker | 13 | Jacks or Better 9/6, hold & draw |
| Gem Mines | 15 | choose the duds, cash out any time |
| Sky Keno | 17 | pick 1–10 of 40, ten-ball draw |
| Airship Ascent | 19 | a crash game: cash out before the balloon bursts |
| Baccarat | 21 | Player/Banker/Tie and pair side bets, a bead road |
| Sky Derby | 23 | six flyers, odds from form, win or place |
| Casino Hold’em | 25 | ante, see the flop, call or fold against the dealer |

## The loop

- **Play to gain.** Every chip wagered earns renown XP (win or lose), comps
  (a share of every wager, cashed at the well or a cashier) and mastery stars
  for that game. Perks, mastery, the daily hot table and lucky-token sets tilt
  the odds your way until skilled play is genuinely profitable — within each
  table's limit.
- **Become the house.** Patrons arrive (faster with more glamour), sit at your
  tables and fill each table's till with the house's take. Tap tables to empty
  them, or build a Cashier Cage to do it. A Sky Bar keeps them longer, a Cloud
  Hotel brings more, an Airship Dock brings high rollers who play at six times
  the stakes. Offline, the house keeps earning (capped).
- **Build the resort.** Buy land, pave it (tables need cobbles; carpet and gold
  tiles raise the take), decorate for glamour, upgrade tables (higher limits,
  richer patrons), and finally raise the three-stage **Pokerforge**, which opens
  endless **Legend** ranks.
- **Daily luck.** Lady Luck changes every in-game day (lucky breeze, rainy-day
  crowds, starfall…), one table is *hot*, and the seasons turn. The almanac on
  the clock shows what's coming.
- **Collect.** 16 lucky tokens in 4 sets (permanent bonuses), ~90 feats, a goal
  chain from the first coin to the last Legend rank, and gem-bought charms.

## Under the hood

- `src/core/` — pure, deterministic simulation (seeded RNG stored in the save):
  `games/` holds the rules of every game (unit-tested for their returns),
  `play.ts` turns them into rounds that survive a reload, `economy.ts` handles
  stakes, payouts, perks, comps, tokens and the jackpot, `sim.ts` the patrons.
- `src/render/` — the Aetherforge PixiJS renderer, plus `blocks/models/casino.ts`
  (every casino building as Minecraft-style blocks) and `blocks/icons.ts`
  (cards, chips, dice, symbols, tokens, patrons), baked by `npm run art`.
- `src/ui/` — HUD, build tray, the table modal and one screen per game in
  `ui/games/` (canvas wheels, reels, plinko, race track, crash graph).
- `tests/unit/rtp.test.ts` checks every game's return (exactly where possible,
  by simulation for the card games); `tests/bot.ts` is a scripted player whose
  full run (`pacing.test.ts`) checks the progression is reachable and paced.

See `THIRD_PARTY_ASSETS.md` for every external asset and its licence.
