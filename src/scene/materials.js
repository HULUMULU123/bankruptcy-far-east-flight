import * as THREE from 'three';

// Единый набор uniform (раздел 6.2): общий для всех слоёв, один материал на тип слоя.
export const U = {
  uFocus: { value: new THREE.Vector3() },
  uRadius: { value: 900 },
  uProgressReveal: { value: 1 },
  uSizeFar: { value: 1.0 },
  uSizeNear: { value: 2.0 },
  uDpr: { value: 1 },
  uBg: { value: new THREE.Color('#07090b') },
  uHaze: { value: new THREE.Color(0.15, 0.19, 0.215) },   // дымка у горизонта: дальний город растворяется в ней (воздушная перспектива)
  uFarFade: { value: 6500 },
  uPulseR: { value: 0 },   // сканирующий импульс: радиус кольца и яркость
  uPulseA: { value: 0 },
  uScatter: { value: 0 },
  uTime: { value: 0 },  // рассыпание города при сжатом перелёте (0 — собран, 1 — облако точек)
};
export const INK = new THREE.Color('#e8eef0');
export const ACCENT = new THREE.Color('#2fbd4c');

const head = /* glsl */ `
  uniform vec3 uFocus; uniform float uRadius, uProgressReveal, uFarFade, uPulseR, uPulseA, uScatter, uTime;
  float revealAt(vec3 p) { return (1.0 - smoothstep(uRadius * 0.6, uRadius, distance(p.xz, uFocus.xz))) * uProgressReveal; }
  float pulseAt(vec3 p) { float d = distance(p.xz, uFocus.xz); float x = (d - uPulseR) / 22.0; return uPulseA * exp(-x * x); }
  float farFade(float z) { return 1.0 - smoothstep(uFarFade * 0.5, uFarFade, -z); }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  // прореживание вдали: плотность точек падает с расстоянием (экранная плотность остаётся постоянной), у фокуса не трогаем
  vec3 scatterPos(vec3 p) { vec3 h = vec3(hash3(p), hash3(p + 3.1), hash3(p + 7.7)) - 0.5; return p + h * uScatter * vec3(260.0, 420.0, 260.0); }
  bool thinned(vec3 p, float dist, float r) { float keep = clamp(max(320.0 / dist, r), 0.03, 1.0); return hash3(p) > keep; }
`;
const fragFlat = /* glsl */ `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA); }`;

function mat(vertexBody, extra = {}, color = INK) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, ...extra,
    uniforms: { ...U, uColor: { value: color } },
    vertexShader: head + vertexBody,
    fragmentShader: fragFlat,
  });
}

export const makePoints = ({ color = INK, bright = 1 } = {}) => mat(/* glsl */ `
  attribute float aW; uniform float uSizeFar, uSizeNear, uDpr; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(scatterPos(position), 1.0);
    float r = revealAt(position), p = pulseAt(position);
    if (r < 0.12 || (aW < 0.98 && r < 0.95) || thinned(position, -mv.z, r)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_PointSize = mix(uSizeFar, uSizeNear, r) * uDpr * (1.0 + p);
    float grad = mix(1.3, 1.0, aW);
    vA = min(1.0, (mix(0.0, 0.85, smoothstep(0.1, 0.8, r)) * grad * farFade(mv.z) * (1.0 - 0.8 * smoothstep(500.0, 3300.0, -mv.z)) + p) * ${bright.toFixed(2)});
    gl_Position = projectionMatrix * mv;
  }`, {}, color);

export const makeLines = ({ color = INK } = {}) => mat(/* glsl */ `
  attribute float aW; varying float vA;
  void main() {
    vec3 pp = position; float wv = 1.0;
    if (aW > 3.5 && aW < 4.5) { pp.y += 0.45 * sin(pp.x * 0.021 + uTime * 0.9) * sin(pp.z * 0.017 + uTime * 0.7); wv = 0.55 + 1.2 * pow(0.5 + 0.5 * sin(pp.x * 0.012 + pp.z * 0.018 - uTime * 0.6), 4.0); }
    vec4 mv = modelViewMatrix * vec4(scatterPos(pp), 1.0);
    float r = revealAt(position), p = pulseAt(position), c = aW;
    float base = 0.4;
    if (c > 0.5 && c < 1.5) base = 0.55;
    if (c > 1.5 && c < 2.5) base = 0.9;
    if (c > 2.5 && c < 3.5) base = 0.7;
    if (c > 3.5 && c < 4.5) base = 0.12;
    if (c > 4.5) base = 0.5;
    vA = min(1.0, base * wv * mix(0.5, 1.0, r) * farFade(mv.z) + p * 0.6);
    gl_Position = projectionMatrix * mv;
  }`, {}, color);

