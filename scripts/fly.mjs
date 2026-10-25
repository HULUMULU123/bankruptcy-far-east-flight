// Запись пролёта: колесо мыши с постоянной скоростью, видео docs/milestones/m4-flight.webm + отчёт по угловой скорости.
import { chromium } from 'playwright';
import fs from 'node:fs';
const W = 1280, H = 720, pxPerSec = Number(process.argv[2] ?? 260);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: 'docs/milestones/tmp-video', size: { width: W, height: H } } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:5176/?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__rig !== 'undefined', null, { timeout: 120000 });
await page.waitForTimeout(2500);
const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await page.mouse.move(W / 2, H / 2);
const step = 16, per = (pxPerSec * step) / 1000;
const log = []; let maxAng = 0, minFps = 99;
for (let y = 0; y < total; y += per) {
  await page.mouse.wheel(0, per);
  await page.waitForTimeout(step);
  if (Math.round(y / per) % 60 === 0) log.push(await page.evaluate(() => ({ P: __scroll.P, txt: document.getElementById('hud').textContent })));
}
await page.waitForTimeout(2500);
const last = await page.evaluate(() => document.getElementById('hud').textContent);
const stats = log.map((l) => l.txt.match(/fps (\d+)/)?.[1]).filter(Boolean).map(Number);
console.log('seconds ~', (total / pxPerSec).toFixed(1), 'minFps', Math.min(...stats), 'final hud:', last, 'errors:', errs);
const tr = await page.evaluate(() => window.__trace ?? []);
// tr: [P, угловая скорость взгляда °/с, рассыпание, запас над крышами м]; джерк = скачок угловой скорости между кадрами
const free = tr.filter((r) => r[2] < 0.05);
const mx = (a, i) => (a.length ? Math.max(...a.map((r) => r[i])).toFixed(1) : 'n/a');
// скачок положения камеры между кадрами (м): ищем рывки
let jump = 0; for (let i = 1; i < tr.length; i++) jump = Math.max(jump, Math.hypot(tr[i][4] - tr[i - 1][4], tr[i][5] - tr[i - 1][5], tr[i][6] - tr[i - 1][6]));
const p99 = (a) => { const v = a.map((r) => r[1]).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length * 0.99)].toFixed(1) : 'n/a'; };
console.log(JSON.stringify({ frames: tr.length, rotP99OutsideScatter: p99(free), rotMaxOutsideScatter: mx(free, 1), rotMaxInScatter: mx(tr.filter((r) => r[2] >= 0.05), 1), maxCameraStepPerFrame_m: jump.toFixed(1), minClearance_m: Math.min(...tr.map((r) => r[3])).toFixed(1) }));
await ctx.close();
const f = fs.readdirSync('docs/milestones/tmp-video')[0];
fs.renameSync(`docs/milestones/tmp-video/${f}`, 'docs/milestones/m4-flight.webm'); fs.rmdirSync('docs/milestones/tmp-video');
await browser.close();
