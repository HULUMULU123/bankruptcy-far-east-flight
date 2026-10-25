// Форма регистрации в перспективе (CSS3D): стоит у конца косы, интерактивна как обычный HTML. Отправка — заглушка с валидацией.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

export function createForm3D({ camera, program }) {
  const renderer = new CSS3DRenderer(); renderer.domElement.className = 'css3d'; document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  const f = program.form;
  const el = document.createElement('form'); el.className = 'reg'; el.noValidate = true; el.setAttribute('aria-label', f.title);
  const F = [['name', 'Имя', 'text', 'given-name'], ['patr', 'Отчество', 'text', 'additional-name'], ['surname', 'Фамилия', 'text', 'family-name'], ['org', 'Организация', 'text', 'organization'], ['email', 'E-mail', 'email', 'email'], ['phone', 'Телефон', 'tel', 'tel']];
  el.innerHTML = `<div class="reg__form"><h2>Участие</h2><p class="reg__lead">${f.title}</p>
    <div class="row2">${[F[0], F[2]].map(([id, l, t, ac]) => `<label class="fld"><span>${l}</span><input id="f-${id}" name="${id}" type="${t}" autocomplete="${ac}"><em class="err" id="e-${id}" role="alert"></em></label>`).join('')}</div>
    ${[F[1], F[3], F[4], F[5]].map(([id, l, t, ac]) => `<label class="fld"><span>${l}</span><input id="f-${id}" name="${id}" type="${t}" autocomplete="${ac}" ${id === 'phone' ? 'placeholder="+7"' : ''}><em class="err" id="e-${id}" role="alert"></em></label>`).join('')}
    <label class="chk"><input type="checkbox" id="f-consent"><span>${f.consent}</span></label><em class="err" id="e-consent" role="alert"></em>
    <button class="btn btn--primary" type="submit">${f.submit}<span aria-hidden="true">→</span></button></div>
    <div class="badge" hidden></div>`;
  const msgs = { name: 'Укажите имя', surname: 'Укажите фамилию', org: 'Укажите организацию', email: 'Проверьте e-mail: пример name@company.ru', phone: 'Телефон: не меньше 10 цифр', consent: 'Нужно согласие, чтобы отправить заявку' };
  const rules = { name: (v) => v.trim(), surname: (v) => v.trim(), org: (v) => v.trim(), email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), phone: (v) => v.replace(/\D/g, '').length >= 10 };
  el.addEventListener('submit', (e) => {
    e.preventDefault(); let first = null, ok = true;
    for (const [k, rule] of Object.entries(rules)) { const inp = el.querySelector(`#f-${k}`), bad = !rule(inp.value); el.querySelector(`#e-${k}`).textContent = bad ? msgs[k] : ''; inp.toggleAttribute('aria-invalid', bad); if (bad) { ok = false; first ??= inp; } }
    const c = el.querySelector('#f-consent'); el.querySelector('#e-consent').textContent = c.checked ? '' : msgs.consent; if (!c.checked) { ok = false; first ??= c; }
    if (!ok) { first.focus(); return; }
    const v = (id) => el.querySelector(`#f-${id}`).value.trim();
    // бейдж участника: имя, организация, штрихкод по хэшу данных
    let h = 2166136261; for (const ch of `${v('name')}${v('surname')}${v('email')}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const bars = Array.from({ length: 34 }, (_, i) => { h = Math.imul(h ^ i, 2654435761) >>> 0; return `<i style="width:${1 + (h % 3)}px"></i>`; }).join('');
    const badge = el.querySelector('.badge');
    badge.innerHTML = `<div class="badge__top"><img src="${import.meta.env.BASE_URL}sber.svg" alt="Сбер" height="20"><span>Участник</span></div>
      <div class="badge__name">${v('name')}<br>${v('surname')}</div><p class="badge__org">${v('org')}</p>
      <div class="badge__bars" aria-hidden="true">${bars}</div>
      <p class="badge__foot"><strong>Bankruptcy Far East</strong><br>29–30 июля 2026 · VLADIVOSTOK Grand Hotel&amp;Spa</p>
      <p class="badge__note">Заявка принята. Подтверждение придёт на ${v('email')}</p>`;
    el.querySelector('.reg__form').hidden = true; badge.hidden = false; el.classList.add('is-badge');
  });
  const obj = new CSS3DObject(el); scene.add(obj);
  const place = (pos, lookAt) => { obj.position.copy(pos); obj.lookAt(lookAt); };
  // на десктопе форма стоит в мире; на телефоне fit() каждый кадр ставит её в экранные координаты
  // масштаб подбирается каждый кадр: форма занимает ~34% ширины экрана и целиком помещается по высоте
  const dirV = new THREE.Vector3(), upV = new THREE.Vector3();
  function fit(W, H) {
    const narrow = W < 700, h = el.offsetHeight || 560;
    if (narrow) {   // телефон: форма — «нижний лист» параллельно экрану, чтобы не закрывать маяк
      const D = 60, wpp = (2 * D * Math.tan((camera.fov * Math.PI) / 360)) / H, sc = Math.min((W * 0.9) / 380, (H * 0.5) / h) * wpp;
      camera.getWorldDirection(dirV); upV.set(0, 1, 0).applyQuaternion(camera.quaternion);
      obj.position.copy(camera.position).addScaledVector(dirV, D).addScaledVector(upV, -(0.5 * H - 0.5 * h * (sc / wpp) - 14) * wpp * 0.0 - (H * 0.5 - (h * sc) / wpp / 2 - 12) * wpp);
      obj.quaternion.copy(camera.quaternion); obj.scale.setScalar(sc); return;
    }
    const dist = camera.position.distanceTo(obj.position), worldPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / H;
    const w = Math.min(Math.max(W * 0.25, 300), 380);
    obj.scale.setScalar((Math.min(w, (H * 0.6 * 380) / h) / 380) * worldPerPx);
  }
  const nrm = new THREE.Vector3(), toCam = new THREE.Vector3();
  const facing = () => { nrm.set(0, 0, 1).applyQuaternion(obj.quaternion); toCam.copy(camera.position).sub(obj.position).normalize(); return nrm.dot(toCam); };
  return { facing, el, obj, place, resize: (w, h) => renderer.setSize(w, h), render: () => { fit(innerWidth, innerHeight); renderer.render(scene, camera); }, setOpacity: (a) => { el.style.opacity = a; el.style.pointerEvents = a > 0.7 ? 'auto' : 'none'; renderer.domElement.style.display = a > 0.01 ? '' : 'none'; } };
}
