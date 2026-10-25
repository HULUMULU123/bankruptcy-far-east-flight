import * as THREE from 'three';
import './styles/base.css';
import route from './scene/route.json';
import { loadCity } from './scene/loader.js';
import { U, ACCENT, makePoints, makeEdges, makeLines, contourMat, fillMat } from './scene/materials.js';
import { cableBridge, hotel, toObjects } from './scene/landmarks.js';
import { waterTitle, facadePanel } from './scene/carriers.js';
import { makePost } from './scene/post.js';
import { buildRig } from './scene/rig.js';
import { buildTerrain } from './scene/terrain.js';
import { makeLighthouse } from './scene/lighthouse.js';
import { makeSky } from './scene/sky.js';
import { createScroll } from './scene/scroll.js';
import { mountUI } from './ui/hud.js';
import { createCallouts } from './scene/callouts.js';
import { createStops } from './scene/stops.js';
import { createForm3D } from './scene/form3d.js';
import { createLife } from './scene/life.js';
import program from './content/program.json';

const q = new URLSearchParams(location.search);
const DEBUG = q.has('debug') || q.has('test');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('rm');
const canvas = document.getElementById('world');
const hud = document.getElementById('hud');
if (!DEBUG) hud.remove();

// ---- экран загрузки: точки собираются в силуэт города, проценты (раздел 7)
const ld = document.getElementById('loaderDots').getContext('2d'), pctEl = document.getElementById('loaderPct');
const sky = Array.from({ length: 900 }, (_, i) => { const x = (i % 90) / 90, h = 0.2 + 0.5 * Math.abs(Math.sin(x * 9) * Math.cos(x * 3.7)) + 0.12 * ((i * 7919) % 13) / 13; return { x: x * 480, y: 150 - Math.random() * h * 140, r: Math.random() }; });
function drawLoader(p) { ld.clearRect(0, 0, 480, 160); ld.fillStyle = '#e8eef0'; for (const d of sky) if (d.r < p) ld.fillRect(d.x, d.y, 1.6, 1.6); pctEl.textContent = `${Math.round(p * 100)}%`; }
drawLoader(0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const dpr = Math.min(window.devicePixelRatio, route.shader.dprMax);
renderer.setPixelRatio(dpr); renderer.setClearColor('#07090b');
U.uDpr.value = dpr; U.uSizeFar.value = route.shader.sizeFar; U.uSizeNear.value = route.shader.sizeNear;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 2, 40000);
const post = makePost(renderer, scene, camera);
let form3dRef; function resize() { const w = innerWidth, h = innerHeight; form3dRef?.resize(w, h); renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function layer(Ctor, mat, data, order) {
  const g = new THREE.BufferGeometry(); const ib = new THREE.InterleavedBuffer(data, 4);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aW', new THREE.InterleavedBufferAttribute(ib, 1, 3));
  const o = new Ctor(g, mat); o.frustumCulled = false; o.renderOrder = order; scene.add(o); return o;
}

const [city, anchorsFile, axes, meta] = await Promise.all([
  loadCity((p) => drawLoader(p)),
  fetch(import.meta.env.BASE_URL + 'data/anchors.json').then((r) => r.json()), fetch(import.meta.env.BASE_URL + 'data/landmark_axes.json').then((r) => r.json()), fetch(import.meta.env.BASE_URL + 'data/buildings_meta.json').then((r) => r.json()),
]);
drawLoader(1);
const A = { ...anchorsFile.anchors };

scene.add(makeSky());
const routePts = ['russky_bridge', 'golden_bridge', 'station', 'tokarevsky_lighthouse', 'hotel'].map((k) => [A[k].x, A[k].z]);
scene.add(await buildTerrain(routePts));
const pointsMat = makePoints(), linesMat = makeLines(), edgesMat = makeEdges();
layer(THREE.Mesh, fillMat, city['buildings.fill'], 1);
layer(THREE.LineSegments, linesMat, city['lines.ln'], 3);
layer(THREE.LineSegments, edgesMat, city['buildings.edges'], 4);

// ---- ключевые объекты (процедурно по осям OSM; числа с пометкой в docs/milestones/M3-notes.md)
const arc = (pts) => pts.reduce((s, p, i) => (i ? [...s, s[i - 1] + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])] : [0]), []);
const sAt = (pts, pt) => { const s = arc(pts); let b = 0, bd = 1e12; pts.forEach((p, i) => { const d = Math.hypot(p[0] - pt[0], p[1] - pt[1]); if (d < bd) { bd = d; b = i; } }); return s[b]; };
const bridge = (ax, opt) => {
  const w = [sAt(ax.pts, ax.water_from), sAt(ax.pts, ax.water_to)], L = arc(ax.pts).at(-1);
  const ground = (x, z) => (Math.hypot(x - ax.pts[0][0], z - ax.pts[0][1]) < L / 2 ? ax.ground_start : ax.ground_end);
  return cableBridge({ axis: ax.pts, water: w, ground, ...opt });
};
const landmarks = {
  russky: bridge(axes.russky, { deckY: 70, pylonTop: 324, pylonSpan: 1104, halfWidth: 15, nCables: 12, backSpan: 320 }),
  golden: bridge(axes.golden_main, { deckY: 64, pylonTop: 226, pylonSpan: 737, halfWidth: 14, nCables: 10, backSpan: 200 }),
};
Object.values(landmarks).forEach((d) => {
  scene.add(...toObjects(d, { lineMat: makeEdges({ always: 0.85, nearFade: false }), pointMat: makePoints({ bright: 1 }), order: 6 }));
  scene.add(...toObjects({ edges: new Float32Array(0), points: d.beacons }, { lineMat: makeEdges({ always: 1 }), pointMat: makePoints({ color: ACCENT, bright: 1.4 }), order: 8 }));
  const g = new THREE.BufferGeometry(); const ib = new THREE.InterleavedBuffer(d.fill, 4);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aW', new THREE.InterleavedBufferAttribute(ib, 1, 3));
  const m = new THREE.Mesh(g, fillMat); m.frustumCulled = false; m.renderOrder = 5; scene.add(m);
});
const hm = meta.landmarks.hotel;
scene.add(...toObjects(hotel({ ring: axes.hotel_ring, ground0: hm.ground, height: hm.height }), { lineMat: makeEdges({ color: ACCENT, always: 0.9, floor: 0.07 }), pointMat: makePoints({ color: ACCENT, bright: 1.1 }), order: 7 }));
const LH = A.tokarevsky_lighthouse, lighthouse = makeLighthouse({ x: LH.x, z: LH.z, ground: 2 });
scene.add(lighthouse.group);
A.russky_pylon = { x: landmarks.russky.pylons[0].x, z: landmarks.russky.pylons[0].z };

