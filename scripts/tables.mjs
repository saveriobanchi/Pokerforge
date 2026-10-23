// Screenshot every table's game screen in the demo casino.
// Usage: node scripts/tables.mjs <outdir> [width] [height] [games]
import { chromium } from '@playwright/test';
const [out, w = '1280', h = '800', only = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto('http://localhost:5174/?demo');
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 60000 });
const games = await page.evaluate(() => { const g = window.game; return [...g.s.buildings.values()].filter((b) => ['coin_stand','slots','dice_table','scratch_kiosk','blackjack','roulette','plinko','fortune_wheel','video_poker','gem_mine','keno','crash_pad','baccarat','derby','holdem'].includes(b.type)).map((b) => [b.id, b.type]); });
for (const [id, type] of games) {
  if (only && !only.split(',').includes(type)) continue;
  await page.evaluate((id) => { const g = window.game; g.ui.closeModal(); g.ui.openTable(g.s.buildings.get(id)); }, id);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/t_${type}.png` });
  // press the primary action once and capture mid-play
  const btn = await page.$('.table-modal .controls .actions .btn.primary');
  if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(1600); await page.screenshot({ path: `${out}/t_${type}_play.png` }); }
}
await browser.close();
