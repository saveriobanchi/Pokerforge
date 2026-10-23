// Screenshot the menus. Usage: node scripts/menus.mjs <outdir> [w] [h] [url]
import { chromium } from '@playwright/test';
const [out, w = '1280', h = '800', url = 'http://localhost:5174/?demo'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 60000 });
const shots = {
  build: 'g.ui.toggleBuild()',
  lounge: 'g.ui.openLounge("perks")',
  mastery: 'g.ui.openLounge("mastery")',
  codex: 'g.ui.openLounge("codex")',
  journal: 'g.ui.openJournal("goals")',
  feats: 'g.ui.openJournal("feats")',
  shop: 'g.ui.openShop()',
  luck: 'g.ui.showLuck()',
  tables: 'g.ui.openTables()',
  well: 'g.select([...g.s.buildings.values()].find((b) => b.type === "well").id)',
  bj: 'g.ui.openTable([...g.s.buildings.values()].find((b) => b.type === "blackjack") ?? [...g.s.buildings.values()].find((b) => b.type === "coin_stand"))',
};
for (const [name, code] of Object.entries(shots)) {
  await page.evaluate((code) => { const g = window.game; g.ui.closeAll(); g.select(null); new Function('g', code)(g); }, code);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/m_${name}.png` });
}
await browser.close();
