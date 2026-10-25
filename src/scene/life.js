// «Жизнь» города: движение машин по дорогам OSM (мосты — плотнее), суда с кильватером, чайки, мерцание окон и волны — в шейдерах.
import * as THREE from 'three';
import { U } from './materials.js';
import { buildShip } from './ships.js';

const rnd = (() => { let s = 20260729; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

export async function createLife({ scene, camera, lighthouse }) {
  const traffic = await (await fetch(import.meta.env.BASE_URL + 'data/traffic.json')).json();
  // ---------- машины: две точки на машину (фара и хвост), позиции считаются на CPU по ломаным ----------
  const paths = traffic.paths.map((p) => { const a = p.p, n = a.length / 3, cum = new Float32Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(a[i * 3] - a[i * 3 - 3], a[i * 3 + 2] - a[i * 3 - 1]); return { a, n, cum, L: cum[n - 1], w: p.w }; });
  const weight = paths.map((p) => p.L * (p.w === 2 ? 4 : p.w === 1 ? 2 : 1));
  const wsum = weight.reduce((x, y) => x + y, 0);
  const pick = () => { let r = rnd() * wsum, i = 0; while (r > weight[i]) { r -= weight[i]; i++; } return i; };
  const N = 1500, cars = Array.from({ length: N }, () => { const pi = pick(), P = paths[pi]; return { pi, s: rnd() * P.L, v: (P.w === 2 ? 14 : 9) * (0.7 + rnd() * 0.6), dir: rnd() < 0.5 ? 1 : -1, seg: 0, lane: 2.2 + rnd() * 1.2 }; });
  const pos = new Float32Array(N * 2 * 3), att = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { att[i * 2] = 1; att[i * 2 + 1] = 0.35; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aA', new THREE.BufferAttribute(att, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uDpr: U.uDpr, uWarm: { value: new THREE.Color(1.0, 0.95, 0.82) } },
    vertexShader: 'attribute float aA; uniform float uDpr; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vA = aA * (1.0 - smoothstep(900.0, 2600.0, d)); gl_PointSize = mix(2.6, 1.6, smoothstep(100.0, 1200.0, d)) * uDpr; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uWarm; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(uWarm, vA * a); }',
  }));
  pts.frustumCulled = false; pts.renderOrder = 7; scene.add(pts);
  function at(P, s, out, lane) {   // позиция на ломаной + смещение вправо по ходу
    const c = P.cum; let i = Math.min(Math.max(P.seg ?? 0, 0), P.n - 2);
    while (i < P.n - 2 && c[i + 1] < s) i++; while (i > 0 && c[i] > s) i--;
    const t = (s - c[i]) / ((c[i + 1] - c[i]) || 1), a = P.a, ax = a[i * 3], ay = a[i * 3 + 1], az = a[i * 3 + 2], bx = a[i * 3 + 3], by = a[i * 3 + 4], bz = a[i * 3 + 5];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    out[0] = ax + dx * t - (dz / l) * lane; out[1] = ay + (by - ay) * t + 0.9; out[2] = az + dz * t + (dx / l) * lane; return i;
  }
  const o = [0, 0, 0], o2 = [0, 0, 0];

  // ---------- суда: настоящие корпуса (src/scene/ships.js), ходят по акватории у косы и по бухте ----------
  const ships = [];
  const V = (arr) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  // [тип, длина, скорость м/с, маршрут (две точки, туда-обратно)]
  [['cargo', 190, 6.5, [-2600, 4900, -700, 3950]], ['tanker', 230, 4.2, [-1300, 4700, -3100, 5000]], ['ferry', 78, 9, [-2800, 4550, -500, 4350]], ['tug', 30, 7, [-1900, 4150, -900, 4650]],
   ['sail', 22, 3.6, [-2900, 4000, -2200, 4700]], ['sail', 17, 3, [-2500, 3800, -1500, 4350]], ['cargo', 150, 5.5, [-2300, 3850, -300, 3700]], ['tug', 26, 6, [-3350, 4750, -2600, 5050]], ['ferry', 64, 8, [-800, 4600, 1800, 4400]]].forEach(([type, L, v, r]) => {
    const { grp, W } = buildShip(type, L);
    grp.add(new THREE.LineSegments(V([-L / 2, 0.15, 0, -L / 2 - L * 2.4, 0.15, W * 1.7, -L / 2, 0.15, 0, -L / 2 - L * 2.4, 0.15, -W * 1.7, -L / 2, 0.15, 0, -L / 2 - L * 1.6, 0.15, 0]), new THREE.LineBasicMaterial({ color: '#9aa7ad', transparent: true, opacity: 0.4 })));   // кильватер
    const bw = Math.max(L * 0.62, 20), bk = new THREE.LineSegments(V([-bw, 0, -bw * 0.6, -bw * 0.6, 0, -bw * 0.6, -bw, 0, -bw * 0.6, -bw, 0, -bw * 0.2, bw, 0, -bw * 0.6, bw * 0.6, 0, -bw * 0.6, bw, 0, -bw * 0.6, bw, 0, -bw * 0.2, -bw, 0, bw * 0.6, -bw * 0.6, 0, bw * 0.6, -bw, 0, bw * 0.6, -bw, 0, bw * 0.2, bw, 0, bw * 0.6, bw * 0.6, 0, bw * 0.6, bw, 0, bw * 0.6, bw, 0, bw * 0.2]), new THREE.LineBasicMaterial({ color: '#2fbd4c', transparent: true, opacity: 0 }));
    bk.position.y = 1.5; grp.add(bk);
    grp.position.y = 0.3; scene.add(grp);
    const len = Math.hypot(r[2] - r[0], r[3] - r[1]); ships.push({ grp, bk, ping: 0, x0: r[0], z0: r[1], x1: r[2], z1: r[3], v, len, s: rnd() * len, dir: rnd() < 0.5 ? 1 : -1 });
  });

  // ---------- чайки: махи крыльев, облёт вокруг моста, центра и отеля ----------
  const birds = Array.from({ length: 16 }, (_, i) => ({ cx: [1190, 920, 0][i % 3] + (rnd() - 0.5) * 120, cz: [260, -100, 0][i % 3] + (rnd() - 0.5) * 120, r: 140 + rnd() * 220, y: 70 + rnd() * 110, w: (0.12 + rnd() * 0.1) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.28, fl: 3 + rnd() * 2 }));
  const bpos = new Float32Array(birds.length * 24);
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3).setUsage(THREE.DynamicDrawUsage));
  const bm = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: '#e8eef0', transparent: true, opacity: 0.85 })); bm.frustumCulled = false; bm.renderOrder = 8; scene.add(bm);

  function update(t, dt, beamAng = 0) {
    U.uTime.value = t;
    for (const c of cars) { const P = paths[c.pi]; c.s += c.v * dt * c.dir; if (c.s > P.L) { c.s = P.L; c.dir = -1; } if (c.s < 0) { c.s = 0; c.dir = 1; } }
    for (let i = 0; i < N; i++) { const c = cars[i], P = paths[c.pi], lane = c.dir > 0 ? c.lane : -c.lane; c.seg = at(P, c.s, o, lane); at(P, Math.min(Math.max(c.s - 6 * c.dir, 0), P.L), o2, lane); pos.set(o, i * 6); pos.set(o2, i * 6 + 3); }
    g.attributes.position.needsUpdate = true;
    for (const s of ships) { s.s += s.v * dt * s.dir; if (s.s > s.len || s.s < 0) { s.dir *= -1; s.s = Math.min(Math.max(s.s, 0), s.len); } const u = s.s / s.len, x = s.x0 + (s.x1 - s.x0) * u, z = s.z0 + (s.z1 - s.z0) * u; s.grp.position.x = x; s.grp.position.z = z; s.grp.rotation.y = -Math.atan2(s.z1 - s.z0, s.x1 - s.x0) + (s.dir < 0 ? Math.PI : 0); { // луч маяка касается судна → метка вспыхивает и гаснет
      const dx = s.grp.position.x - lighthouse.pos.x, dz = s.grp.position.z - lighthouse.pos.z, rr = Math.hypot(dx, dz);
      if (rr < lighthouse.radius * 0.98) { let dA = ((beamAng - Math.atan2(-dz, dx)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (dA < 0.07 + 40 / rr * 0.1) s.ping = 1; }
      s.ping = Math.max(0, s.ping - dt * 0.55); s.bk.material.opacity = s.ping; s.bk.scale.setScalar(1 + (1 - s.ping) * 0.25);
    }
    s.grp.rotation.z = Math.sin(t * 0.6 + s.len) * 0.012; s.grp.position.y = 0.3 + Math.sin(t * 0.8 + s.len) * 0.18; }
    birds.forEach((b, i) => { const a = b.ph + t * b.w, x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r, y = b.y + Math.sin(t * 0.4 + i) * 6, f = Math.sin(t * b.fl + i) * 2.4, dx = -Math.sin(a) * Math.sign(b.w), dz = Math.cos(a) * Math.sign(b.w), px = -dz, pz = dx, k = i * 24;
      bpos.set([x + px * 5, y + f, z + pz * 5, x, y, z, x, y, z, x - px * 5, y + f, z - pz * 5, x - dx * 0.5, y, z - dz * 0.5, x + dx * 1.6, y, z + dz * 1.6, x + px * 2.5, y + f * 0.4, z + pz * 2.5, x - px * 2.5, y + f * 0.4, z - pz * 2.5], k); });
    bg.attributes.position.needsUpdate = true;
  }
  return { update, ships };
}
