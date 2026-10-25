import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Лёгкий bloom (порог высокий, 0.35) и слабое зерно 2–3%. Без аберраций, глитчей и вспышек (раздел 6.2).
export function makePost(renderer, scene, camera, { bloom = 0.3, grain = 0 } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bp = new UnrealBloomPass(size, bloom, 0.35, 0.9);
  composer.addPass(bp);
  const gp = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmp: { value: grain }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmp, uT; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float n = h(vUv * 1000.0 + uT) - 0.5; gl_FragColor = vec4(c.rgb + n * uAmp * (0.3 + c.r), c.a); }`,
  });
  // OutputPass не используем: шейдеры пишут значения как есть, sRGB-кодирование подняло бы чёрный до серого
  composer.addPass(gp);
  return {
    composer,
    setSize: (w, h) => composer.setSize(w, h),
    render: (t) => { gp.uniforms.uT.value = (t * 0.001) % 10; composer.render(); },
    setBloom: (v) => (bp.strength = v), bp, gp, composer,
  };
}