// ---- носители A/C: пересобираются при смене языка
let carriers = [];
function buildCarriers(content) {
  carriers.forEach((g) => { scene.remove(g); g.traverse((o) => o.dispose?.()); });
  const h = content.hero, f = content.finale;
  const title = h.title.toUpperCase().split(' ');
  const lines = title.length > 2 ? [title.slice(0, 1).join(' '), title.slice(1).join(' ')] : title;
  const f5 = route.stops.at(-1), az = (f5.keys.at(0).azimuth * Math.PI) / 180, d = [Math.sin(az), -Math.cos(az)];
  const c = hm.center, ext = Math.max(...axes.hotel_ring.map((p) => (p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1]));
  const pos = new THREE.Vector3(c[0] + d[0] * ext * 0.4, hm.ground + hm.height + 24, c[1] + d[1] * ext * 0.4);
  carriers = [
    waterTitle({ x: -300, z: 3150, lines, size: 150, sub: `${h.subtitle} · ${h.dates}`, subSize: 58 }),
    facadePanel({ position: pos, yaw: Math.atan2(d[0], d[1]), width: 112, height: 36, size: 6.0, rows: [{ text: f.addressPanel[0], size: 6.3 }, { text: f.addressPanel[1] }, { text: f.addressPanel[2], color: '#9aa7ad' }] }),
  ];
  scene.add(...carriers);
}

