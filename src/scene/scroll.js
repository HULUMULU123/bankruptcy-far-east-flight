// Скролл-драйв (раздел 7): высота 700vh, прогресс P сглаживается инерцией, у остановок скролл замедляется в 2.5 раза.
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function createScroll({ autoFly = true, stops, onProgress, rate = () => 0, cap = () => 25, weights, pages = 1, nominal = 1.2, tau = 0.1, reduced = false }) {
  const spacer = document.getElementById('scroll');

  // «Стоимость» скролла на единицу P. Внутри остановок задаётся весом (читаемость), в перелётах — минимум, но не меньше,
  // чем нужно, чтобы при обычной скорости прокрутки (nominal экранов/с) взгляд поворачивался не быстрее cap °/с.
  // Так угловая скорость ограничена самой картой скролла, а камера всегда ровно там, куда указывает прокрутка: никакого «самодоводки».
  const N = 4000, S = new Float32Array(N + 1);
  const centers = stops.map((s) => (s.pStart + s.pEnd) / 2);
  // Раскладка прокрутки по отрезкам: на каждую остановку и каждый перелёт выделено своё число экранов (route.json → scroll),
  // внутри отрезка экраны распределяются так, чтобы взгляд не поворачивался быстрее cap °/с. Так «Программа» не пролетает за пару щелчков.
  const alloc = weights ?? {};
  const stopScreens = alloc.stops ?? stops.map(() => 4), gapScreens = alloc.gaps ?? stops.map(() => 2);
  const bounds = [0]; const seg = [];
  stops.forEach((st, i) => { if (st.pStart > bounds.at(-1) + 1e-6) { seg.push({ a: bounds.at(-1), b: st.pStart, screens: gapScreens[i - 1] ?? 2 }); } seg.push({ a: st.pStart, b: st.pEnd, screens: stopScreens[i] }); bounds.push(st.pEnd); });
  if (bounds.at(-1) < 1) seg.push({ a: bounds.at(-1), b: 1, screens: 0.6 });
  const mult = pages; // множитель: на телефоне прокрутка длиннее
  const rho = new Float32Array(N);
  for (const g of seg) {
    const i0 = Math.round(g.a * N), i1 = Math.max(i0 + 1, Math.round(g.b * N)); let tot = 0;
    for (let i = i0; i < i1; i++) { const P = (i + 0.5) / N; rho[i] = 1 + (rate(P) * nominal) / (cap(P) * 40); tot += rho[i]; }
    for (let i = i0; i < i1; i++) rho[i] = (rho[i] / tot) * g.screens * mult;
  }
  for (let i = 1; i <= N; i++) S[i] = S[i - 1] + rho[i - 1];
  const totalScreens = S[N];
  spacer.style.height = `${Math.round(totalScreens * 100)}vh`;
  const total = S[N]; for (let i = 0; i <= N; i++) S[i] /= total;
  const sOfP = (P) => { const f = Math.min(Math.max(P, 0), 1) * N, i = Math.min(Math.floor(f), N - 1); return S[i] + (S[i + 1] - S[i]) * (f - i); };
  const pOfS = (s) => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } return (lo + (s - S[lo]) / (S[hi] - S[lo] || 1)) / N; };
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  let P = 0, target = 0, flight = null, last = performance.now(), touched = false;
  const readTarget = () => pOfS(window.scrollY / Math.max(maxScroll(), 1));
  let dir = 0;
  window.addEventListener('scroll', () => { if (!flight) { const t = readTarget(); if (Math.abs(t - target) > 1e-5) dir = Math.sign(t - target); target = t; } if (window.scrollY > 4) touched = true; }, { passive: true });

  function flyToP(Pto, ms) {
    const from = window.scrollY, to = sOfP(Pto) * maxScroll();
    if (reduced) { window.scrollTo(0, to); target = Pto; P = Pto; return; }
    flight = { from, to, t0: performance.now(), ms }; document.documentElement.style.overflow = 'hidden';   // на время автопролёта ввод заблокирован
  }
  let idleT = 0;
  // Автопролёт: вышли за границы остановки (вниз или вверх) — камера сама летит к следующей/предыдущей остановке
  function autopilot(now) {
    if (!autoFly || flight || reduced && false || dir === 0 || now - idleT < 250) return;
    const m = 0.003, inside = stops.findIndex((st) => target >= st.pStart - m && target <= st.pEnd + m);
    if (inside >= 0) return;
    let to = -1;
    if (dir > 0) { to = stops.findIndex((st) => st.pStart > target); if (to < 0) return; }
    else { for (let i = stops.length - 1; i >= 0; i--) if (stops[i].pEnd < target) { to = i; break; } if (to < 0) return; }
    const Pt = dir > 0 ? stops[to].pStart + 0.002 : stops[to].pEnd - 0.002, far = Math.min(1, Math.abs(Pt - target) / 0.3);
    flyToP(Pt, 2400 + 2600 * far); dir = 0;
  }
  function tick(now) {
    autopilot(now);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (flight) {
      const u = Math.min((now - flight.t0) / flight.ms, 1);
      window.scrollTo(0, flight.from + (flight.to - flight.from) * ease(u));
      target = pOfS(window.scrollY / Math.max(maxScroll(), 1));
      if (u >= 1) { flight = null; document.documentElement.style.overflow = ''; dir = 0; idleT = now; }
    }
    // критически демпфированная инерция: прерывание скролла продолжает плавное замедление, без прыжков
    P += (target - P) * (1 - Math.exp(-dt / (reduced ? 0.001 : tau)));   // лёгкое сглаживание колеса, без собственного движения камеры
    onProgress(P, dt, touched);
  }
  return {
    tick, flyToP,
    jump(Pto) { flight = null; window.scrollTo(0, sOfP(Pto) * maxScroll()); target = Pto; P = Pto; },
    flyToStop(i, ms) { flyToP(centers[i], ms ?? 1600); },
    get P() { return P; }, get target() { return target; }, centers,
    cancelFlight() { },
  };
}
