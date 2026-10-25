// Суда: корпус по шпангоутам (острый нос, подъём палубы к носу), надстройки с освещёнными окнами, трубы, краны, контейнеры, паруса.
// Рисуются тем же языком, что и город: тёмные грани с гранёным светом + светлый контур, ходовые огни.
import * as THREE from 'three';
import { fillMat, makeEdges } from './materials.js';

class B {                                   // накопитель: треугольники (x,y,z,w) и рёбра
  constructor() { this.t = []; this.e = []; }
  tri(a, b, c, w) { this.t.push(...a, w, ...b, w, ...c, w); }
  quad(a, b, c, d, w, edges = true) { this.tri(a, b, c, w); this.tri(a, c, d, w); if (edges) this.line(a, b, c, d); }
  line(...p) { for (let i = 0; i < p.length; i++) this.e.push(...p[i], 0, ...p[(i + 1) % p.length], 0); }
  seg(a, b) { this.e.push(...a, 0, ...b, 0); }
  box(x0, x1, y0, y1, z0, z1, w = 0.5, roof = true) {
    const c = (x, y, z) => [x, y, z];
    this.quad(c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0), w); this.quad(c(x1, y0, z1), c(x0, y0, z1), c(x0, y1, z1), c(x1, y1, z1), w);
    this.quad(c(x0, y0, z1), c(x0, y0, z0), c(x0, y1, z0), c(x0, y1, z1), w); this.quad(c(x1, y0, z0), c(x1, y0, z1), c(x1, y1, z1), c(x1, y1, z0), w);
    if (roof) this.quad(c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1), w);
  }
  cyl(x, z, y0, y1, r, n = 10, w = 0.5) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832, b = ((i + 1) / n) * 6.2832; this.quad([x + Math.cos(a) * r, y0, z + Math.sin(a) * r], [x + Math.cos(b) * r, y0, z + Math.sin(b) * r], [x + Math.cos(b) * r * 0.86, y1, z + Math.sin(b) * r * 0.8], [x + Math.cos(a) * r * 0.86, y1, z + Math.sin(a) * r * 0.8], w, false); } }
}

/** Корпус: ширина по длине (нос заострён), подъём палубы к носу. Возвращает функции профиля для размещения надстроек. */
function hull(b, L, W, D, bow = 0.34) {
  const N = 30, st = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = -L / 2 + u * L;
    const taper = u > 1 - bow ? Math.pow((1 - u) / bow, 0.8) : 1, stern = u < 0.05 ? 0.78 + 0.22 * (u / 0.05) : 1;
    const hw = (W / 2) * taper * stern, h = D * (1 + 0.45 * Math.pow(u, 3.2));
    st.push({ x, hw, h, wl: hw * 0.86 });
  }
  for (let i = 0; i < N; i++) {
    const a = st[i], c = st[i + 1];
    for (const s of [-1, 1]) {   // борта: от ватерлинии (чуть уже) до палубы
      b.quad([a.x, 0, s * a.wl], [c.x, 0, s * c.wl], [c.x, c.h, s * c.hw], [a.x, a.h, s * a.hw], 1.0, false);
      b.seg([a.x, a.h, s * a.hw], [c.x, c.h, s * c.hw]); b.seg([a.x, 0, s * a.wl], [c.x, 0, s * c.wl]);
    }
    b.quad([a.x, a.h, -a.hw], [c.x, c.h, -c.hw], [c.x, c.h, c.hw], [a.x, a.h, a.hw], 1.0, false);   // палуба
  }
  b.quad([st[0].x, 0, -st[0].wl], [st[0].x, st[0].h, -st[0].hw], [st[0].x, st[0].h, st[0].hw], [st[0].x, 0, st[0].wl], 1.0, false);   // транец
  for (let i = 3; i < N; i += 4) { const a = st[i]; b.seg([a.x, a.h, -a.hw], [a.x, a.h, a.hw]); }         // шпангоуты на палубе
  b.seg([st[N].x, 0, 0], [st[N].x, st[N].h, 0]);
  return { at: (u) => st[Math.min(N, Math.max(0, Math.round(u * N)))], L, W, D };
}

