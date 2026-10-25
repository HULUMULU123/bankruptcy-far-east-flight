import * as THREE from 'three';

// Небо: вертикальный холодный градиент к горизонту и редкие звёзды (раздел 6.1). Без цветных градиентов: один холодный тон.
export function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, transparent: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float e = vDir.y;
        vec3 bg = vec3(0.027, 0.035, 0.043), hz = vec3(0.17, 0.215, 0.245);
        float up = smoothstep(0.0, 0.3, e), down = smoothstep(0.0, -0.08, e);
        vec3 c = mix(hz, bg, up); c = mix(c, bg, down);
        vec3 q = floor(vDir * 420.0); float s = step(0.9975, h(q)) * smoothstep(0.08, 0.5, e);
        gl_FragColor = vec4(c + s * 0.55, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), m);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}
