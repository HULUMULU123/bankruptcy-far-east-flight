// Камера по сплайну (раздел 5): ключи относительно якорей, Catmull-Rom по времени P, сетка коллизий, ограничение угловой скорости.
import * as THREE from 'three';

const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;

/** Поза из ключа остановки. Тип 'orbit' — по азимуту; 'deck' — вдоль оси моста (взгляд вперёд и вниз). */
function pose(stop, anchor, key, axes) {
  const base = { ...stop.camera, ...key };
  let pos, tgt;
  if (key.pos) return { pos: new THREE.Vector3(...key.pos), tgt: new THREE.Vector3(...key.tgt), fov: key.fov ?? stop.camera.fov };
  if (stop.kind === 'deck') {
    // вдоль оси моста: вдоль — метры от середины пролёта, высота — над настилом (рельеф настила учтён)
    const ax = axes[stop.axis], d = ax.mid + base.along, P = ax.deckAt(d), n = [-P.tz, P.tx];
    pos = [P.x + n[0] * (base.across ?? 0), P.y + base.height, P.z + n[1] * (base.across ?? 0)];
    const look = base.lookAhead ?? 200, pitch = Math.tan(rad(base.pitch ?? 25));
    tgt = [pos[0] + P.tx * look, pos[1] - look * pitch, pos[2] + P.tz * look];
  } else {
    const az = rad(base.azimuth);
    pos = [anchor.x + Math.sin(az) * base.distance, base.height, anchor.z - Math.cos(az) * base.distance];
    tgt = [anchor.x + (base.tx ?? 0), base.targetY ?? 0, anchor.z + (base.tz ?? 0)];
  }
  return { pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt), fov: base.fov };
}

/** Невзвешенный Catmull-Rom (натяжение 0.5) для Vector3 в локальном параметре t∈[0,1] между p1 и p2. */
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
    .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
    .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
    .addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
}

