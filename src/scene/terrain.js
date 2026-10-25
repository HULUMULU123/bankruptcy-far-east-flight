// Сплошной рельеф из карты высот 30 м: тёмная поверхность с гранёным светом, горизонтали рисуются шейдером (10 м, индексные 50 м).
import * as THREE from 'three';
import { U } from './materials.js';

export async function buildTerrain(routePts) {
  const meta = await (await fetch(import.meta.env.BASE_URL + 'data/dem.json')).json();
  const raw = new Uint16Array(await (await fetch(import.meta.env.BASE_URL + 'data/dem.bin')).arrayBuffer());
  const { x0, z0, step, nx, nz } = meta;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = x0 + i * step; pos[k + 1] = raw[j * nx + i] / 10; pos[k + 2] = z0 + j * step; }
  // клетки только рядом с маршрутом (до 4.5 км) и не полностью над водой
  const near = (x, z) => { let d = 1e12; for (let s = 0; s < routePts.length - 1; s++) { const a = routePts[s], b = routePts[s + 1], abx = b[0] - a[0], abz = b[1] - a[1]; const t = Math.min(Math.max(((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz), 0), 1); d = Math.min(d, Math.hypot(x - a[0] - t * abx, z - a[1] - t * abz)); } return d < 4500; };
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (raw[a] + raw[b] + raw[c] + raw[d] < 12) continue;                       // море
    if (!near(x0 + i * step, z0 + j * step)) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    vertexShader: /* glsl */ `
      uniform float uScatter; varying vec3 vP; varying vec3 vV; varying float vD;
      void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFocus, uBg, uHaze; uniform float uRadius, uProgressReveal, uFarFade; varying vec3 vP; varying vec3 vV; varying float vD;
      float contour(float h, float every, float w) { float f = abs(fract(h / every - 0.5) - 0.5) * every; return 1.0 - smoothstep(0.0, w, f); }
      void main() {
        if (vP.y < 0.7) discard;                                                  // берег: вода остаётся чёрной
        vec3 n = normalize(cross(dFdx(vV), dFdy(vV))); if (n.z < 0.0) n = -n;
        float lit = clamp(dot(n, normalize(mat3(viewMatrix) * vec3(-0.55, 0.65, -0.5))), 0.0, 1.0);
        float r = (1.0 - smoothstep(uRadius * 0.6, uRadius * 1.4, distance(vP.xz, uFocus.xz))) * uProgressReveal;
        float fw = clamp(fwidth(vP.y), 0.05, 2.5);
        float c10 = contour(vP.y, 10.0, fw * 1.1), c50 = contour(vP.y, 50.0, fw * 1.4);
        float line = max(c10 * 0.22, c50 * 0.55) * (0.45 + 0.55 * r);
        float body = 0.022 + 0.085 * lit + 0.05 * r * lit;
        float fog = smoothstep(2500.0, uFarFade, vD);
        vec3 col = vec3(0.91, 0.933, 0.94) * (body + line);
        gl_FragColor = vec4(mix(col, uHaze * 0.9, fog * 0.9), 1.0);
      }`,
    extensions: { derivatives: true },
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 0;
  return mesh;
}