const BUILDERS = {
  // контейнеровоз: надстройка на корме, труба, штабеля контейнеров с «воротами» кранов
  cargo(L) {
    const b = new B(), W = L * 0.155, D = L * 0.075, H = hull(b, L, W, D, 0.3), x0 = -L / 2;
    const sx = x0 + L * 0.1; b.box(sx, sx + L * 0.075, D, D * 4.6, -W * 0.42, W * 0.42, 0.5); b.box(sx + L * 0.012, sx + L * 0.06, D * 4.6, D * 5.6, -W * 0.3, W * 0.3, 0.5);
    b.cyl(sx + L * 0.095, 0, D, D * 5.2, W * 0.1); b.seg([sx + L * 0.03, D * 5.6, 0], [sx + L * 0.03, D * 8.6, 0]);
    let k = 0; for (let x = x0 + L * 0.24; x < x0 + L * 0.8; x += L * 0.052, k++) for (let z = -W * 0.4; z < W * 0.4; z += W * 0.2) { const lv = 2 + ((k * 3 + Math.round(z * 7)) % 3 + 3) % 3; b.box(x, x + L * 0.046, D * H.at(0.5).h / D, D + lv * 2.45, z, z + W * 0.185, 1.0); }
    for (const gx of [0.34, 0.58]) { const x = x0 + L * gx; for (const s of [-1, 1]) { b.seg([x, D, s * W * 0.46], [x, D * 5.2, s * W * 0.46]); } b.seg([x, D * 5.2, -W * 0.46], [x, D * 5.2, W * 0.46]); b.seg([x, D * 5.2, 0], [x + L * 0.08, D * 6.4, 0]); }
    return { b, mast: [sx + L * 0.03, D * 8.7, 0], bow: [L / 2 - L * 0.06, H.at(0.97).h, 0], W, L };
  },
  // танкер: низкий длинный корпус, трубопроводы на палубе, надстройка и труба на корме
  tanker(L) {
    const b = new B(), W = L * 0.17, D = L * 0.055, H = hull(b, L, W, D, 0.22), x0 = -L / 2;
    const sx = x0 + L * 0.06; b.box(sx, sx + L * 0.07, D, D * 5.2, -W * 0.44, W * 0.44, 0.5); b.box(sx + L * 0.01, sx + L * 0.05, D * 5.2, D * 6.2, -W * 0.32, W * 0.32, 0.5); b.cyl(sx + L * 0.09, 0, D, D * 6, W * 0.07);
    b.seg([x0 + L * 0.2, D + 1.4, 0], [x0 + L * 0.88, D + 1.4, 0]); b.seg([x0 + L * 0.2, D + 1.4, -W * 0.12], [x0 + L * 0.88, D + 1.4, -W * 0.12]); b.seg([x0 + L * 0.2, D + 1.4, W * 0.12], [x0 + L * 0.88, D + 1.4, W * 0.12]);
    for (let x = 0.28; x < 0.85; x += 0.14) { b.box(x0 + L * x, x0 + L * x + L * 0.018, D, D + 3, -W * 0.3, W * 0.3, 1.0); b.seg([x0 + L * x, D + 3.2, -W * 0.3], [x0 + L * x, D + 3.2, W * 0.3]); }
    b.seg([x0 + L * 0.5, D + 1.4, 0], [x0 + L * 0.5, D + 12, 0]); b.seg([x0 + L * 0.5, D + 12, 0], [x0 + L * 0.5 + 18, D + 1.4, 0]);
    return { b, mast: [sx + L * 0.035, D * 6.6, 0], bow: [L / 2 - L * 0.05, H.at(0.97).h, 0], W, L };
  },
  // паром: широкий корпус, три яруса с лентой окон, две трубы
  ferry(L) {
    const b = new B(), W = L * 0.24, D = L * 0.085, H = hull(b, L, W, D, 0.26), x0 = -L / 2;
    b.box(x0 + L * 0.1, x0 + L * 0.8, D, D * 2.5, -W * 0.44, W * 0.44, 0.5); b.box(x0 + L * 0.14, x0 + L * 0.72, D * 2.5, D * 3.9, -W * 0.38, W * 0.38, 0.5); b.box(x0 + L * 0.3, x0 + L * 0.58, D * 3.9, D * 5, -W * 0.3, W * 0.3, 0.5);
    b.cyl(x0 + L * 0.3, -W * 0.14, D * 5, D * 6.6, W * 0.07); b.cyl(x0 + L * 0.3, W * 0.14, D * 5, D * 6.6, W * 0.07); b.seg([x0 + L * 0.5, D * 5, 0], [x0 + L * 0.5, D * 7.2, 0]);
    return { b, mast: [x0 + L * 0.5, D * 7.3, 0], bow: [L / 2 - L * 0.05, H.at(0.97).h, 0], W, L };
  },
  // буксир: короткий корпус, высокая рубка, толстая труба, кранец по борту
  tug(L) {
    const b = new B(), W = L * 0.36, D = L * 0.12, H = hull(b, L, W, D, 0.3), x0 = -L / 2;
    b.box(x0 + L * 0.2, x0 + L * 0.58, D, D * 2.6, -W * 0.34, W * 0.34, 0.5); b.box(x0 + L * 0.3, x0 + L * 0.54, D * 2.6, D * 3.7, -W * 0.28, W * 0.28, 0.5); b.cyl(x0 + L * 0.28, 0, D * 2.6, D * 4.2, W * 0.1);
    b.seg([x0 + L * 0.42, D * 3.7, 0], [x0 + L * 0.42, D * 5.2, 0]); return { b, mast: [x0 + L * 0.42, D * 5.3, 0], bow: [L / 2 - L * 0.06, H.at(0.97).h, 0], W, L };
  },
  // парусная яхта: стройный корпус, мачта, грот и стаксель полупрозрачными треугольниками
  sail(L) {
    const b = new B(), W = L * 0.26, D = L * 0.05, H = hull(b, L, W, D, 0.4), x0 = -L / 2;
    b.box(x0 + L * 0.35, x0 + L * 0.58, D, D * 2.1, -W * 0.28, W * 0.28, 0.5);
    const mx = x0 + L * 0.46, top = L * 1.15; b.seg([mx, D, 0], [mx, top, 0]);
    const sails = [[mx - L * 0.02, D * 2.4, 0, mx - L * 0.02, top * 0.96, 0, mx - L * 0.42, D * 2.6, 0], [mx + L * 0.03, D * 1.4, 0, mx + L * 0.03, top * 0.9, 0, mx + L * 0.5, D * 1.4, 0]];
    sails.forEach((s) => { b.seg(s.slice(0, 3), s.slice(3, 6)); b.seg(s.slice(3, 6), s.slice(6, 9)); b.seg(s.slice(6, 9), s.slice(0, 3)); });
    return { b, mast: [mx, top, 0], bow: [L / 2 - L * 0.04, H.at(0.97).h, 0], W, L, sails };
  },
};