export const contourMat = mat(/* glsl */ `
  attribute float aW; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(scatterPos(position), 1.0);
    float r = revealAt(position), p = pulseAt(position);
    vA = min(1.0, (aW > 0.5 ? 0.55 : 0.2) * r * farFade(mv.z) + p * 0.5);   // горизонтали видны только у фокуса
    gl_Position = projectionMatrix * mv;
  }`);

export const makeEdges = ({ color = INK, always = 0, nearFade = true, floor = 0.22 } = {}) => mat(/* glsl */ `
  attribute float aW; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(scatterPos(position), 1.0);
    float rv = revealAt(position), p = pulseAt(position);
    // линии зданий видны только рядом с камерой: вдали остаются сплошные объёмы без «каши» из рёбер
    float near = ${nearFade ? '1.0 - smoothstep(450.0, 1900.0, -mv.z)' : '1.0'};
    float base = ${always > 0 ? `${always.toFixed(2)} * (${floor.toFixed(2)} + ${(1 - floor).toFixed(2)} * (1.0 - smoothstep(300.0, 3200.0, -mv.z)))` : 'near * mix(0.5, 1.0, rv)'};
    vA = min(1.0, base * mix(1.2, 1.0, aW) * 0.72 * farFade(mv.z) * (1.0 - uScatter * 0.6) + p * 0.6);
    gl_Position = projectionMatrix * mv;
  }`, {}, color);

export const fillMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uColor: { value: INK } }, transparent: true, depthWrite: true, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  vertexShader: head + /* glsl */ `
    attribute float aW; varying vec3 vP; varying vec3 vWp; varying float vR; varying float vW; varying float vF;
    void main() {
      vec3 sp = scatterPos(position); vWp = sp;
      vec4 mv = modelViewMatrix * vec4(sp, 1.0);
      vP = mv.xyz; vR = revealAt(position); vW = aW; vF = farFade(mv.z) * (1.0 - uScatter);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uBg, uHaze; uniform float uTime; varying vec3 vP; varying vec3 vWp; varying float vR; varying float vW; varying float vF;
    float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); if (n.z < 0.0) n = -n;
      vec3 L = normalize(mat3(viewMatrix) * vec3(-0.55, 0.65, -0.5));
      float lit = clamp(dot(n, L), 0.0, 1.0);
      float roof = smoothstep(0.85, 0.98, dot(n, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0))));
      float body = 0.05 + 0.13 * lit + 0.06 * roof + vR * 0.06 + (1.0 - vW) * 0.02;
      if (vW > 0.36 && vW < 0.38) body = 0.035 + 0.05 * lit;   // полотно моста: тёмнее, чтобы читались кромки и ванты
      vec3 col = vec3(0.91, 0.933, 0.94) * body;
      // окна: редкие тёплые огни на стенах рядом с камерой, часть медленно гаснет и зажигается
      vec3 nW = vec3(dot(viewMatrix[0].xyz, n), dot(viewMatrix[1].xyz, n), dot(viewMatrix[2].xyz, n));
      if (abs(nW.y) < 0.35 && vW > 0.0 && vW < 0.99 && !(vW > 0.36 && vW < 0.38)) {
        float along = abs(nW.x) > abs(nW.z) ? vWp.z : vWp.x;
        vec2 q = vec2(along / 3.2, vWp.y / 3.4), cell = floor(q), f = fract(q);
        float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.74);
        float seed = hh(cell + floor(vec2(vWp.x, vWp.z) / 23.0)), tick = floor(uTime * 0.12 + seed * 40.0);
        float on = step(0.78, hh(cell * 1.7 + vec2(floor(vWp.x / 23.0), tick))) * 1.0 + step(0.9, seed) * 0.0;
        float near = 1.0 - smoothstep(350.0, 1300.0, length(vP));
        col = mix(col, vec3(1.0, 0.91, 0.7) * 0.95, win * on * near * 0.85);
      }
      gl_FragColor = vec4(mix(uHaze * 0.9, col, vF), 0.97);
    }`,
});
