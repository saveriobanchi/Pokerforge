// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [dpr]
import { chromium } from '@playwright/test';
const [url, out, w = '1400', h = '900', wait = '600', dpr = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, hasTouch: true });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e.message));
await page.goto(url);
await page.waitForFunction(() => window.artReady === true || window.gameReady === true, null, { timeout: 60000 }).catch(() => console.log('ready timeout'));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
