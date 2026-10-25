// Носители информации в сцене (раздел 2): A — фасад-панель, C — надпись на поверхности. Текст — SDF (troika).
import * as THREE from 'three';
import { Text } from 'troika-three-text';

const FONT = import.meta.env.BASE_URL + 'fonts/onest-500.ttf';
const INK = '#e8eef0', ACCENT = '#2fbd4c', SURFACE = '#0e1215';

function sdf(text, { size, color = INK, anchorX = 'center', anchorY = 'middle', maxWidth, letterSpacing = 0, lineHeight = 1.15 }) {
  const t = new Text();
  Object.assign(t, { text, font: FONT, fontSize: size, color, anchorX, anchorY, maxWidth, letterSpacing, lineHeight, material: undefined });
  t.sync();
  return t;
}

/** Носитель C: надпись лежит на воде, читается с юга. Контур без заливки — «чертёж». */
export function waterTitle({ x, z, lines, size, sub, subSize }) {
  const g = new THREE.Group();
  g.position.set(x, 0.5, z);
  g.rotation.x = -Math.PI / 2;
  const mk = (txt, s, y, color, extra = {}) => {
    const t = sdf(txt, { size: s, color, ...extra });
    t.position.y = y; t.fillOpacity = extra.fill ?? 0.0; t.strokeWidth = s * 0.012; t.strokeColor = color; t.strokeOpacity = 0.9;
    t.depthOffset = -1; g.add(t); return t;
  };
  lines.forEach((l, i) => mk(l, size, -i * size * 1.25, INK, { letterSpacing: 0.04 }));
  if (sub) mk(sub, subSize, -lines.length * size * 1.25 - subSize * 0.6, ACCENT, { letterSpacing: 0.03 });
  return g;
}

/** Носитель A: панель на фасаде, повёрнута к камере. Непрозрачная поверхность, рамка 1px, текст в 3 строки. */
export function facadePanel({ position, yaw, width, height, rows, size }) {
  const g = new THREE.Group();
  g.position.copy(position); g.rotation.y = yaw;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: SURFACE }));
  bg.renderOrder = 20; g.add(bg);
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3((a * width) / 2, (b * height) / 2, 0.05))),
    new THREE.LineBasicMaterial({ color: ACCENT }));
  frame.renderOrder = 21; g.add(frame);
  const pad = size * 0.9;
  let y = height / 2 - pad;
  rows.forEach((r, i) => {
    const t = sdf(r.text, { size: r.size ?? size, color: r.color ?? INK, anchorX: 'left', anchorY: 'top', maxWidth: width - pad * 2 });
    t.position.set(-width / 2 + pad, y, 0.1); t.renderOrder = 22; t.material.depthTest = false; g.add(t);
    y -= (r.size ?? size) * 1.45;
  });
  return g;
}