// ---- камера, скролл, навигация
const stops = route.stops;
{ // Hero: низко над водой у косы, маяк справа, на горизонте город и мост; камера медленно идёт к городу
  const LHp = A.tokarevsky_lighthouse, f = new THREE.Vector2(0.596, -0.803), r = new THREE.Vector2(0.803, 0.596);
  const at = (back, side, y, ahead, ty) => ({ pos: [LHp.x - f.x * back - r.x * side, y, LHp.z - f.y * back - r.y * side], tgt: [LHp.x - f.x * back - r.x * side + f.x * ahead, ty, LHp.z - f.y * back - r.y * side + f.y * ahead], fov: 44 });
  stops[0].kind = 'tour'; stops[0].anchor = 'tokarevsky_lighthouse';
  stops[0].keys = [{ t: 0, ...at(300, 90, 120, 1800, 10) }, { t: 1, ...at(-380, 50, 170, 1800, 20) }];
}
{ // Золотой мост пролетаем целиком: от въезда до съезда, через проём между пилонами (камера между плоскостями вант)
  const g = landmarks.golden, a0 = -g.mid + 40, a1 = g.length - g.mid - 40, k = { height: 38, lookAhead: 220, pitch: 13, fov: 58 };
  stops[2].keys = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, along: a0 + (a1 - a0) * t, ...k }));
}
// 24 маячка по кругу (по углу вокруг центра) ↔ 24 спикера в порядке программы; камера тура обходит их по очереди
const beacons = (() => {
  const cx = meta.beacons.reduce((a, b) => a + b.x, 0) / meta.beacons.length, cz = meta.beacons.reduce((a, b) => a + b.z, 0) / meta.beacons.length;
  const ring = meta.beacons.map((b) => ({ ...b, ang: Math.atan2(b.z - cz, b.x - cx) })).sort((a, b) => a.ang - b.ang);
  const order = []; program.sessions.forEach((ss) => [...ss.moderators, ...ss.speakers].forEach((q) => { if (!order.includes(q.name)) order.push(q.name); }));
  const byName = Object.fromEntries(program.speakers.map((sp) => [sp.name, sp]));
  const out = ring.map((b, i) => ({ ...b, sp: byName[order[i]] }));
  out.center = [cx, cz]; return out;
})();
{
  const S3 = stops[3], n = beacons.length, keys = [], [cx, cz] = beacons.center;
  const R = Math.max(...beacons.map((b) => Math.hypot(b.x - cx, b.z - cz))) + 170;     // камера идёт по гладкому кругу снаружи кольца маячков
  beacons.forEach((b, i) => {
    const ang = Math.atan2(b.z - cz, b.x - cx), t = i / (n - 1), h = 0.007;
    const key = { pos: [cx + Math.cos(ang) * R, 150, cz + Math.sin(ang) * R], tgt: [b.x, b.top + 56, b.z], fov: 45 };
    keys.push({ t: Math.max(t - h, 0), ...key }, { t: Math.min(t + h, 1), ...key });   // небольшая выдержка на каждом спикере
  });
  S3.kind = 'tour'; S3.keys = keys.filter((k, i) => !(i > 0 && k.t === keys[i - 1].t));
}
const rig = buildRig({ stops, anchors: A, axes: { golden: { deckAt: landmarks.golden.deckAt, mid: landmarks.golden.mid } }, city });
const nearest = (P) => stops.reduce((b, s, i) => (Math.abs(P - (s.pStart + s.pEnd) / 2) < Math.abs(P - (stops[b].pStart + stops[b].pEnd) / 2) ? i : b), 0);
const prevQuat = new THREE.Quaternion();
let ui, stopsInfo, prevActive = -2, pulseT0 = -1, lastP = 0;
const bootT0 = performance.now();
const sm01 = (t) => { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) ** 3;

