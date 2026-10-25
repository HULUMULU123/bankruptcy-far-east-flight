// Выгрузка контента с https://bankrufeast.ru/ (Playwright). Пары «спикер → роль → доклад» берём по координатам элементов Tilda,
// а не из плоского текста (в нём порядок перемешан). Результат: scripts/cache/content_raw.json и фото в scripts/cache/speakers/.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'scripts/cache'; fs.mkdirSync(`${OUT}/speakers`, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://bankrufeast.ru/', { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(2500);

const raw = await p.evaluate(() => {
  const recs = [...document.querySelectorAll('.t-rec')];
  const T = (r) => r.innerText.replace(/[ \t]+/g, ' ').trim();
  const about = T(document.getElementById('rec2270138171'));
  // сессия = запись с временем и названием, за ней идёт запись со спикерами
  const sessions = [];
  recs.forEach((r, i) => {
    const m = T(r).match(/^(\d{2}:\d{2}) – (\d{2}:\d{2})\s+(.+?)\s+(\d+) МИН$/s);
    if (!m) return;
    const next = recs[i + 1];
    const R = next.getBoundingClientRect();
    const els = [...next.querySelectorAll('.tn-atom')].filter((e) => e.innerText?.trim()).map((e) => {
      const bb = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { x: Math.round(bb.left - R.left), y: Math.round(bb.top - R.top), w: cs.fontWeight, t: e.innerText.replace(/\s+/g, ' ').trim() };
    });
    sessions.push({ start: m[1], end: m[2], title: m[3].replace(/\s+/g, ' '), minutes: Number(m[4]), els });
  });
  const reg = T(document.getElementById('rec2270263331'));
  const photos = [...document.querySelectorAll('#rec2286667451 img')].map((im) => im.src);
  return { about, sessions, reg, photos };
});

// пары по координатам: жирный (600) = имя; роль — тот же x, ниже на ~36; доклад — заглавными, x=48, выше имени на ~60
const days = [1, 1, 1, 1, 2, 2];
raw.sessions.forEach((s, i) => {
  s.day = days[i];
  const people = s.els.filter((e) => e.w === '600').map((n) => {
    const role = s.els.find((e) => e.w !== '600' && Math.abs(e.x - n.x) < 6 && Math.abs(e.y - (n.y + 36)) < 10)?.t ?? null;
    const talk = s.els.filter((e) => Math.abs(e.x - 48) < 6 && n.y - e.y > 20 && n.y - e.y < 75 && e.t === e.t.toUpperCase() && e.t !== 'СПИКЕРЫ' && e.t !== 'МОДЕРАТОР').sort((a, b) => b.y - a.y)[0]?.t ?? null;
    return { name: n.t, role, talk, moderator: n.x > 800 };
  });
  s.people = people; delete s.els;
});
fs.writeFileSync(`${OUT}/content_raw.json`, JSON.stringify(raw, null, 1));
// фото: порядок как на сайте; 24 штуки — иначе остановка
if (raw.photos.length !== 24) { console.error(`ОШИБКА: фото ${raw.photos.length}, ожидалось 24`); process.exit(1); }
for (const [i, u] of raw.photos.entries()) {
  const f = `${OUT}/speakers/${String(i + 1).padStart(2, '0')}.png`;
  if (fs.existsSync(f) && fs.statSync(f).size > 10000) continue;
  for (let a = 0; a < 6; a++) { try { const r = await fetch(u); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); break; } catch (e) { if (a === 5) throw e; await new Promise((r) => setTimeout(r, 1500 * (a + 1))); } }
}
console.log('sessions', raw.sessions.length, 'people rows', raw.sessions.reduce((n, s) => n + s.people.length, 0), 'photos', raw.photos.length);
await b.close();
