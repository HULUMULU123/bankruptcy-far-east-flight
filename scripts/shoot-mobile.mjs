// Мобильный прогон (эмуляция iPhone 13): кадры по P, горизонтальная прокрутка, касания. node scripts/shoot-mobile.mjs [base]
import { chromium, devices } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5176/';
const b = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + (base.includes('?') ? '&' : '?') + 'still=1&test=1'); await p.waitForFunction(() => window.__setP, null, { timeout: 120000 });
for (const P of [0, 0.22, 0.27, 0.46, 0.69, 0.926, 0.995]) {
  await p.evaluate((P) => __setP(P), P); await p.waitForTimeout(1500);
  const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, off: [...document.querySelectorAll('#ui *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && e.checkVisibility?.() && getComputedStyle(e).opacity > 0.5 && (r.right > innerWidth + 2 || r.left < -2); }).slice(0, 4).map((e) => e.className || e.tagName) }));
  console.log(P, JSON.stringify(m)); await p.screenshot({ path: `docs/milestones/mob-${P}.png` });
}
console.log('errors', errs); await b.close();
