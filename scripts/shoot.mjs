// Скриншоты для вех: node scripts/shoot.mjs <prefix> <stop,stop,...> ; требует запущенный dev-сервер на :5176
import { chromium } from 'playwright';
const [prefix = 'm3', stopsArg = '0,5'] = process.argv.slice(2);
const stops = stopsArg.split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:5176/?still=1&test=1', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__go === 'function', null, { timeout: 120000 });
  for (const s of stops) {
    await page.evaluate((i) => window.__go(i), s);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `docs/milestones/${prefix}-stop${s}-${w}.png` });
  }
  console.log(w, 'errors:', errs.slice(0, 3));
  await page.close();
}
await browser.close();