const scroll = createScroll({ stops, reduced, rate: (P) => rig.rateAt(P), cap: (P) => (rig.state(P).scatter > 0.05 ? route.maxAngularDegPerSecScatter : route.maxAngularDegPerSec), weights: route.scrollWeights, pages: route.pages * (innerWidth < 700 ? 2.4 : 1), nominal: innerWidth < 700 ? 0.8 : 1.2, tau: innerWidth < 700 ? 0.16 : 0.1, onProgress(P, dt, touched) {
  const pose = rig.at(P), st = rig.state(P);
  // камера — чистая функция от P: остановился скролл, остановилась и камера (никаких догоняющих поворотов)
  camera.position.copy(pose.pos);
  { const k = Math.max(0, 1 - P / 0.05) * (reduced ? 0 : 1), tt = performance.now() / 1000; camera.position.x += Math.sin(tt * 0.17) * 5 * k; camera.position.y += Math.sin(tt * 0.23) * 1.6 * k; camera.position.z += Math.cos(tt * 0.13) * 5 * k; }   // дыхание кадра в первом экране
  camera.lookAt(pose.tgt);
  if (DEBUG && window.__camOverride) window.__camOverride(camera);
  { // портретный экран: сохраняем горизонтальный охват как на десктопе (иначе маяк, форма и панели вылетают за кадр)
    let fv = pose.fov; const asp = innerWidth / innerHeight;
    if (asp < 1.4) { const h = 2 * Math.atan(Math.tan((pose.fov * Math.PI) / 360) * 1.45); fv = Math.min(((2 * Math.atan(Math.tan(h / 2) / asp)) * 180) / Math.PI, 102); }
    if (Math.abs(camera.fov - fv) > 0.01) { camera.fov = fv; camera.updateProjectionMatrix(); } }
  const s = stops[st.focus], a = A[s.anchor];
  U.uFocus.value.set(a.x, 0, a.z);
  // экспозиция при загрузке: город проявляется от берега за 4 с, независимо от скролла
  const boot = reduced || q.has('still') ? 1 : easeOut(Math.min((performance.now() - bootT0) / 4200, 1));
  const bootGate = st.focus === 0 && P < 0.02 ? boot : 1;
  U.uRadius.value = s.reveal.radius * (st.focus === 0 ? 0.25 + 0.75 * bootGate : 1);
  U.uScatter.value = reduced ? 0 : st.scatter; U.uProgressReveal.value = reduced ? 1 : st.reveal;
  carriers[1] && (carriers[1].visible = P > 0.9);
  if (stopsInfo) stopsInfo.state.aboutPanel.visible = innerWidth >= 700 && P > stops[1].pStart - 0.02 && P < stops[1].pEnd + 0.02;
  lighthouse.__ang = reduced ? 0.93 : (performance.now() / 1000) * 0.55; lighthouse.setAngle(lighthouse.__ang);   // огонь на маяке вращается постоянно
  const active = st.active;
  if (active !== prevActive) { if (active >= 0 && !reduced && !q.has('still')) pulseT0 = performance.now(); prevActive = active; }
  const pt = pulseT0 < 0 ? 2 : (performance.now() - pulseT0) / 1400;
  U.uPulseR.value = Math.min(pt, 1) * U.uRadius.value * 1.25; U.uPulseA.value = pt > 0 && pt < 1 ? 0.9 * (1 - pt) : 0;
  ui.update(active >= 0 ? active : nearest(P), P, touched, bootGate);
  { const s4 = stops[4], span = s4.pEnd - s4.pStart, face = Math.max(0, form3d.facing());
    form3d.setOpacity(sm01((P - (s4.pStart + span * 0.72)) / (span * 0.1)) * (1 - sm01((P - s4.pEnd) / 0.012)) * sm01((face - 0.55) / 0.3)); }
  if (stopsInfo) { stopsInfo.update(P, performance.now(), dt); callouts.update(P, innerWidth, innerHeight); }
  if (DEBUG && dt > 0) { const ang = prevQuat.angleTo(camera.quaternion); prevQuat.copy(camera.quaternion); if (dt > 0.008 && dt < 0.05 && !window.__skipTrace) (window.__trace ||= []).push([P, (ang / dt) * 57.2958, st.scatter, pose.pos.y - rig.obstacle(pose.pos.x, pose.pos.z), pose.pos.x, pose.pos.y, pose.pos.z]); }
  lastP = P;
} });

