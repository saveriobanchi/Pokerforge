import { expect, test, type Page } from '@playwright/test';
import type { Game } from '../../src/game';

declare global {
  interface Window { gameReady?: boolean; game: Game }
}

async function fresh(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 60_000 });
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('pokerforge'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto('./');
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 60_000 });
}

async function tapTile(page: Page, x: number, y: number, dy = -10) {
  const [sx, sy] = await page.evaluate(([x, y]) => window.game.view.tileToScreen(x, y), [x, y]);
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  if (touch) await page.touchscreen.tap(sx, sy + dy);
  else await page.mouse.click(sx, sy + dy);
  await page.waitForTimeout(120);
}

test('boots into the casino without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fresh(page);
  await expect(page.locator('#boot')).toHaveClass(/gone/);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.main-btn[aria-label=Build]')).toBeVisible();
  expect(await page.evaluate(() => window.game.s.tiles.size)).toBe(9);
  expect(await page.evaluate(() => window.game.s.chips)).toBe(100);
  expect(errors).toEqual([]);
});

test('fish the well, toss a coin, and the casino survives a reload', async ({ page }) => {
  await fresh(page);
  const before = await page.evaluate(() => window.game.s.chips);
  await tapTile(page, 0, 0, -20);
  expect(await page.evaluate(() => window.game.s.stats.wellTaps)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.game.s.chips)).toBeGreaterThan(before);
  // open the coin stand through the world and play a toss
  await tapTile(page, 1, 0, -18);
  await expect(page.locator('.table-modal')).toBeVisible();
  await page.locator('.table-modal .big-call').first().click();
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => window.game.s.stats.playsBy.coin ?? 0)).toBe(1);
  if (await page.locator('.table-modal .btn.primary', { hasText: 'Collect' }).isVisible()) await page.locator('.table-modal .btn.primary', { hasText: 'Collect' }).click();
  await page.locator('.table-modal .close').click();
  await page.evaluate(() => window.game.save());
  const plays = await page.evaluate(() => window.game.s.stats.plays);
  await page.reload();
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.game.s.stats.plays)).toBe(plays);
});

test('build a slot machine from the tray and spin it', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => { const s = window.game.s; s.chips = 5000; s.renown.level = 3; });
  await page.locator('.main-btn[aria-label=Build]').click();
  await page.locator('.sheet .tab', { hasText: 'Games' }).click();
  await page.locator('.sheet .card', { hasText: 'Lucky Reels' }).click();
  await tapTile(page, -1, 1, -6);
  expect(await page.evaluate(() => [...window.game.s.buildings.values()].some((b) => b.type === 'slots'))).toBe(true);
  await page.evaluate(() => { const g = window.game; g.setMode({ kind: 'play' }); g.ui.openTable([...g.s.buildings.values()].find((b) => b.type === 'slots')!); });
  await page.locator('.table-modal .spin-btn').click();
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.game.s.stats.playsBy.slots ?? 0)).toBeGreaterThan(0);
});

test('every table opens and plays a round in the demo casino', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?demo');
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 60_000 });
  await page.evaluate(() => { window.game.settings.reduced = true; });
  const types = await page.evaluate(() => [...window.game.s.buildings.values()].filter((b) => window.game.s.buildings.get(b.id) && ['coin_stand', 'slots', 'dice_table', 'scratch_kiosk', 'blackjack', 'roulette', 'plinko', 'fortune_wheel', 'video_poker', 'gem_mine', 'keno', 'crash_pad', 'baccarat', 'derby', 'holdem'].includes(b.type)).map((b) => b.id));
  expect(types.length).toBe(15);
  const before = await page.evaluate(() => window.game.s.stats.plays);
  for (const id of types) {
    await page.evaluate((id) => { const g = window.game; g.ui.closeModal(); g.ui.openTable(g.s.buildings.get(id)!); }, id);
    await page.waitForTimeout(150);
    const primary = page.locator('.table-modal .controls .big-call:visible, .table-modal .controls .actions .btn.primary:visible').last();
    if (await page.locator('.kn').count()) await page.locator('.kn').first().click();
    if (await page.locator('.r-cell').count()) await page.locator('.r-cell.red').first().click();
    if (await page.locator('.bac-spot.banker').count()) await page.locator('.bac-spot.banker').click();
    await primary.click();
    await page.waitForTimeout(600);
  }
  expect(await page.evaluate(() => window.game.s.stats.plays)).toBeGreaterThan(before + 10);
  expect(errors).toEqual([]);
});
