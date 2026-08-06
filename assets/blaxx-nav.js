/* blaxx-nav.js — gaveta de navegação no mobile.
 *
 * O BURACO QUE ISTO FECHA
 * -----------------------
 * As 49 páginas com `<header class="topbar">` inline escondem os links abaixo
 * de 880px (`.links { display: none }` em assets/styles.css) e **não colocam
 * nada no lugar**. No celular o usuário fica sem navegação alguma: só logo e
 * as ações da direita. O `chrome.js` e a landing têm gaveta; estas 49, não.
 *
 * Este módulo injeta o hamburger e a gaveta apenas onde falta — se a página já
 * tem uma (`.drawer`, `.bx-drawer`), sai sem tocar em nada.
 *
 * AGRUPAMENTO
 * -----------
 * Por intenção do usuário, não por tela: Conta · Pontos · Descobrir · Ajuda.
 * O menu de visitante é outro — oferecer "Carteira" a quem não entrou leva a
 * uma tela de sessão sem explicação.
 *
 * COMPORTAMENTO
 * -------------
 * Espelha a gaveta da landing, que é a boa: ESC fecha, clique no scrim fecha,
 * foco vai para o primeiro item ao abrir e volta ao hamburger ao fechar, body
 * trava o scroll, e a gaveta fecha sozinha ao passar para desktop (senão fica
 * presa aberta sobre o conteúdo, com o scroll do body travado).
 */