ui = mountUI({ stopsCount: stops.length, lang: (new URLSearchParams(location.search).get('lang') || 'ru'),
  onAction: (act) => { if (act === 'restart') scroll.flyToP(0, 3000); if (act === 'join') scroll.flyToStop(4); if (act === 'skip') scroll.flyToStop(5, 3400); },
  onNav: (i) => scroll.flyToStop(i, 2000 + 1300 * Math.min(1, Math.abs(scroll.centers[i] - scroll.P) / 0.5)),
  onLang: () => buildCarriers(ui.content), onDay: (d) => stopsInfo.setDay(d) });
const callouts = createCallouts(document.getElementById('ui'), camera);
stopsInfo = createStops({ scene, camera, A, landmarks, meta, program, rig, route, callouts, ui, canvas, beacons });
buildCarriers(ui.content);
const life = await createLife({ scene, camera, lighthouse });
const form3d = createForm3D({ camera, program }); form3dRef = form3d; form3d.resize(innerWidth, innerHeight);
{ // форма стоит у косы лицом к камере конца остановки 4, справа от маяка
  const S4 = stops[4], end = rig.at(S4.pEnd).pos.clone(), to = new THREE.Vector3(LH.x - end.x, 0, LH.z - end.z).normalize(), right = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(-1);
  const pos = new THREE.Vector3(LH.x, 0, LH.z).addScaledVector(right, 80).addScaledVector(to, -40); pos.y = 38;
  form3d.place(pos, new THREE.Vector3(end.x, pos.y, end.z));
}

// клавиатура: стрелки/PageUp/PageDown — по остановкам; Home/End — начало и финал
addEventListener('keydown', (e) => {
  if (e.target.closest?.('button, a, input, textarea, [role="dialog"]') && !['Home', 'End', 'PageDown', 'PageUp'].includes(e.key)) return;
  const cur = nearest(scroll.target); let to = null;
  if (['ArrowDown', 'PageDown'].includes(e.key)) to = Math.min(cur + 1, stops.length - 1);
  if (['ArrowUp', 'PageUp'].includes(e.key)) to = Math.max(cur - 1, 0);
  if (e.key === 'Home') to = 0; if (e.key === 'End') to = stops.length - 1;
  if (to !== null) { e.preventDefault(); scroll.flyToStop(to, 1200 + 800 * Math.min(1, Math.abs(scroll.centers[to] - scroll.P) / 0.5)); }
});
['wheel', 'touchstart'].forEach((t) => addEventListener(t, () => scroll.cancelFlight(), { passive: true }));

document.getElementById('loader').classList.add('done'); setTimeout(() => document.getElementById('loader')?.remove(), 400);
let fps = 0, frames = 0, tf = performance.now();
renderer.setAnimationLoop((now) => {
  const lt = now / 1000; life.update(lt, Math.min(lt - (window.__lt ?? lt), 0.05), lighthouse.__ang ?? 0); window.__lt = lt;
  scroll.tick(now); post.render(now); form3d.render();
  if (DEBUG) { frames++; if (now - tf > 500) { fps = Math.round((frames * 1000) / (now - tf)); frames = 0; tf = now; const r = renderer.info.render;
    hud.textContent = `P ${lastP.toFixed(3)}  fps ${fps}  calls ${r.calls}  pts ${r.points}`; } }
});
if (DEBUG) Object.assign(window, { __life: life, __camera: () => camera, __stops: () => stopsInfo, __beacons: beacons, __lh: lighthouse, __scene: scene, THREE, __rig: rig, __scroll: scroll, __post: post, __U: U, __setP: (P) => scroll.jump(P), __go: (i) => scroll.jump(scroll.centers[i]) });
