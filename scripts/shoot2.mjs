// Кадры по произвольным P: node scripts/shoot2.mjs prefix P1,P2,...
import { chromium } from 'playwright';
const [prefix = 'x', ps = '0.5'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 500)));
await pg.goto('http://127.0.0.1:5176/?still=1&test=1'); await pg.waitForFunction(() => window.__setP, null, { timeout: 120000 });
for (const P of ps.split(',')) { await pg.evaluate((P) => __setP(Number(P)), P); await pg.waitForTimeout(1800); await pg.screenshot({ path: `docs/milestones/${prefix}-${P}.png` }); }
console.log('errors', errs.slice(0, 3)); await b.close();
