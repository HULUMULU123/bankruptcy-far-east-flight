// Ключевые объекты: каркас из линий + облако точек, строятся процедурно по осям из OSM (public/data/landmark_axes.json).
// Числа с пометкой «проверено» — из ТЗ; остальные — стартовые и сверяются по фото (TODO(content)).
import * as THREE from 'three';

const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

class Acc {
  constructor() { this.e = []; this.p = []; this.f = []; this.b = []; this.cables = []; this.deck = []; }
  tri(a, b, c, w = 0.37) { this.f.push(a[0], a[1], a[2], w, b[0], b[1], b[2], w, c[0], c[1], c[2], w); }
  line(a, b, w = 0) { this.e.push(a[0], a[1], a[2], w, b[0], b[1], b[2], w); }
  dots(a, b, step, w = 0) {
    const n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let i = 0; i <= n; i++) { const t = i / n; this.p.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, w); }
  }
  both(a, b, step) { this.line(a, b); this.dots(a, b, step); }
  edges() { return new Float32Array(this.e); }
  points() { return new Float32Array(this.p); }
}

function resample(pts, step) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [];
  for (let d = 0; d <= s[s.length - 1]; d += step) {
    let i = 1; while (i < s.length - 1 && s[i] < d) i++;
    const t = (d - s[i - 1]) / (s[i] - s[i - 1] || 1);
    out.push({ s: d, x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t });
  }
  return out;
}
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Вантовый мост. axis — ломаная [x,z], water — [s0,s1] метры вдоль оси над водой, pylonSpan — расстояние между пилонами,
 * deckY — высота настила над уровнем моря, pylonH — высота пилона от настила до верха (проверено для Русского: 324 м от основания).
 */
export function cableBridge({ axis, water, deckY, pylonTop, pylonSpan, halfWidth = 14, ramp = 350, nCables = 11, backSpan = 300, sampleStep = 12, ground }) {
  const A = new Acc();
  const pts = resample(axis, 4);
  const s0 = water[0], s1 = water[1], mid = (s0 + s1) / 2;
  const sP = [mid - pylonSpan / 2, mid + pylonSpan / 2];
  const at = (d) => { let i = 0; while (i < pts.length - 2 && pts[i + 1].s < d) i++; const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)]; const t = (d - a.s) / ((b.s - a.s) || 1); return { x: a.x + (b.x - a.x) * Math.min(Math.max(t, 0), 1), z: a.z + (b.z - a.z) * Math.min(Math.max(t, 0), 1) }; };
  const tan = (d) => { const a = at(d - 6), b = at(d + 6); const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / l, (b.z - a.z) / l]; };
  const yDeck = (d) => {
    const g0 = ground(pts[0].x, pts[0].z), g1 = ground(pts[pts.length - 1].x, pts[pts.length - 1].z), L = pts[pts.length - 1].s;
    const up = smooth(Math.min(Math.max((d - Math.max(s0 - ramp, 0)) / ramp, 0), 1));
    const dn = smooth(Math.min(Math.max((Math.min(s1 + ramp, L) - d) / ramp, 0), 1));
    return Math.max(deckY * Math.min(up, dn), Math.min(g0 + (g1 - g0) * (d / L) + 3, deckY));
  };
  const P = (d, off, y) => { const p = at(d), t = tan(d); return [p.x - t[1] * off, y, p.z + t[0] * off]; };

  // настил: две кромки и поперечины
  let prev = null;
  for (let d = 0; d <= pts[pts.length - 1].s; d += sampleStep) {
    const y = yDeck(d), l = P(d, -halfWidth, y), r = P(d, halfWidth, y);
    if (prev) { A.both(prev[0], l, 4); A.both(prev[1], r, 4); A.tri(prev[0], prev[1], l); A.tri(prev[1], r, l);
      if (Math.round(d / sampleStep) % 3 === 0) { A.p.push(l[0], l[1] + 5, l[2], 0, r[0], r[1] + 5, r[2], 0); A.line(l, [l[0], l[1] + 5, l[2]]); A.line(r, [r[0], r[1] + 5, r[2]]); } }
    if (Math.round(d / sampleStep) % 3 === 0) A.both(l, r, 4);
    prev = [l, r];
  }
  // пилоны: A-образные, ноги от моря (y=0) к вершине
  sP.forEach((d) => {
    const base = deckY - 0;
    const top = P(d, 0, pylonTop); A.b.push(top[0], top[1] + 3, top[2], 1);
    [-1, 1].forEach((sgn) => {
      const foot = P(d, sgn * (halfWidth + 6), 0);
      const knee = P(d, sgn * (halfWidth + 3), base);
      A.both(foot, knee, 5); A.both(knee, top, 5);
      { const t = tan(d), n = [-t[1], t[0]]; const prism = (p, q, wp, wq) => { const c = (P, w, a, b) => [P[0] + t[0] * w * a + n[0] * w * 0.35 * b, P[1], P[2] + t[1] * w * a + n[1] * w * 0.35 * b]; [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(([a, b], i, arr) => { const [a2, b2] = arr[(i + 1) % 4]; const p1 = c(p, wp, a, b), p2 = c(p, wp, a2, b2), q1 = c(q, wq, a, b), q2 = c(q, wq, a2, b2); A.tri(p1, p2, q2, 0.365); A.tri(p1, q2, q1, 0.365); }); }; prism(foot, knee, 3.4, 3.2); prism(knee, top, 3.2, 1.5); }
      [-2.2, 2.2].forEach((o) => { const t = tan(d); A.both([foot[0] + t[0] * o, foot[1], foot[2] + t[1] * o], [top[0] + t[0] * o * 0.3, top[1], top[2] + t[1] * o * 0.3], 4); });
      for (let k = 1; k < 8; k++) { // рёбра-перемычки по ноге
        const f = k / 8, a = [knee[0] + (top[0] - knee[0]) * f, knee[1] + (top[1] - knee[1]) * f, knee[2] + (top[2] - knee[2]) * f];
        const t = tan(d); A.both(a, [a[0] + t[0] * 4, a[1], a[2] + t[1] * 4], 3);
      }
    });
    // ванты: веер в две плоскости (по кромкам настила), по обе стороны от пилона
    [-1, 1].forEach((side) => {
      [-1, 1].forEach((sgn) => {
        for (let k = 0; k < nCables; k++) {
          const f = k / (nCables - 1);
          const dist = 40 + f * ((side > 0 ? (pylonSpan / 2) : backSpan) - 60);
          const dd = d + side * dist;
          if (dd < 0 || dd > pts[pts.length - 1].s) continue;
          const dk = P(dd, sgn * halfWidth, yDeck(dd));
          const apex = P(d, sgn * (halfWidth * (1 - (pylonTop - (deckY + (pylonTop - deckY) * (0.6 + 0.36 * f))) / (pylonTop - deckY) * 0.0)), deckY + (pylonTop - deckY) * (0.62 + 0.34 * f));
          A.both(apex, dk, 9);
          A.cables.push({ pylon: sP.indexOf(d), side, sgn, k, apex, dk });
        }
      });
    });
  });
  return { edges: A.edges(), points: A.points(), fill: new Float32Array(A.f), beacons: new Float32Array(A.b), pylons: sP.map((d) => at(d)), cables: A.cables, sP, mid, deckAt: (d) => { const p = at(d), t = tan(d); return { x: p.x, z: p.z, y: yDeck(d), tx: t[0], tz: t[1] }; }, length: pts[pts.length - 1].s, axisDir: (() => { const a = pts[0], b = pts[pts.length - 1], l = Math.hypot(b.x - a.x, b.z - a.z); return [(b.x - a.x) / l, (b.z - a.z) / l]; })() };
}

