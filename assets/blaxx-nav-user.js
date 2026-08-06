/* blaxx-nav-user.js — normaliza o lado direito da navegação.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * O PWA tem DOIS sistemas de navegação que não se conversam:
 *
 *   A) `chrome.js` injeta `.topbar > .topbar__right` em 23 páginas — com sino
 *      em SVG e uma `.user-pill` cujo avatar e nome estavam **hardcoded**
 *      ("R" / "Olá, Ricardo").
 *   B) 48 páginas trazem `<header class="topbar"><nav class="nav">` copiada
 *      inline, com sino em **emoji** 🔔 e um botão de texto igualmente
 *      hardcoded ("Olá, Mariana").
 *
 * Este módulo é o único lugar que decide o que aparece à direita, nos dois
 * casos: **sino + inicial do nome do usuário logado**. No mobile, o nome vira
 * só a inicial num círculo; o sino continua visível (a CSS escondia ele).
 *
 * Sem sessão, não inventa usuário: páginas públicas mantêm "Entrar/Cadastre-se".
 */
(function () {
  'use strict';

  function usuario() {
    // Mesma leitura dual do resto do app: blaxx_user (formato do STORE) com
    // fallback para blaxx_session (formato gravado pelo login.html).
    try {
      var u = JSON.parse(localStorage.getItem('blaxx_user') || 'null');
      if (u && (u.name || u.email)) return u;
    } catch (e) {}
    try {
      var s = JSON.parse(localStorage.getItem('blaxx_session') || 'null');
      if (s && s.user && (s.user.name || s.user.email)) return s.user;
    } catch (e) {}
    return null;
  }

  function primeiroNome(u) {
    var n = ((u && u.name) || '').trim();
    if (n) return n.split(/\s+/)[0];
    var e = ((u && u.email) || '').trim();
    return e ? e.split('@')[0] : '';
  }

  function inicial(u) {
    var n = primeiroNome(u);
    // codePointAt + fromCodePoint preserva acento e não quebra caractere
    // fora do BMP (nome com emoji não vira "�").
    return n ? String.fromCodePoint(n.codePointAt(0)).toUpperCase() : '?';
  }

  function marcarSino(el) {
    if (!el) return;
    el.classList.add('nav-bell');
    el.setAttribute('aria-label', 'Notificações');
    if (!el.getAttribute('title')) el.setAttribute('title', 'Notificações');
  }

  // ---- Sistema A: .topbar__right, montado pelo chrome.js -------------------
  function aplicarTopbarRight(raiz, u) {
    marcarSino(raiz.querySelector('.icon-btn'));

    var pill = raiz.querySelector('.user-pill');
    if (!pill) return;

    if (!u) {                       // sem sessão: não exibe usuário nenhum
      pill.style.display = 'none';
      return;
    }
    pill.style.display = '';
    pill.setAttribute('href', 'perfil.html');

    var av = pill.querySelector('.av, .avatar');
    if (!av) {
      av = document.createElement('span');
      av.className = 'av';
      pill.insertBefore(av, pill.firstChild);
    }
    av.textContent = inicial(u);
    av.classList.add('nav-av');

    var txt = pill.querySelector('.t');
    if (txt) txt.textContent = 'Olá, ' + primeiroNome(u);
    pill.setAttribute('aria-label', 'Perfil de ' + primeiroNome(u));
  }

  // ---- Sistema B: .cta-row inline ----------------------------------------
  function aplicarCtaRow(raiz, u) {
    // Detecção por CLASSE primeiro: o HTML já traz `.nav-bell`/`.nav-user`, e
    // o anchor do usuário nasce VAZIO (o nome fixo saiu do markup). Procurar
    // pelo texto "Olá," como critério principal deixaria de achar justamente
    // as páginas já migradas. O fallback por texto/emoji cobre qualquer página
    // que ainda não tenha as classes.
    var sino = raiz.querySelector('.nav-bell');
    var saudacao = raiz.querySelector('.nav-user');

    if (!sino || !saudacao) {
      var botoes = raiz.querySelectorAll('.button');
      for (var i = 0; i < botoes.length; i++) {
        var b = botoes[i];
        var rotulo = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
        if (!sino && (/notifica/i.test(rotulo) || /🔔/.test(b.textContent || ''))) { sino = b; continue; }
        if (!saudacao && /^\s*olá[,\s]/i.test(b.textContent || '')) saudacao = b;
      }
    }

    if (sino) {
      marcarSino(sino);
      // O emoji 🔔 renderiza diferente em cada plataforma e não herda a cor da
      // marca. Trocado pelo mesmo traçado SVG que o chrome.js usa, para os dois
      // sistemas ficarem idênticos.
      if (/🔔/.test(sino.textContent || '')) {
        sino.textContent = '';
        sino.insertAdjacentHTML('beforeend',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.2H4.5Z"/>' +
          '<path d="M10 19a2 2 0 0 0 4 0"/></svg>');
      }
    }

    if (!saudacao) return;
    if (!u) { saudacao.style.display = 'none'; return; }

    // Estrutura final: [inicial no círculo][nome — some no mobile via CSS]
    saudacao.textContent = '';
    saudacao.classList.add('nav-user');
    saudacao.setAttribute('href', 'perfil.html');
    saudacao.setAttribute('aria-label', 'Perfil de ' + primeiroNome(u));

    var av = document.createElement('span');
    av.className = 'nav-av';
    av.textContent = inicial(u);
    av.setAttribute('aria-hidden', 'true');

    var nome = document.createElement('span');
    nome.className = 'nav-user__nome';
    nome.textContent = 'Olá, ' + primeiroNome(u);

    saudacao.appendChild(av);
    saudacao.appendChild(nome);
  }

  // Saudações no corpo da página (ex.: o kicker "Olá, X 👋" do dashboard).
  // Mesmo princípio da nav: o nome sai da sessão, nunca do HTML.
  function aplicarSaudacoes(u) {
    var alvos = document.querySelectorAll('[data-nav-saudacao]');
    for (var i = 0; i < alvos.length; i++) {
      if (!u) { alvos[i].style.display = 'none'; continue; }
      alvos[i].style.display = '';
      alvos[i].textContent = 'Olá, ' + primeiroNome(u) + ' 👋';
    }
  }

  function aplicar() {
    var u = usuario();
    var direita = document.querySelector('.topbar__right');
    if (direita) aplicarTopbarRight(direita, u);
    var cta = document.querySelector('.topbar .cta-row, .nav .cta-row');
    if (cta) aplicarCtaRow(cta, u);
    aplicarSaudacoes(u);
  }

  // O chrome.js injeta a topbar depois; ele chama aplicar() ao terminar.
  // `usuario`/`primeiroNome` saem daqui para o blaxx-nav.js (gaveta mobile)
  // reusar a MESMA leitura de sessão. Duplicar esse trecho é exatamente como
  // as duas camadas de API do projeto divergiram no tratamento de 401.
  window.BlaxxNavUser = {
    aplicar: aplicar,
    usuario: usuario,
    primeiroNome: primeiroNome,
    inicial: inicial,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar);
  } else {
    aplicar();
  }
})();