export function buildShip(type, L) {
  const m = BUILDERS[type](L), grp = new THREE.Group();
  // заливка (тот же материал, что у зданий: гранёный свет + окна надстройки)
  const t = new Float32Array(m.b.t), g = new THREE.BufferGeometry(), ib = new THREE.InterleavedBuffer(t, 4);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aW', new THREE.InterleavedBufferAttribute(ib, 1, 3));
  const fill = new THREE.Mesh(g, fillMat); fill.frustumCulled = false; fill.renderOrder = 3; grp.add(fill);
  const e = new Float32Array(m.b.e), eg = new THREE.BufferGeometry(), eb = new THREE.InterleavedBuffer(e, 4);
  eg.setAttribute('position', new THREE.InterleavedBufferAttribute(eb, 3, 0)); eg.setAttribute('aW', new THREE.InterleavedBufferAttribute(eb, 1, 3));
  const edges = new THREE.LineSegments(eg, makeEdges({ always: 0.9, nearFade: false })); edges.frustumCulled = false; edges.renderOrder = 4; grp.add(edges);
  if (m.sails) m.sails.forEach((s) => { const sg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(s, 3)); grp.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#dfe9ec', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }))); });
  // огни: белый на мачте, красный/зелёный по бортам на носу
  const P = (pts, color, size) => grp.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color, size, sizeAttenuation: false })));
  P([...m.mast], '#fff4d0', 5); P([m.bow[0] - m.L * 0.05, m.bow[1] + 1.2, -m.W * 0.38], '#ff6a5a', 5); P([m.bow[0] - m.L * 0.05, m.bow[1] + 1.2, m.W * 0.38], '#4fe08a', 5);
  return { grp, W: m.W, L: m.L };
}
