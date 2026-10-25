// Носитель B: выноска — точка на объекте, тонкий лидер, подпись (DOM, проецируется каждый кадр). Появляется по окну прогресса P, один раз.
import * as THREE from 'three';

const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

export function createCallouts(root, camera) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'co-svg'); svg.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div'); box.className = 'co-root';
  root.append(svg, box);
  const items = [], v = new THREE.Vector3();

  function add({ id, world, time, title, sub, dx = 80, dy = -70, win, fade = 0.012, onClick, accent = true, getWorld, place }) {
    const el = document.createElement(onClick ? 'button' : 'div'); el.className = 'co' + (accent ? ' co--accent' : '');
    el.innerHTML = `${time ? `<span class="co__t">${time}</span>` : ''}<span class="co__n">${title}</span>${sub ? `<span class="co__s">${sub}</span>` : ''}`;
    if (onClick) el.addEventListener('click', () => onClick(id));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', 3);
    svg.append(line, dot); box.append(el);
    const it = { id, world, getWorld, el, line, dot, dx, dy, win, fade, a: 0, place };
    items.push(it); return it;
  }
  function update(P, W, H) {
    for (const it of items) {
      const g = it.gate ? it.gate() : 1; const a = it.enabled === false ? 0 : g * sm(it.win[0], it.win[0] + it.fade, P) * (1 - sm(it.win[1] - it.fade, it.win[1], P));
      const w = it.getWorld ? it.getWorld() : it.world;
      v.copy(w).project(camera);
      const vis = a > 0.01 && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      it.el.style.visibility = vis ? 'visible' : 'hidden'; it.line.style.display = it.dot.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      let lx = x + it.dx, ly = y + it.dy;
      const pl = it.place ? it.place(W, H) : null;
      if (pl) [lx, ly] = pl;
      else { const w = it.el.offsetWidth || 240; if (lx + w > W - 10) lx = Math.max(10, W - 10 - w); if (lx < 10) lx = 10; ly = Math.min(Math.max(ly, 76), H - 40); }                       // колонка подписей на фиксированных местах экрана: без наложений
      it.el.style.opacity = a; it.el.style.transform = `translate(${lx}px, ${ly}px) translate(0, -50%) translateY(${(1 - a) * 8}px)`;
      it.line.setAttribute('x1', x); it.line.setAttribute('y1', y); it.line.setAttribute('x2', lx + (pl ? it.el.offsetWidth : 0)); it.line.setAttribute('y2', ly); it.line.style.opacity = a;
      it.dot.setAttribute('cx', x); it.dot.setAttribute('cy', y); it.dot.style.opacity = a;
      it.el.style.pointerEvents = a > 0.6 && it.el.tagName === 'BUTTON' ? 'auto' : 'none';
    }
  }
  // Карточка по клику: стоит рядом с объектом сцены, ведёт к нему линией, всегда целиком в кадре (вместо боковой панели)
  const card = document.createElement('aside'); card.className = 'card'; card.hidden = true; card.setAttribute('role', 'dialog'); box.append(card);
  const cl = document.createElementNS('http://www.w3.org/2000/svg', 'line'); cl.style.display = 'none'; svg.append(cl);
  let cardWorld = null;
  function openCard({ getWorld, title, sub, body, html }) {
    cardWorld = getWorld;
    card.innerHTML = `<div class="card__head"><div><p class="kicker">${sub ?? ''}</p><h2>${title}</h2></div><button class="link" data-close>Закрыть</button></div>${html ? body.join('') : body.map((t) => `<p>${t}</p>`).join('')}`;
    card.hidden = false; requestAnimationFrame(() => card.classList.add('on')); card.querySelector('[data-close]').focus();
    card.querySelector('[data-close]').onclick = closeCard;
  }
  function closeCard() { cardWorld = null; card.classList.remove('on'); card.hidden = true; cl.style.display = 'none'; }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(); });
  const baseUpdate = update;
  function update2(P, W, H) {
    baseUpdate(P, W, H);
    if (!cardWorld) return;
    v.copy(cardWorld()).project(camera);
    if (v.z > 1) { closeCard(); return; }
    const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, w = card.offsetWidth, h = card.offsetHeight;
    let cx = x + 70, cy = y - h / 2; if (cx + w > W - 24) cx = x - 70 - w;                 // слева, если справа не помещается
    if (W < 700) { cx = 12; cy = Math.max(72, H - h - 12); } cx = Math.min(Math.max(cx, 12), W - w - 12); cy = Math.min(Math.max(cy, 72), H - h - 12);
    card.style.transform = `translate(${cx}px, ${cy}px)`;
    cl.style.display = ''; cl.setAttribute('x1', x); cl.setAttribute('y1', y); cl.setAttribute('x2', Math.min(Math.max(x, cx), cx + w)); cl.setAttribute('y2', Math.min(Math.max(y, cy), cy + h));
  }
  return { add, update: update2, items, openCard, closeCard };
}
