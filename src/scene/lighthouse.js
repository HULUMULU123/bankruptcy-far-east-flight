// Токаревский маяк как «навигационный ориентир»: тёмная граненая башня с зелёными поясами, стеклянный фонарь, вращающийся луч
// и радарная разметка на воде (кольца дальности, шкала азимута, шлейф развёртки). Суда, которых касается луч, помечаются в life.js.
// Высота башни 12 м — по OSM, масштаб ×1.7 — стилизация для читаемости (TODO(content): сверить по фото).
import * as THREE from 'three';

const INK = 0xe8eef0;
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.1, 'rgba(210,255,222,0.8)'); r.addColorStop(0.38, 'rgba(47,189,76,0.2)'); r.addColorStop(1, 'rgba(47,189,76,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();

function faceted(geo, extra = '') {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; varying vec3 vL; void main(){ vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec3 vP; varying vec3 vL;
      void main(){
        vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); if (n.z < 0.0) n = -n;
        float lit = clamp(dot(n, normalize(mat3(viewMatrix) * vec3(-0.55, 0.65, -0.5))), 0.0, 1.0);
        vec3 c = vec3(0.06, 0.075, 0.085) + vec3(0.21, 0.24, 0.26) * lit;
        ${extra}
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function makeLighthouse({ x, z, ground = 2, beamLength = 3200, sweepRadius = 950 }) {
  const root = new THREE.Group(); root.position.set(x, ground, z);
  const g = new THREE.Group(); g.scale.setScalar(1.7); root.add(g);   // стилизованный масштаб башни

  // --- башня: цоколь, ствол 8 граней с сужением, галерея с ограждением, фонарь, кровля со шпилем
  const plinth = new THREE.CylinderGeometry(4.4, 4.9, 1.6, 8, 1); plinth.translate(0, 0.8, 0);
  const shaft = new THREE.CylinderGeometry(2.0, 3.1, 11, 8, 1, true); shaft.translate(0, 1.6 + 5.5, 0);
  const gallery = new THREE.CylinderGeometry(3.6, 2.9, 0.9, 8, 1); gallery.translate(0, 12.6 + 0.45, 0);
  const roof = new THREE.ConeGeometry(2.5, 3.2, 8, 1); roof.translate(0, 16.0 + 1.6, 0);
  const bandY = [4.1, 8.0];
  const bandsGLSL = bandY.map((y) => `c = mix(c, vec3(0.18, 0.74, 0.3), smoothstep(0.55, 0.0, abs(vL.y - ${y.toFixed(1)}) ) * 0.95);`).join('\n');
  [plinth, shaft, gallery, roof].forEach((geo) => { const m = new THREE.Mesh(geo.toNonIndexed(), faceted(geo, bandsGLSL)); g.add(m); });
  // --- стеклянный фонарь: светящееся ядро, рамы, линза Френеля кольцами
  const glassGeo = new THREE.CylinderGeometry(1.75, 1.9, 2.9, 8, 1, true); glassGeo.translate(0, 13.05 + 1.45, 0);
  const glass = new THREE.Mesh(glassGeo, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vY; void main(){ float k = 0.65 + 0.35 * sin(vY * 22.0); gl_FragColor = vec4(mix(vec3(0.55, 1.0, 0.7), vec3(1.0), 0.6) * k, 0.96); }',
  }));
  g.add(glass);
  // --- контурные линии (чертёж): рёбра граней, кольца, ограждение галереи, мачта-шпиль
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85 });
  const accentMat = new THREE.LineBasicMaterial({ color: 0x2fbd4c, transparent: true, opacity: 0.95 });
  [plinth, shaft, gallery, roof].forEach((geo) => g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edgeMat)));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(glassGeo, 20), accentMat));
  const ring = (y, r, mat, n = 48) => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: n }, (_, i) => new THREE.Vector3(Math.cos((i / n) * Math.PI * 2) * r, y, Math.sin((i / n) * Math.PI * 2) * r))), mat);
  [13.4, 14.5, 15.6].forEach((y) => g.add(ring(y, 1.78 + (y - 13.05) * 0.03, accentMat)));
  const rail = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; rail.push(Math.cos(a) * 3.5, 13.5, Math.sin(a) * 3.5, Math.cos(a) * 3.5, 14.7, Math.sin(a) * 3.5); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rail, 3)), edgeMat)); g.add(ring(14.7, 3.5, edgeMat, 24));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 19.2, 0), new THREE.Vector3(0, 21.5, 0)]), accentMat));
  const finial = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 21.6, 0], 3)), new THREE.PointsMaterial({ color: 0x9dffb4, size: 6, sizeAttenuation: false })); g.add(finial);

  // --- свечение и два луча (длинный и короткий встречный)
  const mk = (size, op) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op })); s.scale.set(size, size, 1); s.position.y = 14.5; s.renderOrder = 30; g.add(s); return s; };
  mk(16, 1); const halo = mk(120, 0.4); mk(300, 0.07);
  const L = beamLength, cone = new THREE.ConeGeometry(70, L, 40, 1, true); cone.translate(0, -L / 2, 0); cone.rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uL: { value: L } },
    vertexShader: 'varying float vT; varying float vD; varying vec3 vN; varying vec3 vV; uniform float uL; void main(){ vT = position.x / uL; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vT; varying float vD; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.5); float a = f * pow(max(1.0 - vT, 0.0), 1.35) * smoothstep(0.0, 0.015, vT) * smoothstep(120.0, 1100.0, vD) * 0.36; gl_FragColor = vec4(vec3(0.72, 1.0, 0.78), a); }',
  });
  const beam = new THREE.Mesh(cone, beamMat); beam.position.y = 14.5; beam.renderOrder = 31; g.add(beam);

  // --- радарная разметка на воде: кольца дальности, шкала азимута, шлейф развёртки за лучом
  const sweepMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uAng: { value: 0 }, uR: { value: sweepRadius } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uAng, uR; varying vec2 vP;
      #define TAU 6.2831853
      void main() {
        float r = length(vP), phi = atan(-vP.y, vP.x);              // та же ось, что у луча: вращение вокруг Y
        float d = mod(uAng - phi, TAU);                               // на сколько градусов отстаёт точка от луча
        float trail = exp(-d * 1.9) * (1.0 - smoothstep(0.0, uR, r) * 0.85);
        float rings = 0.0;
        for (int i = 1; i <= 6; i++) { float rr = uR * float(i) / 6.0; rings += (1.0 - smoothstep(0.0, 1.6 + r * 0.004, abs(r - rr))) * (i == 6 ? 0.42 : 0.16); }
        float step10 = TAU / 36.0, a10 = abs(fract(phi / step10 + 0.5) - 0.5) * step10 * r;
        float big = abs(fract(phi / (TAU / 12.0) + 0.5) - 0.5) * (TAU / 12.0) * r;
        float ticks = (1.0 - smoothstep(0.0, 1.4, a10)) * step(uR * 0.955, r) * step(r, uR) + (1.0 - smoothstep(0.0, 1.6, big)) * step(uR * 0.92, r) * step(r, uR);
        float a = (trail * 0.0 + rings * 0.45 + ticks * 0.7) * (1.0 - smoothstep(uR * 0.97, uR * 1.01, r));
        gl_FragColor = vec4(vec3(0.3, 0.9, 0.5), a);
      }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(sweepRadius * 1.02, 160), sweepMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.35; disc.renderOrder = 4; root.add(disc);

  return { group: root, setAngle: (a) => { beam.rotation.y = a; sweepMat.uniforms.uAng.value = a; }, halo, pos: new THREE.Vector3(x, 0, z), radius: sweepRadius };
}
