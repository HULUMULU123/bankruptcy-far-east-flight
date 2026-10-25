// Слой E (HTML): шапка, прогресс-линия, панель трансляции, заставка/финал. Тексты — из content.<lang>.json (раздел 2: только разрешённое).
import ru from '../content/content.ru.json';
import en from '../content/content.en.json';
import program from '../content/program.json';

const C = { ru, en };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const link = (l) => (l.href.startsWith('TODO') ? `<span class="todo">${l.label} <em>TODO(content)</em></span>` : `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`);
const NAV_STOPS = [1, 2, 3, 4, 5];   // пункты меню → остановки

export function mountUI({ stopsCount, onAction, onNav, onLang, onDay, lang = 'ru' }) {
  const root = document.getElementById('ui');
  let L = lang, content = C[L];
  const header = el('header', 'bar'), intro = el('section', 'overlay overlay--intro'), fin = el('section', 'overlay overlay--finale');
  const prog = el('nav', 'prog'), panel = el('aside', 'panel'), hint = el('p', 'hint mono');
  panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Трансляция');
  const detail = el('aside', 'detail'); detail.hidden = true; detail.setAttribute('role', 'dialog'); detail.setAttribute('aria-modal', 'false');
  const progBar = el('section', 'daybar');
  const aboutM = el('section', 'about-m'); root.append(header, intro, fin, prog, panel, detail, progBar, aboutM);
  const marks = [];

  function render() {
    content = C[L]; const h = content.hero, f = content.finale, u = content.ui;
    header.innerHTML = `<a class="brand" href="#" data-act="restart" aria-label="Сбер — Банкротство Дальний Восток: сначала"><img src="${import.meta.env.BASE_URL}sber.svg" alt="Сбер" height="24"><span>Bankruptcy Far East</span></a>
      <nav class="menu" aria-label="Main">${u.nav.map((t, i) => `<button class="link" data-nav="${NAV_STOPS[i]}">${t}</button>`).join('')}<button class="link only-m" data-act="skip">${u.skip}</button></nav>
      <div class="tools"><button class="burger" data-act="menu" aria-label="Меню" aria-expanded="false"><i></i><i></i></button><button class="link tools__skip" data-act="skip">${u.skip}</button>
      <span class="lang" role="group" aria-label="Language"><button class="link ${L === 'ru' ? 'cur' : ''}" data-lang="ru">RU</button><button class="link ${L === 'en' ? 'cur' : ''}" data-lang="en">EN</button></span></div>`;
    intro.innerHTML = `<div class="hero__text"><p class="kicker"><i></i>${h.subtitle}</p><h1>${h.title}</h1>
        <p class="when">${h.dates}</p><p class="meta">${h.venue}</p></div>
      <div class="hero__cta"><button class="btn btn--primary" data-act="join">${h.ctaParticipate}<span aria-hidden="true">→</span></button>
        <button class="btn btn--secondary" data-act="broadcast" aria-expanded="false">${h.ctaBroadcast}</button>
        <div class="live" hidden>${content.broadcastLinks.map((href, i) => `<a href="${href}" target="_blank" rel="noopener">${u.broadcast[i]}<span aria-hidden="true">↗</span></a>`).join('')}</div></div>`;
    fin.innerHTML = `<div class="fin__grid">
        <div class="fin__place"><p class="kicker">${L === 'ru' ? 'Место проведения' : 'Venue'}</p><p class="fin__addr">${f.addressPanel.join('<br>')}</p>
          <p class="links">${f.links.map(link).join(' · ')}</p></div>
        ${f.contacts.map((c) => `<div class="fin__c"><strong>${c.name}</strong><a href="mailto:${c.email}">${c.email}</a><span>${c.phone}</span><span class="dim">${c.address}</span></div>`).join('')}
        <div class="fin__act"><button class="btn btn--primary" data-act="join">${h.ctaParticipate}</button><button class="btn btn--tertiary" data-act="restart">${u.restart}</button></div>
      </div>
      <p class="foot dim">${f.partners.join(' · ')} · ${link(f.policy)} · ${f.copyright} · ${f.attribution}</p>`;
    aboutM.innerHTML = `<h2>${content.ui.nav[0]}</h2><p>${program.about.short}</p>`;
    hint.textContent = h.scrollHint;
    progBar.innerHTML = `<div class="seg" role="group" aria-label="День"><button class="link cur" data-day="1">29 июля</button><button class="link" data-day="2">30 июля</button></div>
      <p class="note">${program.note}* <a href="${program.presentations}" target="_blank" rel="noopener">Презентации спикеров</a></p>`;
    prog.setAttribute('aria-label', u.progress);
    prog.innerHTML = Array.from({ length: stopsCount }, (_, i) => `<button class="mark" data-nav="${i}" aria-label="${i}"><span></span></button>`).join('');
    marks.length = 0; marks.push(...prog.querySelectorAll('.mark'));
    panel.innerHTML = `<div class="panel__head"><h2>${u.broadcastTitle}</h2><button class="link" data-act="close">${u.close}</button></div>
      <ul>${content.broadcastLinks.map((href, i) => `<li><a href="${href}" target="_blank" rel="noopener">${u.broadcast[i]}</a></li>`).join('')}</ul>`;
    document.documentElement.lang = L;
  }
  render();
  root.append(hint);

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'), n = e.target.closest('[data-nav]'), g = e.target.closest('[data-lang]'), dd = e.target.closest('[data-day]');
    if (dd) { progBar.querySelectorAll('[data-day]').forEach((b) => b.classList.toggle('cur', b === dd)); onDay(Number(dd.dataset.day)); return; }
    if (g) { L = g.dataset.lang; render(); onLang(L); return; }
    if (n) { header.classList.remove('open'); onNav(Number(n.dataset.nav)); return; }
    if (!a) return;
    if (a.dataset.act === 'menu') { const o = header.classList.toggle('open'); a.setAttribute('aria-expanded', String(o)); return; }
    if (a.dataset.act === 'broadcast') { const live = intro.querySelector('.live'); live.hidden = !live.hidden; a.setAttribute('aria-expanded', String(!live.hidden)); if (!live.hidden) live.querySelector('a').focus(); return; }
    if (a.dataset.act === 'close') { panel.hidden = true; detail.hidden = true; return; }
    onAction(a.dataset.act);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { panel.hidden = true; detail.hidden = true; } });

  return {
    get lang() { return L; }, get content() { return content; },
    openPanel({ title, sub, body, html }) {
      detail.innerHTML = `<div class="detail__head"><div><p class="kicker">${sub ?? ''}</p><h2>${title}</h2></div><button class="link" data-act="close">${content.ui.close}</button></div>
        <div class="detail__body">${html ? body.join('') : body.map((t) => `<p>${t}</p>`).join('')}</div>`;
      detail.hidden = false; detail.querySelector('[data-act="close"]').focus();
    },
    update(active, P, touched, gate = 1) {
      aboutM.classList.toggle('on', active === 1 && P > 0.14 && P < 0.31);
      progBar.classList.toggle('on', active === 2 && P > 0.36 && P < 0.6);
      intro.classList.toggle('on', P < 0.06 && gate > 0.6);
      fin.classList.toggle('on', P > 0.95);
      marks.forEach((m, i) => m.classList.toggle('cur', i === active));
      hint.classList.toggle('gone', touched);
    },
  };
}