export function buildRig({ stops, anchors, axes, city, gapHigh = 2500, gapAlt = 650 }) {
  // 1. ключи остановок → глобальный список {P, pos, tgt, fov}
  const K = [];
  const stopRanges = [];
  stops.forEach((s, i) => {
    const a = anchors[s.anchor];
    const keys = s.keys ?? [{ t: 0 }, { t: 1 }];
    const first = K.length;
    keys.forEach((k) => K.push({ P: lerp(s.pStart, s.pEnd, k.t), stop: i, ...pose(s, a, k, axes) }));
    stopRanges.push([first, K.length - 1]);
  });
  // 2. длинные перелёты: добавляем промежуточный ключ на высоте (город «рассыпается» и собирается заново)
  const gaps = [];
  const all = [];
  K.forEach((k, i) => {
    all.push(k);
    const n = K[i + 1];
    if (n && n.stop !== k.stop) {
      const dist = Math.hypot(n.pos.x - k.pos.x, n.pos.z - k.pos.z);
      const g = { from: k.P, to: n.P, stopA: k.stop, stopB: n.stop, dist, long: dist > gapHigh };
      gaps.push(g);
      if (g.long) {
        // долгий перелёт: поднимаемся, смотрим вперёд по ходу движения, у цели снова наводимся на якорь
        const fwd = new THREE.Vector3(n.pos.x - k.pos.x, 0, n.pos.z - k.pos.z).normalize();
        [0.2, 0.5, 0.8].forEach((u) => {
          const pos = k.pos.clone().lerp(n.pos, u);
          pos.y = lerp(pos.y, gapAlt, Math.sin(Math.PI * u) ** 0.6);
          const tgt = pos.clone().addScaledVector(fwd, 500).setY(Math.max(pos.y - 280, 0));
          all.push({ P: lerp(k.P, n.P, u), stop: -1, fov: lerp(k.fov, n.fov, u), pos, tgt });
        });
      }
    }
  });

  // 3. сетка высот препятствий (макс. y вершин зданий и рельефа в ячейке 25 м)
  const CELL = 25, X0 = -9000, Z0 = -6500, NX = 600, NZ = 740;
  const H = new Float32Array(NX * NZ);
  const put = (arr) => { for (let i = 0; i < arr.length; i += 4) { const cx = ((arr[i] - X0) / CELL) | 0, cz = ((arr[i + 2] - Z0) / CELL) | 0; if (cx >= 0 && cx < NX && cz >= 0 && cz < NZ) { const j = cz * NX + cx; if (arr[i + 1] > H[j]) H[j] = arr[i + 1]; } } };
  put(city['buildings.edges']); put(city['terrain.pts']);
  const obstacle = (x, z) => { // максимум в окне 3×3 ячеек
    const cx = ((x - X0) / CELL) | 0, cz = ((z - Z0) / CELL) | 0; let m = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Z = cz + dz; if (X >= 0 && X < NX && Z >= 0 && Z < NZ) m = Math.max(m, H[Z * NX + X]); }
    return m;
  };

  // 4. оценка позы в точке P
  const out = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 45, scatter: 0, focusStop: 0, reveal: 1 };
  const tmp = new THREE.Vector3();
  function raw(P) {
    P = Math.min(Math.max(P, all[0].P), all[all.length - 1].P);
    let i = 0; while (i < all.length - 2 && all[i + 1].P < P) i++;
    const a = all[i], b = all[i + 1], p0 = all[Math.max(i - 1, 0)], p3 = all[Math.min(i + 2, all.length - 1)];
    const t = (P - a.P) / (b.P - a.P || 1);
    cr(p0.pos, a.pos, b.pos, p3.pos, t, out.pos);
    cr(p0.tgt, a.tgt, b.tgt, p3.tgt, t, out.tgt);
    out.fov = lerp(a.fov, b.fov, t);
    return out;
  }

  // 5. состояние остановок: активная остановка, коэффициент рассыпания для длинных перелётов
  function state(P) {
    let scatter = 0, focus = 0, reveal = 1;
    let active = -1;
    stops.forEach((s, i) => { if (P >= s.pStart - 0.02 && P <= s.pEnd + 0.02) active = i; });
    for (const g of gaps) {
      if (P > g.from && P < g.to) {
        const u = (P - g.from) / (g.to - g.from);
        focus = u < 0.5 ? g.stopA : g.stopB;
        if (g.long) { scatter = Math.sin(Math.PI * u) ** 1.4; reveal = 1 - scatter * 0.9; }
        else reveal = 1;
        return { scatter, focus, reveal, active };
      }
    }
    stops.forEach((s, i) => { if (P >= s.pStart) focus = i; });
    return { scatter, focus: Math.min(focus, stops.length - 1), reveal, active };
  }
  // Путь считается один раз: сырой сплайн → запас над зданиями (с опережением по пути) → гауссово сглаживание. Рывков по ходу нет.
  const TN = 4000, T = { px: new Float32Array(TN + 1), py: new Float32Array(TN + 1), pz: new Float32Array(TN + 1), tx: new Float32Array(TN + 1), ty: new Float32Array(TN + 1), tz: new Float32Array(TN + 1), fov: new Float32Array(TN + 1) };
  const P0 = all[0].P, P1 = all[all.length - 1].P;
  const need = new Float32Array(TN + 1);
  for (let i = 0; i <= TN; i++) {
    const o = raw(P0 + ((P1 - P0) * i) / TN);
    T.px[i] = o.pos.x; T.py[i] = o.pos.y; T.pz[i] = o.pos.z; T.tx[i] = o.tgt.x; T.ty[i] = o.tgt.y; T.tz[i] = o.tgt.z; T.fov[i] = o.fov;
    let m = 0; for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) m = Math.max(m, obstacle(o.pos.x + dx * 25, o.pos.z + dz * 25));
    need[i] = m + 22;
  }
  const maxFilter = (a, r) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let m = -1e9; for (let k = Math.max(0, i - r); k <= Math.min(a.length - 1, i + r); k++) m = Math.max(m, a[k]); o[i] = m; } return o; };
  const gauss = (a, sigma) => { const r = Math.ceil(sigma * 3), w = []; let sum = 0; for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); sum += v; } const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let acc = 0; for (let k = -r; k <= r; k++) acc += a[Math.min(a.length - 1, Math.max(0, i + k))] * w[k + r]; o[i] = acc / sum; } return o; };
  const lifted = maxFilter(need, 60);                         // запас заранее, до подлёта к крыше
  for (let i = 0; i <= TN; i++) T.py[i] = Math.max(T.py[i], lifted[i]);
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'fov']) T[k] = gauss(T[k], k === 'fov' ? 30 : 9);
  const res = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 45 };
  function at(P) {
    const f = Math.min(Math.max((P - P0) / (P1 - P0), 0), 1) * TN, i = Math.min(Math.floor(f), TN - 1), t = f - i;
    const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
    res.pos.set(L(T.px), L(T.py), L(T.pz)); res.tgt.set(L(T.tx), L(T.ty), L(T.tz)); res.fov = L(T.fov);
    return res;
  }

  // скорость поворота взгляда, град на единицу P: нужна, чтобы замедлять прогресс там, где камера слишком быстро поворачивается
  const RN = 1600, rate = new Float32Array(RN + 1); let pd = null;
  for (let i = 0; i <= RN; i++) {
    const o = at(i / RN), d = o.tgt.clone().sub(o.pos).normalize();
    rate[i] = pd ? (Math.acos(Math.min(1, d.dot(pd))) * 57.2958) * RN : 0;
    pd = d;
  }
  for (let k = 0; k < 6; k++) for (let i = 1; i < RN; i++) rate[i] = Math.max(rate[i], (rate[i - 1] + rate[i + 1]) / 2 * 0.98);   // сглаживание пиков
  const rateAt = (P) => rate[Math.min(RN, Math.max(0, Math.round(P * RN)))];
  return { at, state, gaps, keys: all, obstacle, rateAt };
}

/** Ограничение угловой скорости: поворачиваем текущий кватернион к целевому не быстрее maxDegPerSec. */
export function stepOrientation(q, camPos, tgt, dt, maxDeg) {
  const m = new THREE.Matrix4().lookAt(camPos, tgt, new THREE.Vector3(0, 1, 0));
  const target = new THREE.Quaternion().setFromRotationMatrix(m);
  const ang = q.angleTo(target);
  const maxStep = (maxDeg * Math.PI) / 180 * dt;
  if (ang <= maxStep) q.copy(target); else q.rotateTowards(target, maxStep);
  return ang;
}