(function () {
  'use strict';

  var LARGURA_DESKTOP = 880;   // igual ao breakpoint que esconde .links
  var ID_GAVETA = 'bxNavDrawer';

  var MENU_LOGADO = [
    ['Conta', [
      ['Início', 'dashboard.html'],
      ['Carteira', 'carteira.html'],
      ['Extrato', 'extrato.html'],
      ['Cartão BlaXx', 'cartao.html'],
      ['Perfil', 'perfil.html'],
    ]],
    ['Pontos', [
      ['Comprar pontos', 'comprar.html'],
      ['Enviar pontos', 'enviar.html'],
      ['Resgatar em dinheiro', 'resgates.html'],
      ['Indique e ganhe', 'indique.html'],
    ]],
    ['Descobrir', [
      ['Parceiros', 'parceiros.html'],
      ['Campanhas', 'campanhas.html'],
    ]],
    ['Ajuda', [
      ['Central de ajuda', 'central-ajuda.html'],
      ['Perguntas frequentes', 'faq.html'],
      ['Abrir chamado', 'abrir-chamado.html'],
    ]],
  ];

  var MENU_VISITANTE = [
    ['Conheça', [
      ['Como funciona', 'como-funciona.html'],
      ['Parceiros', 'parceiros.html'],
      ['Regulamento', 'regulamento.html'],
    ]],
    ['Ajuda', [
      ['Central de ajuda', 'central-ajuda.html'],
      ['Perguntas frequentes', 'faq.html'],
      ['Fale conosco', 'contato.html'],
    ]],
  ];

  function usuario() {
    // Fonte única: o blaxx-nav-user.js já lê os dois formatos de sessão.
    if (window.BlaxxNavUser && window.BlaxxNavUser.usuario) {
      return window.BlaxxNavUser.usuario();
    }
    return null;
  }

  // --------------------------------------------------------------------- //
  // Logado não sai do app sem clicar em Sair                               //
  // --------------------------------------------------------------------- //
  // `index.html` é a Início da área logada no código, mas em produção o
  // netlify.toml faz /index.html → 301 → / , e / serve a landing de marketing
  // (blaxx-neon.html). Resultado: 5 pontos do chrome.js e 21 páginas inline
  // levavam o usuário LOGADO para fora do app — inclusive o clique no logo.
  //
  // A reescrita é feita em runtime, e não trocando o href no HTML, porque o
  // destino correto depende da sessão: para quem NÃO entrou, ir para a landing
  // é o comportamento certo. Só quem tem sessão é preso no app.
  var HOME_LOGADA = 'dashboard.html';

  function ehSaidaDoApp(a) {
    var href = a.getAttribute('href') || '';
    if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) return false;
    try {
      var url = new URL(href, location.href);
      if (url.origin !== location.origin) return false;
      var caminho = url.pathname.replace(/\/+$/, '');
      return caminho === '' || /\/index\.html$/i.test(url.pathname);
    } catch (e) {
      return false;
    }
  }

  function prenderNoApp() {
    var trocados = 0;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (ehSaidaDoApp(links[i])) { links[i].setAttribute('href', HOME_LOGADA); trocados++; }
    }
    return trocados;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function montarMenu(u) {
    var grupos = u ? MENU_LOGADO : MENU_VISITANTE;
    var atual = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var html = '';
    grupos.forEach(function (g) {
      html += '<p class="bxnav-grupo">' + esc(g[0]) + '</p>';
      g[1].forEach(function (item) {
        var ativo = item[1].toLowerCase() === atual ? ' aria-current="page"' : '';
        html += '<a href="' + esc(item[1]) + '"' + ativo + '>' + esc(item[0]) + '</a>';
      });
    });
    html += u
      ? '<a class="bxnav-cta" href="#" data-bxnav-sair>Sair</a>'
      : '<a class="bxnav-cta" href="login.html">Entrar</a>' +
        '<a class="bxnav-cta bxnav-cta--vazado" href="cadastro.html">Criar conta</a>';
    return html;
  }

  // --------------------------------------------------------------------- //
  // Rodapé de 4 colunas                                                    //
  // --------------------------------------------------------------------- //
  // Estrutura e itens espelham o rodapé da Dotz, item a item, por decisão do
  // produto (03/08). Onde a BlaXx já faz o que o item descreve, o link vai
  // para a página real; onde não faz, vai para `em-breve.html?r=<slug>`, que
  // explica o que é e diz com todas as letras que não existe hoje.
  //
  // Consequência registrada: a taxonomia da Dotz não tem "comprar pontos",
  // "enviar pontos" nem "resgatar em dinheiro" — que são o núcleo da BlaXx.
  // Eles continuam alcançáveis pela gaveta e pelo menu, não pelo rodapé.
  var EB = 'em-breve.html?r=';
  var RODAPE = [
    ['Conheça a BlaXx', [
      ['Conta BlaXx', 'perfil.html'],
      ['Como funciona', 'como-funciona.html'],
      ['Como resgatar pontos', 'regras-pontos.html'],
      ['Plataforma', EB + 'plataforma'],
      ['Cadastre-se', 'cadastro.html'],
      ['Fale conosco', 'contato.html'],
    ]],
    ['Ganhe mais pontos', [
      ['Ganhe em lojas online', EB + 'lojas-online'],
      ['Ganhe com nossos parceiros', 'parceiros.html'],
      ['Ganhe com cartões de crédito', EB + 'cartoes'],
      ['Ganhe com bancos parceiros', EB + 'bancos'],
      ['Ganhe em lojas físicas', EB + 'lojas-fisicas'],
      ['Cashback BlaXx', EB + 'cashback'],
      ['Lembrete de cupons', EB + 'cupons'],
      ['Programa BlaXx+', EB + 'programa'],
    ]],
    ['Use seus pontos', [
      ['Com produtos', EB + 'produtos'],
      ['Com viagens', EB + 'viagens'],
      ['Com pagamento de contas', EB + 'contas'],
    ]],
    ['Institucional', [
      ['Relação com investidores', EB + 'investidores'],
      ['Trabalhe conosco', EB + 'trabalhe'],
      ['Seja um parceiro', 'contato.html'],
      ['Empréstimo pessoal', EB + 'emprestimo'],
    ]],
  ];

  function montarRodape() {
    var pe = document.querySelector('footer.footer');
    if (!pe || pe.getAttribute('data-bxnav')) return false;

    var html =
      '<div class="footer-inner">' +
        '<div>' +
          '<div class="brand"><span class="mark">BlaXx</span></div>' +
          '<p class="about">Compre pontos, envie para quem quiser e resgate em ' +
          'dinheiro de verdade, direto na sua conta via PIX.</p>' +
        '</div>';
    RODAPE.forEach(function (col) {
      html += '<div><h4>' + esc(col[0]) + '</h4><ul>';
      col[1].forEach(function (it) {
        html += '<li><a href="' + esc(it[1]) + '">' + esc(it[0]) + '</a></li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
    pe.innerHTML = html;
    pe.setAttribute('data-bxnav', '1');
    return true;
  }

  function sair() {
    try {
      ['blaxx_session', 'blaxx_token', 'blaxx_user', 'blaxx_refresh'].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {}
    location.href = 'login.html';
  }

  // Lado da gaveta: ESQUERDA logado, DIREITA visitante. Antes cada sistema
  // decidia sozinho — chrome.js abria à esquerda, blaxx-app.js e esta à
  // direita — então a mesma área logada abria de um lado ou do outro conforme
  // a página. A marcação vai no <html> para que valha também para a gaveta do
  // chrome.js, que não é construída aqui.
  function marcarLado(u) {
    var raiz = document.documentElement;
    raiz.classList.toggle('bx-gaveta-esq', !!u);
    raiz.classList.toggle('bx-gaveta-dir', !u);
  }

  function iniciar() {
    // Qualquer barra serve para marcar lado e prender no app. O chrome.js monta
    // `<div class="topbar">` SEM `.nav` dentro — exigir `.nav` aqui deixava as
    // 23 páginas dele de fora justamente da regra de lado, que é onde a
    // inconsistência aparecia.
    var barra = document.querySelector('.topbar');
    if (!barra) return;

    var u = usuario();

    // Vale para TODA página com barra, inclusive as que já têm gaveta própria:
    // o lado e a prisão no app não dependem de quem construiu o menu.
    marcarLado(u);
    montarRodape();
    // DEPOIS do rodapé: ele acabou de inserir links, e alguns (Conta BlaXx,
    // Cadastre-se) sairiam do app para quem já está logado.
    if (u) prenderNoApp();

    // `.drawer` cobre chrome.js e a landing, que têm gaveta própria e menu
    // próprio — ali não se constrói outra. O `.bx-drawer` do blaxx-app.js NÃO
    // entra nesta lista de propósito: ele cede a nós (ver installHamburgerMenu),
    // para que as 49 páginas inline tenham UMA gaveta só, e a mesma.
    if (document.querySelector('.drawer, #' + ID_GAVETA)) return;

    // Construir a gaveta exige a topbar INLINE (`.topbar .nav`), que é a que
    // não tem menu mobile. A do chrome.js já tem a sua.
    var nav = document.querySelector('.topbar .nav');
    if (!nav) return;
    if (nav.querySelector('.bx-hamburger')) return;   // corrida: ele chegou antes

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'bxnav-burger';
    botao.setAttribute('aria-label', 'Abrir menu');
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-controls', ID_GAVETA);
    botao.innerHTML = '<span></span><span></span><span></span>';

    // DENTRO do .cta-row, não como irmão: no mobile o .nav vira grid
    // (`1fr auto`) e um filho direto sem coluna atribuída é auto-posicionado e
    // esticado — o botão saía com 143px de largura em vez de 44. Como item
    // flex do .cta-row ele respeita o próprio tamanho e fica junto das demais
    // ações, que é onde o usuário procura.
    var cta = nav.querySelector('.cta-row');
    if (cta) cta.insertBefore(botao, cta.firstChild);
    else nav.appendChild(botao);

    var scrim = document.createElement('div');
    scrim.className = 'bxnav-scrim';

    var gaveta = document.createElement('aside');
    gaveta.id = ID_GAVETA;
    gaveta.className = 'bxnav-drawer';
    gaveta.setAttribute('role', 'dialog');
    gaveta.setAttribute('aria-modal', 'true');
    gaveta.setAttribute('aria-label', 'Menu de navegação');
    gaveta.hidden = true;
    gaveta.innerHTML =
      '<button type="button" class="bxnav-fechar" aria-label="Fechar menu">&times;</button>' +
      montarMenu(u);

    document.body.appendChild(scrim);
    document.body.appendChild(gaveta);

    function alternar(abrir) {
      if (abrir) {
        gaveta.hidden = false;
        // Reflow forçado em vez de requestAnimationFrame: rAF é suspenso em
        // aba oculta, e ali a classe nunca era aplicada — a gaveta ficava
        // `hidden=false` porém fora da tela, sem foco e sem como fechar pelo
        // scrim. Ler offsetWidth obriga o layout a assentar, o que faz a
        // transição rodar, e é síncrono.
        void gaveta.offsetWidth;
        gaveta.classList.add('aberta');
      } else {
        gaveta.classList.remove('aberta');
        setTimeout(function () { gaveta.hidden = true; }, 200);
      }
      scrim.classList.toggle('on', !!abrir);
      botao.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      // Sem isto o conteúdo atrás rola junto com a gaveta aberta.
      document.body.style.overflow = abrir ? 'hidden' : '';
      if (abrir) {
        // setTimeout(0), não rAF: o clique devolve o foco ao próprio botão
        // depois do handler, então focar de forma síncrona aqui é desfeito e o
        // teclado fica preso fora de um diálogo aria-modal. A macrotarefa roda
        // depois disso — e, ao contrário do rAF, roda também em aba oculta.
        setTimeout(function () {
          var primeiro = gaveta.querySelector('a, button');
          if (primeiro) primeiro.focus();
        }, 0);
      } else {
        botao.focus();
      }
    }

    botao.addEventListener('click', function () { alternar(gaveta.hidden); });
    scrim.addEventListener('click', function () { alternar(false); });
    gaveta.querySelector('.bxnav-fechar').addEventListener('click', function () { alternar(false); });

    gaveta.addEventListener('click', function (ev) {
      var alvo = ev.target.closest('[data-bxnav-sair]');
      if (alvo) { ev.preventDefault(); sair(); }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !gaveta.hidden) alternar(false);
      if (ev.key !== 'Tab' || gaveta.hidden) return;
      // Trava de foco: sem ela o Tab sai da gaveta e navega o conteúdo de trás,
      // que está visualmente coberto pelo scrim.
      var focaveis = gaveta.querySelectorAll('a[href], button:not([disabled])');
      if (!focaveis.length) return;
      var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (ev.shiftKey && document.activeElement === primeiro) {
        ev.preventDefault(); ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault(); primeiro.focus();
      }
    });

    window.addEventListener('resize', function () {
      // No desktop os links horizontais reaparecem e a gaveta perde o sentido —
      // deixá-la aberta prenderia o scroll do body sobre o conteúdo.
      if (window.innerWidth > LARGURA_DESKTOP && !gaveta.hidden) alternar(false);
    });
  }

  // Definido no parse, ANTES de qualquer DOMContentLoaded: é assim que o
  // blaxx-app.js sabe que deve ceder, independente da ordem das tags <script>.
  window.BlaxxNav = { iniciar: iniciar };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
