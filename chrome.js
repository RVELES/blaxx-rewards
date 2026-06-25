/* ============================================================
   BlaXx · App shell (topnav + sidebar + mobile tabs)
   Injected on every page. Set <body data-screen="inicio">.
   ============================================================ */
(function () {
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 9h18"/><circle cx="17" cy="13.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8" cy="11" r="2"/><path d="M13 10h5M13 13.5h5M5 16h7"/></svg>',
    partners: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/><path d="M13.5 14.8c2.4-.4 4.5 1.2 4.5 4.2"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9C9 9 7 5 9.5 4.2 11 3.7 12 6.5 12 9c0-2.5 1-5.3 2.5-4.8C17 5 15 9 12 9Z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M14 7v10" stroke-dasharray="2 2.4"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
    coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v5c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7"/><path d="M9 14.6v2.8c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V11"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4 3.5 10.8c-.8.3-.8 1.5.1 1.7l6.4 1.6 1.6 6.4c.2.9 1.4.9 1.7.1L20 4Z"/><path d="m20 4-9.9 10.1"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20S4 14.5 4 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.2C20 14.5 12 20 12 20Z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4.3 3 7.2 7 9 4-1.8 7-4.7 7-9V6Z"/><path d="m9.2 12 2 2 3.6-3.8"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.4 2.4 0 0 1 4.6.9c0 1.6-2.2 1.8-2.2 3.3"/><circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.2H4.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>'
  };

  // canais sociais oficiais
  const INSTAGRAM_URL = 'https://instagram.com/blaxx.pontos';

  // primary sidebar nav  [label, href, iconKey, screenKey, badge]
  const PRIMARY = [
    ['Início', 'index.html', 'home', 'inicio'],
    ['Carteira', 'carteira.html', 'wallet', 'carteira'],
    ['Cartão Blaxx', 'cartao.html', 'card', 'cartao'],
    ['Extrato', 'extrato.html', 'chart', 'extrato'],
    ['Parceiros', 'parceiros.html', 'partners', 'parceiros'],
    ['Resgates', 'resgates.html', 'gift', 'resgates'],
    ['Meus resgates', 'resgates.html#meus', 'ticket', 'meus', '2'],
    ['Campanhas', 'campanhas.html', 'target', 'campanhas', 'NEW'],
    ['Comprar pontos', 'comprar.html', 'coins', 'comprar'],
    ['Enviar pontos', 'enviar.html', 'send', 'enviar'],
    ['Indique e ganhe', 'indique.html', 'heart', 'indique'],
  ];
  const SECONDARY = [
    ['Perfil', '#', 'user', 'perfil'],
    ['Segurança', '#', 'shield', 'seguranca'],
    ['Ajuda', '#', 'help', 'ajuda'],
  ];
  const TOPNAV = [
    ['Início', 'index.html', 'inicio'],
    ['Como funciona', '#', 'comofunciona'],
    ['Parceiros', 'parceiros.html', 'parceiros'],
    ['Resgates', 'resgates.html', 'resgates'],
    ['Comprar pontos', 'comprar.html', 'comprar'],
    ['Enviar pontos', 'enviar.html', 'enviar'],
  ];
  const MOBTABS = [
    ['Início', 'index.html', 'home', 'inicio'],
    ['Carteira', 'carteira.html', 'wallet', 'carteira'],
    ['Resgates', 'resgates.html', 'gift', 'resgates'],
    ['Comprar', 'comprar.html', 'coins', 'comprar'],
    ['Indique', 'indique.html', 'heart', 'indique'],
  ];

  // ---- favicon ----
  (function(){
    let l = document.querySelector('link[rel="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.type = 'image/svg+xml'; l.href = 'assets/favicon.svg';
  })();

  const screen = document.body.getAttribute('data-screen') || 'inicio';

  // Marca oficial BlaXx (B-mark geométrico + wordmark "BlaXx"), recriada inline
  // para herdar a fonte da página (Inter) e o verde neon #7CFF00 — paridade com
  // o BlaxxBrand do app web. Usada sobre superfície escura (topbar/rodapé do
  // app): "Bla" branco + "Xx" neon. Sem "Pontos".
  const brandMarkup = (uid) => `
    <svg class="brand__mark" width="28" height="28" viewBox="0 0 64 64" fill="none" aria-hidden="true" style="display:block;flex:0 0 auto;color:#7CFF00">
      <mask id="${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#000"/>
        <rect x="14" y="10" width="11" height="44" rx="2.5" fill="#fff"/>
        <path d="M14 10H33a11 11 0 0 1 0 22H14Z" fill="#fff"/>
        <path d="M14 31h21a11.5 11.5 0 0 1 0 23H14Z" fill="#fff"/>
        <rect x="25" y="16" width="12" height="10" rx="2.5" fill="#000"/>
        <rect x="25" y="36" width="13" height="12" rx="2.5" fill="#000"/>
      </mask>
      <rect width="64" height="64" fill="currentColor" mask="url(#${uid})"/>
    </svg>
    <span class="brand__txt" style="font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.03em;line-height:1;color:#fff">Bla<span style="color:#7CFF00">Xx</span></span>`;

  const navItem = (label, href, icoKey, key, badge) => `
    <a class="nav-item ${key === screen ? 'is-active' : ''}" href="${href}">
      <span class="ico">${I[icoKey]}</span>
      <span>${label}</span>
      ${badge ? `<span class="badge">${badge}</span>` : ''}
    </a>`;

  const sidebarInner = `
    <div class="profile-card">
      <div class="av">R</div>
      <div>
        <div class="profile-card__name">Ricardo Veles</div>
        <div class="profile-card__meta">PLANO PLUS · <b>32.480 pts</b></div>
      </div>
    </div>
    ${PRIMARY.map(n => navItem(...n)).join('')}
    <div class="nav-divider"></div>
    ${SECONDARY.map(n => navItem(...n)).join('')}
  `;

  // ---- topbar ----
  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <button class="menu-btn" id="menuBtn" aria-label="Menu">${I.menu}</button>
    <a class="brand" href="index.html" aria-label="BlaXx">
      ${brandMarkup('bxm-top')}
    </a>
    <nav class="topnav">
      ${TOPNAV.map(([l, h, k]) => `<a href="${h}" class="${k === screen ? 'is-active' : ''}">${l}</a>`).join('')}
    </nav>
    <div class="topbar__right">
      <button class="icon-btn" aria-label="Notificações">${I.bell}<span class="dot"></span></button>
      <a class="user-pill" href="#"><span class="av">R</span><span class="t">Olá, Ricardo</span></a>
    </div>`;

  // ---- shell ----
  const main = document.querySelector('main');
  const shell = document.createElement('div');
  shell.className = 'shell';
  const aside = document.createElement('aside');
  aside.className = 'sidebar';
  aside.innerHTML = `<div class="sidebar__sticky">${sidebarInner}</div>`;
  document.body.insertBefore(topbar, document.body.firstChild);
  main.parentNode.insertBefore(shell, main);
  shell.appendChild(aside);
  shell.appendChild(main);

  // ---- site footer ----
  const FCOLS = [
    ['Produto', [
      ['Como funciona', '#'], ['Parceiros', 'parceiros.html'], ['Resgates', 'resgates.html'],
      ['Comprar pontos', 'comprar.html'], ['Vender pontos', '#'], ['Campanhas', 'campanhas.html'],
    ]],
    ['Conta', [
      ['Entrar', '#'], ['Cadastre-se', '#'], ['Painel', 'index.html'],
      ['Carteira', 'carteira.html'], ['Extrato', 'extrato.html'], ['Indique e ganhe', 'indique.html'],
    ]],
    ['Suporte e Legal', [
      ['Central de ajuda', '#'], ['Perguntas frequentes', '#'], ['Regras de pontos', '#'],
      ['Política de reembolso', '#'], ['Termos de uso', '#'], ['Privacidade / LGPD', '#'],
      ['Abrir chamado', '#'], ['Mapa do site', '#'],
    ]],
  ];
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          <div class="footer-logo" aria-label="BlaXx" style="display:flex;align-items:center;gap:10px">${brandMarkup('bxm-foot')}</div>
          <p class="footer-desc">Programa de pontos, benefícios e relacionamento. Acumule, compre, envie e troque pontos por vantagens reais.</p>
          <a class="footer-social" href="${INSTAGRAM_URL}" target="_blank" rel="noopener" aria-label="Siga @blaxx.pontos no Instagram" style="display:inline-flex;align-items:center;gap:8px;margin-top:16px;color:inherit;text-decoration:none;font-size:13.5px;font-weight:600">
            <span class="ico" style="width:22px;height:22px;display:inline-flex">${I.instagram}</span>
            <span>@blaxx.pontos</span>
          </a>
        </div>
        ${FCOLS.map(([title, links]) => `
          <div class="footer-col">
            <h4>${title}</h4>
            ${links.map(([l, h]) => `<a href="${h}">${l}</a>`).join('')}
          </div>`).join('')}
      </div>
      <hr class="footer-rule">
      <div class="footer-bottom">
        <span class="footer-copy">© 2026 BlaXx. Todos os direitos reservados.</span>
        <span class="footer-disclaimer">Os pontos Blaxx não são moeda, depósito, investimento, valor mobiliário ou criptoativo. São créditos promocionais de uso restrito dentro da plataforma BlaXx.</span>
      </div>
    </div>`;
  document.body.insertBefore(footer, shell.nextSibling);

  // ---- mobile menu uses the drawer (no bottom tab bar) ----

  // ---- drawer (mobile full menu) ----
  const scrim = document.createElement('div');
  scrim.className = 'drawer-scrim';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.innerHTML = sidebarInner;
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
  const mb = document.getElementById('menuBtn');
  const close = () => { drawer.classList.remove('open'); scrim.classList.remove('open'); };
  if (mb) mb.addEventListener('click', () => { drawer.classList.add('open'); scrim.classList.add('open'); });
  scrim.addEventListener('click', close);

  // ---- animate progress bars in on load ----
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-w]').forEach(el => {
      const w = el.getAttribute('data-w');
      el.style.width = '0%';
      setTimeout(() => { el.style.width = w; }, 180);
    });
  });

  // ---- registra o service worker (PWA / instalável) ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }

  // ---- count-up for [data-count] (always lands on final value) ----
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.getAttribute('data-count'));
    const dec = el.getAttribute('data-dec') ? parseInt(el.getAttribute('data-dec')) : 0;
    const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    el.textContent = fmt(target);
    if (reduceMotion) return;
    const dur = 1100; const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);
    }
    requestAnimationFrame(tick);
  });
})();