/** Здание отеля: этажные линии, вертикали по фасаду, плотные точки; высота — из OSM/оценка (TODO(content): сверить по фото). */
export function hotel({ ring, ground0, height, floorH = 3.4 }) {
  const A = new Acc();
  let pts = ring.slice(); if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const n = pts.length, floors = Math.max(2, Math.round(height / floorH));
  for (let f = 0; f <= floors; f++) {
    const y = ground0 + (height * f) / floors;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const a3 = [a[0], y, a[1]], b3 = [b[0], y, b[1]]; if (f === 0 || f === floors || f % 2 === 0) A.line(a3, b3, f / floors); A.dots(a3, b3, 2.2, f / floors); }
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(len / 8));
    for (let k = 0; k < m; k++) { const t = k / m, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; A.both([x, ground0, z], [x, ground0 + height, z], 2.2); }
  }
  // крыша: точки по площади
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; pts.forEach((p) => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); });
  const inside = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  for (let k = 0; k < 4000; k++) { const x = mnx + rng() * (mxx - mnx), z = mnz + rng() * (mxz - mnz); if (inside(x, z)) A.p.push(x, ground0 + height, z, 1); }
  return { edges: A.edges(), points: A.points() };
}

export function toObjects(data, { lineMat, pointMat, order = 6 }) {
  const mk = (arr, Ctor, mat) => {
    const g = new THREE.BufferGeometry(); const ib = new THREE.InterleavedBuffer(arr, 4);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('aW', new THREE.InterleavedBufferAttribute(ib, 1, 3));
    const o = new Ctor(g, mat); o.frustumCulled = false; o.renderOrder = order; return o;
  };
  return [mk(data.edges, THREE.LineSegments, lineMat), mk(data.points, THREE.Points, pointMat)];
}
