// Информация внутри города (раздел 2): остановки 1–3. Носители: A — SDF-панель, B — выноски, C — надписи на настиле, D — живые объекты.
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { ACCENT } from './materials.js';

const FONT = import.meta.env.BASE_URL + 'fonts/onest-500.ttf', MONO = import.meta.env.BASE_URL + 'fonts/onest-500.ttf';
const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const accent = new THREE.Color('#2fbd4c');

function sdf(text, o) {
  const t = new Text(); Object.assign(t, { text, font: FONT, fontSize: o.size, color: o.color ?? '#e8eef0', anchorX: o.anchorX ?? 'left', anchorY: o.anchorY ?? 'top', maxWidth: o.maxWidth, lineHeight: o.lineHeight ?? 1.25, letterSpacing: o.ls ?? 0 });
  t.sync(); return t;
}
const lines = (arr) => { const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };

export function createStops({ scene, camera, A, landmarks, meta, program, rig, route, callouts, ui, canvas, beacons }) {
  const state = { day: 1 };
  const open = (p, world) => callouts.openCard({ ...p, getWorld: world });

  // ================= Остановка 1: «О форуме» — пилон Русского моста =================
  const S1 = route.stops[1], r = landmarks.russky;
  const pyl = r.pylons[0];
  const camMid = rig.at((S1.pStart + S1.pEnd) / 2).pos.clone();
  {
    // панель A на уровне верха пилона, лицом к камере, левее пилона
    const toCam = new THREE.Vector3(camMid.x - pyl.x, 0, camMid.z - pyl.z).normalize();
    const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
    const pos = new THREE.Vector3(pyl.x, 0, pyl.z).addScaledVector(side, -210).addScaledVector(toCam, 40); pos.y = 300;
    const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = Math.atan2(toCam.x, toCam.z);
    const W = 300, Hh = 150;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ color: '#0e1215' })); bg.renderOrder = 20; g.add(bg);
    const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * W / 2, b * Hh / 2, 0.1))), new THREE.LineBasicMaterial({ color: accent })); frame.renderOrder = 21; g.add(frame);
    const h = sdf('О форуме', { size: 20 }); h.position.set(-W / 2 + 16, Hh / 2 - 14, 0.2); h.renderOrder = 22; h.material.depthTest = false; g.add(h);
    const p = sdf(program.about.short, { size: 9.5, maxWidth: W - 32, color: '#c9d3d8' }); p.position.set(-W / 2 + 16, Hh / 2 - 50, 0.2); p.renderOrder = 22; p.material.depthTest = false; g.add(p);
    g.userData.win = [S1.pStart - 0.01, S1.pEnd]; scene.add(g); state.aboutPanel = g;
  }
  // пять вант ↔ пять тем форума
  const wantK = [1, 3, 5, 7, 10];
  const plane = r.cables.filter((c) => c.pylon === 0 && c.side === 1);
  const sgnNear = (() => { const d = (c) => Math.hypot(c.apex[0] - camMid.x, c.apex[2] - camMid.z); const a = plane.filter((c) => c.sgn === 1)[0], b = plane.filter((c) => c.sgn === -1)[0]; return d(a) < d(b) ? 1 : -1; })();
  const chosen = wantK.map((k) => plane.find((c) => c.sgn === sgnNear && c.k === k));
  const cableMats = chosen.map((c) => { const m = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false }); const l = new THREE.LineSegments(lines([...c.apex, ...c.dk]), m); l.renderOrder = 9; scene.add(l); return m; });
  const offs = [[-230, -40], [-210, -120], [-60, -180], [170, -130], [230, -50]];
  const topicEls = [];
  program.about.topics.forEach((t, i) => {
    const c = chosen[i], f = 0.45 + i * 0.07, p0 = S1.pStart + 0.012 + i * 0.022;
    topicEls[i] = callouts.add({ id: `topic${i}`, world: new THREE.Vector3(c.dk[0] + (c.apex[0] - c.dk[0]) * f, c.dk[1] + (c.apex[1] - c.dk[1]) * f, c.dk[2] + (c.apex[2] - c.dk[2]) * f),
      title: t, dx: 1, dy: 0, place: (W, H) => { if (W < 700) { let y = H * 0.5; for (let k = 0; k < i; k++) y += (topicEls[k]?.el.offsetHeight || 52) + 8; return [16, y + (topicEls[i]?.el.offsetHeight || 52) / 2]; } let y = Math.max(96, H * 0.24); for (let k = 0; k < i; k++) y += (topicEls[k]?.el.offsetHeight || 64) + 14; return [Math.max(24, W * 0.03), y + (topicEls[i]?.el.offsetHeight || 64) / 2]; }, win: [p0, S1.pEnd + 0.005], fade: 0.01, onClick: () => open({ title: t, sub: 'О форуме', body: program.about.full }, () => new THREE.Vector3(c.dk[0] + (c.apex[0] - c.dk[0]) * f, c.dk[1] + (c.apex[1] - c.dk[1]) * f, c.dk[2] + (c.apex[2] - c.dk[2]) * f)) });
  });

  // ================= Остановка 2: «Программа» — настил Золотого моста =================
  const S2 = route.stops[2], g = landmarks.golden;
  const blocks = [];
  const hourOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const M_PER = 2;                                              // 2 м на минуту: 90 мин = 180 м, 80 мин = 160 м (9:8)
  program.sessions.forEach((s) => {
    const t0 = hourOf(s.start) - 14 * 60, len = s.minutes * M_PER, d = g.mid + t0 * M_PER + len / 2, P = g.deckAt(d);
    const grp = new THREE.Group(); grp.position.set(P.x, P.y, P.z); grp.rotation.y = Math.atan2(-P.tz, P.tx);
    // плита-полоса длиной ∝ длительности, поверх настила; торцы — «ворота времени»
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.2, depthWrite: false })); slab.scale.set(len, 0.8, 25); slab.position.y = 0.6; slab.renderOrder = 10; grp.add(slab);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(len, 3.2, 25)), new THREE.LineBasicMaterial({ color: '#8cf0a0' })); rim.position.y = 1.6; rim.renderOrder = 11; grp.add(rim);
    const gate = [-1, 1].map((e) => { const l = new THREE.LineSegments(lines([e * len / 2, 0, -12.5, e * len / 2, 20, -12.5, e * len / 2, 0, 12.5, e * len / 2, 20, 12.5, e * len / 2, 20, -12.5, e * len / 2, 20, 12.5]), new THREE.LineBasicMaterial({ color: '#8cf0a0', transparent: true, opacity: 0.8 })); l.renderOrder = 11; grp.add(l); return l; });
    // текст на поверхности (носитель C): читается с камеры, летящей вдоль настила; строки идут поперёк полотна
    const lbl = new THREE.Group(); lbl.position.y = 2.5; lbl.rotation.x = -Math.PI / 2; lbl.rotation.z = -Math.PI / 2;   // верх строки — вперёд по ходу
    const mk = (txt, size, y, color, extra = {}) => { const t = sdf(txt, { size, anchorX: 'center', anchorY: 'middle', maxWidth: 22, color, ...extra }); t.position.set(0, y, 0); t.renderOrder = 12; t.depthOffset = -2; lbl.add(t); return t; };
    mk(`${s.start}–${s.end}`, 4.6, 20, '#7fe39a');
    grp.add(lbl);
    grp.scale.y = 0.01; grp.visible = false; scene.add(grp);
    grp.userData = { s, len, cur: s.day === 1 ? 1 : 0, tgt: s.day === 1 ? 1 : 0, delay: 0, t0: 0, slab, rim, P };
    blocks.push(grp);
    // подпись видна только у ближайших впереди блоков (50–380 м): расписание читается по одному, без наложений
    const it = callouts.add({ id: s.id, getWorld: () => new THREE.Vector3(grp.position.x, grp.position.y + 14, grp.position.z), time: `${s.start}–${s.end} · ${s.minutes} мин`, title: s.shortTitle, dx: 0, dy: -46,
      win: [S2.pStart - 0.005, S2.pEnd + 0.005], fade: 0.01, onClick: () => open(sessionPanel(s), () => new THREE.Vector3(grp.position.x, grp.position.y + 10, grp.position.z)) });
    it.gate = () => grp === state.nearest ? sm(30, 90, state.nearD) * grp.userData.cur : 0;   // подпись только у одного ближайшего блока впереди
    it.enabled = s.day === 1; grp.userData.callout = it;
  });
  function sessionPanel(s) {
    const people = (arr) => arr.map((q) => { const sp = program.speakers.find((x) => x.name === q.name); return `<li><strong>${q.name}</strong><br><span class="dim">${sp?.role ?? ''}</span>${q.talk ? `<br><em>${q.talk}</em>` : ''}</li>`; }).join('');
    return { title: s.title, sub: `${s.day === 1 ? '29' : '30'} июля · ${s.start}–${s.end} · ${s.minutes} мин`,
      body: [`${s.moderators.length ? `<h3>Модератор</h3><ul class="pl">${people(s.moderators)}</ul>` : ''}<h3>Спикеры</h3><ul class="pl">${people(s.speakers)}</ul><p class="dim">${program.note}</p>`], html: true };
  }
  let blockHover = null;
  const bv = new THREE.Vector3();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onBlockPtr = (e) => {
    if (!(state.P > S2.pStart - 0.02 && state.P < S2.pEnd + 0.02)) { blockHover = null; return; }
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const live = blocks.filter((b) => b.visible && b.userData.tgt === 1);
    const hit = ray.intersectObjects(live.map((b) => b.userData.slab), false)[0];       // луч в плиту сессии, а не по центру: блок длиной 180 м
    blockHover = hit ? live.find((b) => b.userData.slab === hit.object) : null; if (blockHover) canvas.style.cursor = 'pointer';
  };
  canvas.addEventListener('pointermove', onBlockPtr); canvas.addEventListener('pointerdown', onBlockPtr);
  canvas.addEventListener('click', () => { if (blockHover) { const b = blockHover; open(sessionPanel(b.userData.s), () => new THREE.Vector3(b.position.x, b.position.y + 10, b.position.z)); } });
  // часы на настиле (носитель C): шкала времени 10:00–18:00
  const hours = new THREE.Group();
  for (let h = 10; h <= 18; h++) {
    const P = g.deckAt(g.mid + (h * 60 - 14 * 60) * M_PER);
    const t = sdf(`${h}:00`, { size: 3.4, anchorX: 'center', anchorY: 'middle', color: '#9aa7ad' });
    const X = new THREE.Vector3(-P.tz, 0, P.tx), Y = new THREE.Vector3(P.tx, 0, P.tz), Z = new THREE.Vector3().crossVectors(X, Y);
    t.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));        // читается с камеры, летящей вдоль оси (время растёт вперёд)
    t.position.set(P.x + X.x * 24, P.y + 0.4, P.z + X.z * 24); hours.add(t);
    const tick = new THREE.Line(lines([P.x - P.tz * 12, P.y + 0.4, P.z + P.tx * 12, P.x - P.tz * 15, P.y + 0.4, P.z + P.tx * 15]), new THREE.LineBasicMaterial({ color: '#9aa7ad', transparent: true, opacity: 0.6 })); hours.add(tick);
  }
  scene.add(hours);
  function setDay(d) {
    state.day = d; let n = 0;
    blocks.forEach((b) => { const on = b.userData.s.day === d; b.userData.tgt = on ? 1 : 0; b.userData.delay = on ? 0.3 + (n++) * 0.3 : 0; b.userData.t0 = performance.now(); });
  }

  // ================= Остановка 3: «Спикеры» — маячки на крышах =================
  const S3 = route.stops[3];
  {
    const V = [], R = [];
    beacons.forEach((b) => { V.push(b.x, b.top, b.z, b.x, b.top + 58, b.z); if (b.sp.moderator) { for (let k = 0; k < 32; k++) { const a1 = (k / 32) * Math.PI * 2, a2 = ((k + 1) / 32) * Math.PI * 2; R.push(b.x + Math.cos(a1) * 15, b.top + 0.5, b.z + Math.sin(a1) * 15, b.x + Math.cos(a2) * 15, b.top + 0.5, b.z + Math.sin(a2) * 15); } } });
    const l = new THREE.LineSegments(lines(V), new THREE.LineBasicMaterial({ color: accent })); l.renderOrder = 12; scene.add(l);
    const rr = new THREE.LineSegments(lines(R), new THREE.LineBasicMaterial({ color: '#8cf0a0' })); rr.renderOrder = 12; scene.add(rr);
    const pts = new THREE.Points(lines(beacons.flatMap((b) => [b.x, b.top + 58, b.z])), new THREE.PointsMaterial({ color: '#c8ffd2', size: 6, sizeAttenuation: false })); pts.renderOrder = 13; scene.add(pts);
    state.beaconsObj = [l, rr, pts];
  }
  // портрет — растр из точек (halftone), собирается за 600 мс; по наведению плотность ×2
  const tex = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'speakers.jpg'); tex.colorSpace = THREE.NoColorSpace;
  const portrait = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uTex: { value: tex }, uIdx: { value: 0 }, uT: { value: 0 }, uDens: { value: 96 }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uTex; uniform float uIdx, uT, uDens, uA; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 cell = floor(vUv * uDens), f = fract(vUv * uDens) - 0.5;
        vec2 rnd = vec2(h(cell), h(cell + 7.1)) - 0.5;
        vec2 off = rnd * (1.0 - uT) * 2.2;                                      // точки слетаются из случайных позиций
        float col = mod(uIdx, 6.0), row = floor(uIdx / 6.0);
        vec2 uv = vec2((col + (cell.x + 0.5) / uDens) / 6.0, 1.0 - (row + 1.0 - (cell.y + 0.5) / uDens) / 4.0);
        float lum = clamp((texture2D(uTex, uv).r - 0.08) * 1.05, 0.0, 1.0);
        float r = pow(lum, 0.85) * 0.5;
        float d = length(f - off);
        float a = (1.0 - smoothstep(r - 0.06, r + 0.04, d)) * uA * smoothstep(0.02, 0.3, lum);
        gl_FragColor = vec4(vec3(0.91, 0.933, 0.94), a);
      }`,
  }));
  portrait.renderOrder = 40; portrait.visible = false; scene.add(portrait);
  const hover = { idx: -1 }, near = { idx: -1, t0: 0 };
  const tag = callouts.add({ id: 'speaker-tag', getWorld: () => new THREE.Vector3(beacons[Math.max(near.idx, 0)].x, beacons[Math.max(near.idx, 0)].top + 70, beacons[Math.max(near.idx, 0)].z), title: '', sub: '', dx: 70, dy: -40, win: [S3.pStart, S3.pEnd], fade: 0.01 });
  const tagN = tag.el.querySelector('.co__n'), tagS = tag.el.querySelector('.co__s') ?? (() => { const s = document.createElement('span'); s.className = 'co__s'; tag.el.append(s); return s; })();
  const spPanel = (sp) => ({ title: sp.name, sub: sp.moderator ? 'Модератор' : 'Спикер', html: true, body: [`<p>${sp.role}</p>${sp.talks.map((t) => `<p><em>${t.title}</em></p>`).join('')}<p class="dim">${sp.sessions.map((id) => { const s = program.sessions.find((x) => x.id === id); return `${s.day === 1 ? '29' : '30'} июля, ${s.start}–${s.end}: ${s.shortTitle}`; }).join('<br>')}</p>`] });
  const v = new THREE.Vector3();
  const screenOf = (b, W, H) => { v.set(b.x, b.top + 58, b.z).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z]; };
  const onSpkPtr = (e) => {
    if (state.P < S3.pStart - 0.01 || state.P > S3.pEnd + 0.02) { hover.idx = -1; return; }
    const W = innerWidth, H = innerHeight; let best = -1, bd = e.pointerType === 'touch' ? 56 : 34;
    beacons.forEach((b, i) => { const [x, y, z] = screenOf(b, W, H); if (z > 1) return; const d = Math.hypot(x - e.clientX, y - e.clientY); if (d < bd) { bd = d; best = i; } });
    hover.idx = best; canvas.style.cursor = best >= 0 ? 'pointer' : '';
  };
  canvas.addEventListener('pointermove', onSpkPtr); canvas.addEventListener('pointerdown', onSpkPtr);
  canvas.addEventListener('click', () => { if (hover.idx >= 0) { const b = beacons[hover.idx]; open(spPanel(b.sp), () => new THREE.Vector3(b.x, b.top + 60, b.z)); } });

  function update(P, now, dt) {
    state.P = P;
    state.aboutPanel.visible = P > S1.pStart - 0.02 && P < S1.pEnd + 0.02;
    cableMats.forEach((m, i) => { m.opacity = sm(S1.pStart + 0.012 + i * 0.022, S1.pStart + 0.028 + i * 0.022, P) * (1 - sm(S1.pEnd - 0.01, S1.pEnd + 0.015, P)); });
    const inS2 = P > S2.pStart - 0.04 && P < S2.pEnd + 0.04;
    state.nearest = null; state.nearD = 1e9;
    blocks.forEach((b) => { if (b.userData.tgt !== 1) return; const dx = b.position.x - camera.position.x, dz = b.position.z - camera.position.z, d = Math.hypot(dx, dz);
      camera.getWorldDirection(bv); const fw = bv.x * dx + bv.z * dz;         // впереди по взгляду камеры
      if (fw > 25 && d < 520 && d < state.nearD) { state.nearD = d; state.nearest = b; } });
    hours.visible = inS2;
    blocks.forEach((b) => {
      const u = b.userData, wait = (now - u.t0) / 1000 - u.delay;
      if (wait > 0) u.cur += Math.sign(u.tgt - u.cur) * Math.min(Math.abs(u.tgt - u.cur), dt / 0.3);   // 300 мс на элемент, линейно, без bounce
      u.callout.enabled = inS2 && u.tgt === 1 && u.cur > 0.6;
      b.visible = inS2 && u.cur > 0.002; b.scale.y = Math.max(u.cur, 0.01);
      u.slab.material.opacity = 0.2 + (blockHover === b ? 0.3 : 0);
    });
    // остановка 3: ближайший к камере маячок получает портрет и подпись
    const inS3 = P > S3.pStart - 0.01 && P < S3.pEnd + 0.01;
    state.beaconsObj.forEach((o) => (o.visible = P > S3.pStart - 0.06 && P < S3.pEnd + 0.06));
    let idx = hover.idx;
    if (idx < 0) { const u = (P - S3.pStart) / (S3.pEnd - S3.pStart); idx = u < -0.02 || u > 1.02 ? -1 : Math.min(beacons.length - 1, Math.max(0, Math.round(u * (beacons.length - 1)))); }   // тур: камера ведёт от маячка к маячку
    if (idx !== near.idx) { near.idx = idx; near.t0 = now; if (idx >= 0) { const sp = beacons[idx].sp; tagN.textContent = sp.name; tagS.textContent = sp.role.length > 62 ? sp.role.slice(0, 60).replace(/[,\s–-]+\S*$/, '') + '…' : sp.role; } }
    const show = inS3 && idx >= 0;
    portrait.visible = show;
    if (show) {
      const b = beacons[idx], mat = portrait.material.uniforms;
      const dist = Math.hypot(b.x - camera.position.x, b.z - camera.position.z, b.top - camera.position.y); portrait.position.set(b.x, b.top + 58 + dist * 0.12, b.z); portrait.quaternion.copy(camera.quaternion); portrait.scale.setScalar(Math.max(dist * 0.19, 34));
      mat.uIdx.value = b.sp.photo; mat.uT.value = Math.min((now - near.t0) / 600, 1); mat.uT.value = 1 - (1 - mat.uT.value) ** 3;
      mat.uDens.value = hover.idx === idx ? 170 : 96; mat.uA.value = sm(S3.pStart, S3.pStart + 0.02, P) * (1 - sm(S3.pEnd - 0.012, S3.pEnd + 0.008, P));
    }
  }
  return { update, setDay, state };
}
