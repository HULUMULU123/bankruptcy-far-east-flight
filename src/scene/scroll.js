// Скролл-драйв (раздел 7): высота 700vh, прогресс P сглаживается инерцией, у остановок скролл замедляется в 2.5 раза.
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function createScroll({ stops, onProgress, rate = () => 0, cap = () => 25, weights, pages = 24, nominal = 1.2, tau = 0.1, reduced = false }) {
  const spacer = document.getElementById('scroll');

  // «Стоимость» скролла на единицу P. Внутри остановок задаётся весом (читаемость), в перелётах — минимум, но не меньше,
  // чем нужно, чтобы при обычной скорости прокрутки (nominal экранов/с) взгляд поворачивался не быстрее cap °/с.
  // Так угловая скорость ограничена самой картой скролла, а камера всегда ровно там, куда указывает прокрутка: никакого «самодоводки».
  const N = 4000, S = new Float32Array(N + 1), W = weights ?? stops.map(() => 3);
  const centers = stops.map((s) => (s.pStart + s.pEnd) / 2);
  const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const base = (P) => { let w = 1.0; stops.forEach((s, i) => { const k = sm(s.pStart - 0.03, s.pStart + 0.005, P) * (1 - sm(s.pEnd - 0.005, s.pEnd + 0.03, P)); w = Math.max(w, 1 + (W[i] - 1) * k); }); return w; };
  let K = 1;
  const rho = (P) => Math.max(base(P), (rate(P) * nominal) / (K * cap(P)));
  for (let it = 0; it < 4; it++) {                     // K = экранов на единицу ρ; уточняем итерациями
    let tot = 0; for (let i = 0; i < N; i++) tot += rho((i + 0.5) / N); K = pages / tot;
  }
  for (let i = 1; i <= N; i++) S[i] = S[i - 1] + rho((i - 0.5) / N);
  spacer.style.height = `${Math.round(pages * 100)}vh`;
  const total = S[N]; for (let i = 0; i <= N; i++) S[i] /= total;
  const sOfP = (P) => { const f = Math.min(Math.max(P, 0), 1) * N, i = Math.min(Math.floor(f), N - 1); return S[i] + (S[i + 1] - S[i]) * (f - i); };
  const pOfS = (s) => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } return (lo + (s - S[lo]) / (S[hi] - S[lo] || 1)) / N; };
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  let P = 0, target = 0, flight = null, last = performance.now(), touched = false;
  const readTarget = () => pOfS(window.scrollY / Math.max(maxScroll(), 1));
  window.addEventListener('scroll', () => { if (!flight) target = readTarget(); if (window.scrollY > 4) touched = true; }, { passive: true });

  function flyToP(Pto, ms) {
    const from = window.scrollY, to = sOfP(Pto) * maxScroll();
    if (reduced) { window.scrollTo(0, to); target = Pto; P = Pto; return; }
    flight = { from, to, t0: performance.now(), ms };
  }
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (flight) {
      const u = Math.min((now - flight.t0) / flight.ms, 1);
      window.scrollTo(0, flight.from + (flight.to - flight.from) * ease(u));
      target = pOfS(window.scrollY / Math.max(maxScroll(), 1));
      if (u >= 1) flight = null;
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
    cancelFlight() { flight = null; },
  };
}
