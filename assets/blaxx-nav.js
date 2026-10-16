/* blaxx-nav.js, gaveta de navegação no mobile e chrome "Embarque" (barra
 * utilitária, mega-menus, busca e rodapé-recibo; ver montarChromeEmbarque).
 *
 * O BURACO QUE ISTO FECHA
 * -----------------------
 * As 49 páginas com `<header class="topbar">` inline escondem os links abaixo
 * de 880px (`.links { display: none }` em assets/styles.css) e **não colocam
 * nada no lugar**. No celular o usuário fica sem navegação alguma: só logo e
 * as ações da direita. O `chrome.js` e a landing têm gaveta; estas 49, não.
 *
 * Este módulo injeta o hamburger e a gaveta apenas onde falta, se a página já
 * tem uma (`.drawer`, `.bx-drawer`), sai sem tocar em nada.
 *
 * AGRUPAMENTO
 * -----------
 * Por intenção do usuário, não por tela: Conta · Pontos · Descobrir · Ajuda.
 * O menu de visitante é outro, oferecer "Carteira" a quem não entrou leva a
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
      ['Resgatar benefícios', 'resgates.html'],
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
  // levavam o usuário LOGADO para fora do app, inclusive o clique no logo.
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

  // Em produção o Netlify reescreve os links para URL limpa ("login.html" vira
  // "/login") e serve "/carteira" no lugar de "/carteira.html". Toda comparação
  // de destino passa por aqui; comparar o href cru duplicou "Entrar / Criar
  // conta" na home publicada (16/10).
  function pagina(href) {
    var h = String(href || '').split(/[?#]/)[0].split('/').pop().toLowerCase();
    if (!h) return 'index.html';
    return /\.[a-z0-9]+$/.test(h) ? h : h + '.html';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function montarMenu(u) {
    var grupos = u ? MENU_LOGADO : MENU_VISITANTE;
    var atual = pagina(location.pathname);
    var html = '';
    grupos.forEach(function (g) {
      html += '<p class="bxnav-grupo">' + esc(g[0]) + '</p>';
      g[1].forEach(function (item) {
        var ativo = pagina(item[1]) === atual ? ' aria-current="page"' : '';
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
  // Chrome "Embarque" (design 3a, 14/10/2026)                              //
  // --------------------------------------------------------------------- //
  // Barra utilitária preta, barra de navegação clara com mega-menus, busca
  // e rodapé em forma de recibo. Montado aqui, e não no HTML das páginas,
  // pelo mesmo motivo da gaveta: são 73 páginas em dois sistemas de chrome
  // (topbar inline e chrome.js), e um lugar só é a única forma de os dois
  // ficarem iguais. A folha é assets/blaxx-embarque.css.
  //
  // O que o mock trazia e NÃO entra, de propósito: "1 PT = R$ 0,09 · FIXO",
  // "TAXA R$ 0,00" e "esse número não muda" (removidos da UI no commit
  // b7b8dcd, 15/09); "42 destinos", Miami/Dubai/Tóquio e voos "BX 101" (a
  // rede real são as 12 cidades de BLAXX_POINTS, em 3 verticais). Os slots
  // ficam; o texto é o que a plataforma faz de verdade.
  var FOLHA_EMBARQUE = 'assets/blaxx-embarque.css';
  var CIDADES_NA_REDE = 2;    // São Paulo e Rio de Janeiro, as cidades com parceiros no mapa (home-embarque.html)

  // Pacotes: os literais são o fallback (iguais ao config.py do backend);
  // /pix/packages atualiza quando responde.
  var PACOTES = {
    start: { nome: 'Start', pts: 2000,  preco: 180,  obs: 'cartão ou transferência' },
    plus:  { nome: 'Plus ★', pts: 5500, preco: 470,  obs: 'cerca de 5% de bônus' },
    prime: { nome: 'Prime', pts: 12000, preco: 972,  obs: 'cerca de 10% de bônus' }
  };
  function fmtPts(n){ return Number(n).toLocaleString('pt-BR'); }
  function fmtBrl(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  var UTIL = {
    esq: [
      ['on', '● ' + CIDADES_NA_REDE + ' cidades na rede'],
      ['',   '✳ Benefícios em parceiros selecionados'],
      ['',   'Sem mensalidade']
    ],
    dir: [
      ['Segurança', 'seguranca.html'],
      ['Central de ajuda', 'central-ajuda.html']
    ]
  };

  // Itens da barra para quem NÃO entrou (o mock). Quem entrou mantém os
  // links da própria página; os mega-menus se prendem a eles pelo href.
  var NAV_VISITANTE = [
    ['Comprar pontos', 'comprar-pontos.html', 'comprar'],
    ['Parceiros', 'parceiros.html', 'parceiros'],
    ['Como funciona', 'como-funciona.html', null],
    ['Ajuda', 'central-ajuda.html', 'ajuda']
  ];
  // href → chave do mega-menu (cobre as duplicatas que o site tem)
  var MEGA_POR_HREF = {
    'comprar-pontos.html': 'comprar', 'comprar.html': 'comprar', 'comprar-livre.html': 'comprar',
    'parceiros.html': 'parceiros',
    'central-ajuda.html': 'ajuda', 'ajuda.html': 'ajuda', 'faq.html': 'ajuda'
  };

  function megaDados(u) {
    var p = PACOTES;
    return {
      comprar: {
        cols: [
          ['PACOTES', [
            [p.start.nome + ' · ' + fmtPts(p.start.pts) + ' pts', fmtBrl(p.start.preco) + ' · ' + p.start.obs, 'comprar-pontos.html', 'start'],
            [p.plus.nome  + ' · ' + fmtPts(p.plus.pts)  + ' pts', fmtBrl(p.plus.preco)  + ' · ' + p.plus.obs,  'comprar-pontos.html', 'plus'],
            [p.prime.nome + ' · ' + fmtPts(p.prime.pts) + ' pts', fmtBrl(p.prime.preco) + ' · ' + p.prime.obs, 'comprar-pontos.html', 'prime']
          ]],
          ['OUTRAS FORMAS', [
            ['Valor livre', 'Escolha quanto quer comprar', 'comprar-livre.html'],
            ['Enviar pontos', 'Mande para quem quiser', u ? 'enviar.html' : 'como-funciona.html'],
            ['Resgatar benefícios', 'Troque pontos por vantagens', u ? 'resgates.html' : 'regras-pontos.html']
          ]]
        ],
        destaque: { tipo: 'neon', rotulo: 'MAIS ESCOLHIDO', num: fmtPts(p.plus.pts), un: 'pts',
                    txt: p.plus.nome + ' · ' + fmtBrl(p.plus.preco) + ' · ' + p.plus.obs,
                    ir: 'Comprar →', href: 'comprar-pontos.html', canhoto: 'EMBARCAR' }
      },
      parceiros: {
        cols: [
          ['CATEGORIAS', [
            ['Postos', 'Combustível e conveniência', 'parceiros.html?q=postos'],
            ['Supermercados', 'Compras do dia a dia', 'parceiros.html?q=supermercado'],
            ['Farmácias', 'Saúde e cuidado', 'parceiros.html?q=farm%C3%A1cia']
          ]],
          ['REDE', [
            ['Mapa da rede', CIDADES_NA_REDE + ' cidades com parceiros', 'home-embarque.html#mapa'],
            ['Todos os parceiros', 'Lista completa por cidade', 'parceiros.html'],
            ['Seja parceiro', 'Leve sua marca para a rede', 'contato.html']
          ]]
        ],
        destaque: { tipo: 'painel', rotulo: 'PAINEL DE PARTIDAS',
                    linhas: ['SÃO PAULO', 'RIO DE JANEIRO'],
                    ir: CIDADES_NA_REDE + ' cidades · ver mapa →', href: 'home-embarque.html#mapa' }
      },
      ajuda: {
        cols: [
          ['COMEÇAR', [
            ['Como funciona', 'Compre, envie e troque', 'como-funciona.html'],
            ['Regulamento do programa', 'As regras, por extenso', 'regulamento.html'],
            ['Segurança', 'Como protegemos sua conta', 'seguranca.html']
          ]],
          ['SUPORTE', [
            ['Central de ajuda', 'Perguntas frequentes', 'central-ajuda.html'],
            ['Falar com a gente', u ? 'Abra um chamado' : 'Fale com a equipe', u ? 'abrir-chamado.html' : 'contato.html'],
            ['Privacidade e LGPD', 'Seus direitos e dados', 'privacidade.html']
          ]]
        ],
        // "até 1 dia útil" é o prazo que contato, central-ajuda e abrir-chamado
        // já prometem; o mock dizia "24h", que ninguém promete.
        destaque: { tipo: 'recibo', linhas: [['ATENDIMENTO', 'por chamado'], ['RESPOSTA', 'até 1 dia útil'], ['CUSTO', 'nenhum']],
                    ir: (u ? 'Abrir chamado' : 'Falar com a gente') + ' →', href: u ? 'abrir-chamado.html' : 'contato.html' }
      }
    };
  }

  // Rodapé: só o que existe. O rodapé anterior espelhava a Dotz item a item
  // (decisão de 03/08) e mandava metade dos links para em-breve.html; o design
  // 3a tem três colunas curtas e todas apontam para páginas reais.
  var RODAPE = [
    ['PRODUTO', [
      ['Comprar pontos', 'comprar-pontos.html'],
      ['Parceiros', 'parceiros.html'],
      ['Enviar pontos', 'enviar-pontos.html'],
      ['Resgatar benefícios', 'resgates.html']
    ]],
    ['AJUDA', [
      ['Como funciona', 'como-funciona.html'],
      ['Central de ajuda', 'central-ajuda.html'],
      ['Falar com a gente', 'contato.html'],
      ['Segurança', 'seguranca.html']
    ]],
    ['LEGAL', [
      ['Termos de uso', 'documentos-termos.html'],
      ['Privacidade', 'privacidade.html'],
      ['Regulamento do programa', 'regulamento.html'],
      ['Mapa do site', 'sitemap.html']
    ]]
  ];

  function montarRodape() {
    // O chrome.js monta o seu footer.site-footer DEPOIS de chamar iniciar();
    // se este módulo criasse um footer antes, a página acabava com dois
    // rodapés-recibo (medido em 7 páginas em 15/10). Onde o chrome.js existe,
    // espera-se por ele; e um footer criado aqui que depois ganhe companhia é
    // removido.
    var temChrome = !!document.querySelector('script[src$="chrome.js"]');
    var criado = document.querySelector('footer.footer[data-bx-criado]');
    var doChrome = document.querySelector('footer.site-footer');
    if (criado && doChrome) { criado.remove(); criado = null; }
    var pe = document.querySelector('footer.footer, footer.site-footer');
    // Página com barra e sem <footer> (comprar-livre, em-breve) ficava sem
    // rodapé; o rodapé é parte do chrome, então ele nasce aqui quando falta.
    if (!pe && !temChrome && document.querySelector('.topbar')) {
      pe = document.createElement('footer'); pe.className = 'footer';
      pe.setAttribute('data-bx-criado', '1');
      document.body.appendChild(pe);
    }
    if (!pe || pe.getAttribute('data-bxnav')) return false;

    var html = '<div class="bx-foot"><div class="bx-zig"></div><div class="bx-foot-corpo">' +
      '<div class="bx-foot-marca">' +
        '<a href="index.html" aria-label="BlaXx Pontos"><img src="assets/marca/blaxx-logo-completo-justo.svg" alt="BlaXx Rewards"></a>'   /* rodapé: logo completo (pedido de 16/10); a barra fica com o B */ +
        '<p>Um programa de recompensas simples: compre pontos, envie para quem quiser ' +
        'e troque por benefícios em parceiros selecionados. Sem letra miúda.</p>' +
      '</div>';
    RODAPE.forEach(function (col) {
      html += '<div class="bx-foot-col"><h4>' + esc(col[0]) + '</h4>';
      col[1].forEach(function (it) {
        html += '<a href="' + esc(it[1]) + '">' + esc(it[0]) + '</a>';
      });
      html += '</div>';
    });
    html += '</div><div class="bx-foot-base">' +
      '<span>© 2026 BlaXx Pontos</span>' +
      '<span class="bx-barcode" aria-hidden="true"></span>' +
      '<span class="bx-foot-aviso">Os pontos BlaXx não são moeda, depósito, investimento, valor mobiliário ' +
      'ou criptoativo. São créditos promocionais de uso restrito dentro da plataforma BlaXx.</span>' +
      '</div><div class="bx-zig bx-zig--baixo"></div></div>';
    pe.innerHTML = html;
    pe.setAttribute('data-bxnav', '1');
    return true;
  }

  // A folha do tema precisa estar no <link> de cada página (sem piscar). Isto
  // é a rede de segurança para a página que ficou de fora.
  function garantirFolha() {
    if (document.querySelector('link[href$="' + FOLHA_EMBARQUE + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FOLHA_EMBARQUE;
    document.head.appendChild(l);
  }

  function montarUtil(barra) {
    if (document.querySelector('.bx-util')) return;
    var el = document.createElement('div');
    el.className = 'bx-util';
    var html = '<div class="bx-util-in"><div class="bx-util-grupo">';
    UTIL.esq.forEach(function (it) { html += '<span class="' + it[0] + '">' + esc(it[1]) + '</span>'; });
    html += '</div><div class="bx-util-grupo">';
    UTIL.dir.forEach(function (it) { html += '<a href="' + esc(it[1]) + '">' + esc(it[0]) + '</a>'; });
    html += '<span lang="pt-BR">PT-BR</span></div></div>';
    el.innerHTML = html;
    barra.parentNode.insertBefore(el, barra);
  }

  // chrome.js monta a topbar com filhos diretos em flex; para a barra
  // nascer com a mesma anatomia do topbar inline, os filhos vão para um
  // contêiner único.
  function envolverTopo(barra) {
    if (barra.querySelector('.nav, .bx-topo')) return barra.querySelector('.nav, .bx-topo');
    var topo = document.createElement('div');
    topo.className = 'bx-topo';
    while (barra.firstChild) topo.appendChild(barra.firstChild);
    barra.appendChild(topo);
    return topo;
  }

  // Na barra preta a marca é só o B característico (pedido de 16/10), na
  // variante de fundo escuro; qualquer wordmark que a página traga vira o B.
  function normalizarMarca(barra) {
    barra.querySelectorAll('img[src*="blaxx-wordmark"]').forEach(function (img) {
      img.src = img.src.replace(/blaxx-wordmark(-claro(-neon)?)?\.svg/, 'blaxx-simbolo-b.svg');
      img.alt = 'BlaXx';
    });
  }

  function montarNavVisitante(topo) {
    var links = topo.querySelector('.links, .topnav');
    if (!links) return;
    var atual = pagina(location.pathname);
    var html = '';
    NAV_VISITANTE.forEach(function (it) {
      var ativo = pagina(it[1]) === atual ? ' aria-current="page"' : '';
      html += '<a href="' + esc(it[1]) + '"' + ativo + '>' + esc(it[0]) + '</a>';
    });
    links.innerHTML = html;
  }

  function montarAcoesVisitante(topo) {
    var dir = topo.querySelector('.cta-row, .topbar__right');
    if (!dir) return;
    var jaTem = [].some.call(dir.querySelectorAll('a[href]'), function (a) {
      var pg = pagina(a.getAttribute('href'));
      return pg === 'login.html' || pg === 'cadastro.html';
    });
    if (jaTem || dir.querySelector('.bx-entrar, .bx-criar')) return;
    dir.querySelectorAll('.user-pill, .nav-user, .nav-bell').forEach(function (n) { n.remove(); });
    dir.insertAdjacentHTML('beforeend',
      '<a class="bx-entrar" href="login.html">Entrar</a>' +
      '<a class="bx-criar" href="cadastro.html">Criar conta</a>');
  }

  function montarBusca(topo) {
    if (topo.querySelector('.bx-busca')) return;
    var f = document.createElement('form');
    f.className = 'bx-busca'; f.action = 'parceiros.html'; f.method = 'get';
    f.setAttribute('role', 'search');
    f.innerHTML = '<span class="lupa" aria-hidden="true"></span>' +
      '<input type="search" name="q" placeholder="Buscar parceiro, destino ou voucher" aria-label="Buscar parceiro, destino ou voucher" autocomplete="off">' +
      '<kbd aria-hidden="true">/</kbd>';
    var dir = topo.querySelector('.cta-row, .topbar__right');
    if (dir) topo.insertBefore(f, dir); else topo.appendChild(f);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var a = document.activeElement, tag = a && a.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (a && a.isContentEditable)) return;
      ev.preventDefault(); f.querySelector('input').focus();
    });
  }

  function megaHtml(chave, d) {
    var html = '<div class="bx-mega" id="bxMega-' + chave + '" hidden><div class="bx-mega-in">';
    d.cols.forEach(function (col) {
      html += '<div class="bx-mega-col"><span class="bx-mega-rotulo">' + esc(col[0]) + '</span>';
      col[1].forEach(function (it) {
        html += '<a class="bx-mega-item" href="' + esc(it[2]) + '"' + (it[3] ? ' data-pkg="' + it[3] + '"' : '') + '>' +
          '<b>' + esc(it[0]) + '</b><span>' + esc(it[1]) + '</span></a>';
      });
      html += '</div>';
    });
    var x = d.destaque;
    if (x.tipo === 'neon') {
      html += '<a class="bx-mega-neon" href="' + esc(x.href) + '" data-pkg="plus"><div class="miolo">' +
        '<span class="bx-rotulo">' + esc(x.rotulo) + '</span>' +
        '<span class="num"><span data-pts>' + esc(x.num) + '</span> <small>' + esc(x.un) + '</small></span>' +
        '<span data-txt>' + esc(x.txt) + '</span><span class="ir">' + esc(x.ir) + '</span></div>' +
        '<div class="bx-canhoto"><span class="bx-vert">' + esc(x.canhoto) + '</span></div></a>';
    } else if (x.tipo === 'painel') {
      html += '<div class="bx-mega-painel"><span class="bx-rotulo">' + esc(x.rotulo) + '</span>';
      x.linhas.forEach(function (c) { html += '<div class="linha"><span>' + esc(c) + '</span><i>✓</i></div>'; });
      html += '<a class="ir" href="' + esc(x.href) + '">' + esc(x.ir) + '</a></div>';
    } else {
      html += '<div class="bx-mega-recibo"><div class="bx-zig" style="--bx-zig-cor:#F4F2EC"></div><div class="corpo">';
      x.linhas.forEach(function (l) { html += '<div class="bx-leader"><span>' + esc(l[0]) + '</span><i></i><span>' + esc(l[1]) + '</span></div>'; });
      html += '<a class="ir" href="' + esc(x.href) + '">' + esc(x.ir) + '</a></div></div>';
    }
    return html + '</div></div>';
  }

  function montarMega(barra, topo, u) {
    if (barra.getAttribute('data-bx-mega')) return;
    var links = topo.querySelectorAll('.links a, .topnav a');
    if (!links.length) return;
    var dados = megaDados(u), montados = {}, abertos = null, temporizador = null;

    links.forEach(function (a) {
      var chave = MEGA_POR_HREF[pagina(a.getAttribute('href'))];
      if (!chave || !dados[chave] || montados[chave]) return;
      barra.insertAdjacentHTML('beforeend', megaHtml(chave, dados[chave]));
      var painel = barra.querySelector('#bxMega-' + chave);
      montados[chave] = painel;
      a.setAttribute('aria-haspopup', 'true');
      a.setAttribute('aria-expanded', 'false');
      a.setAttribute('aria-controls', 'bxMega-' + chave);
      a.insertAdjacentHTML('beforeend', ' <i class="bx-caret" aria-hidden="true"></i>');

      function abrir() {
        if (abertos && abertos !== chave) fechar();
        painel.hidden = false; a.setAttribute('aria-expanded', 'true'); abertos = chave;
      }
      function fechar() {
        if (!abertos) return;
        var p = montados[abertos], g = barra.querySelector('[aria-controls="bxMega-' + abertos + '"]');
        p.hidden = true; if (g) g.setAttribute('aria-expanded', 'false'); abertos = null;
      }
      // Clique alterna (teclado e toque); o cursor abre com um atraso curto
      // para não disparar ao atravessar a barra, e fecha ao sair do par
      // gatilho+painel. O primeiro clique num item com painel abre o painel
      // em vez de navegar: a página do item está dentro do próprio painel.
      a.addEventListener('click', function (ev) {
        if (window.innerWidth <= LARGURA_DESKTOP) return;
        ev.preventDefault();
        if (abertos === chave) fechar(); else abrir();
      });
      [a, painel].forEach(function (el) {
        el.addEventListener('pointerenter', function (ev) {
          if (ev.pointerType === 'touch' || window.innerWidth <= LARGURA_DESKTOP) return;
          clearTimeout(temporizador); temporizador = setTimeout(abrir, 120);
        });
        el.addEventListener('pointerleave', function (ev) {
          if (ev.pointerType === 'touch') return;
          clearTimeout(temporizador); temporizador = setTimeout(function () { if (abertos === chave) fechar(); }, 180);
        });
      });
      painel.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { fechar(); a.focus(); } });
      a.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') fechar();
        if (ev.key === 'ArrowDown' && abertos === chave) { ev.preventDefault(); var f = painel.querySelector('a'); if (f) f.focus(); }
      });
      painel.addEventListener('focusout', function (ev) {
        if (!painel.contains(ev.relatedTarget) && ev.relatedTarget !== a) fechar();
      });
      document.addEventListener('click', function (ev) {
        if (abertos === chave && !painel.contains(ev.target) && !a.contains(ev.target)) fechar();
      });
    });
    barra.setAttribute('data-bx-mega', '1');
    if (Object.keys(montados).length) barra.classList.add('bx-com-mega');

    // preços reais, quando a API responde; o fallback do HTML continua valendo
    if (montados.comprar && window.BLAXX_API) {
      fetch(window.BLAXX_API + '/pix/packages', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          Object.keys(PACOTES).forEach(function (k) {
            var pk = d[k]; if (!pk) return;
            var item = montados.comprar.querySelector('.bx-mega-item[data-pkg="' + k + '"]');
            if (item && pk.points != null) item.querySelector('b').textContent = PACOTES[k].nome + ' · ' + fmtPts(pk.points) + ' pts';
            if (item && pk.price_brl != null) item.querySelector('span').textContent = fmtBrl(pk.price_brl) + ' · ' + PACOTES[k].obs;
          });
          var pl = d.plus, neon = montados.comprar.querySelector('.bx-mega-neon');
          if (pl && neon) {
            if (pl.points != null) neon.querySelector('[data-pts]').textContent = fmtPts(pl.points);
            if (pl.price_brl != null) neon.querySelector('[data-txt]').textContent = PACOTES.plus.nome + ' · ' + fmtBrl(pl.price_brl) + ' · ' + PACOTES.plus.obs;
          }
        })
        .catch(function () {});
    }
  }

  // ------------------------------------------------------------------ //
  // Barra de abas inferior no celular (só para quem entrou)             //
  // ------------------------------------------------------------------ //
  // No desktop a navegação logada mora na sidebar; abaixo de 880px ela
  // sumia dentro do hambúrguer. A barra de abas devolve os quatro destinos
  // de todo dia ao polegar, e "Menu" abre a gaveta que já existe.
  var ICONE = {
    inicio:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/></svg>',
    carteira: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 9h18"/><circle cx="17" cy="13.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
    comprar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v5c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7"/><path d="M9 14.6v2.8c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V11"/></svg>',
    resgates: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9C9 9 7 5 9.5 4.2 11 3.7 12 6.5 12 9c0-2.5 1-5.3 2.5-4.8C17 5 15 9 12 9Z"/></svg>',
    menu:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
  };
  var ABAS = [
    ['Início',   'dashboard.html',      'inicio',   ['dashboard.html', 'index.html']],
    ['Carteira', 'carteira.html',       'carteira', ['carteira.html', 'extrato.html']],
    ['Comprar',  'comprar-pontos.html', 'comprar',  ['comprar-pontos.html', 'comprar.html', 'comprar-livre.html', 'checkout.html']],
    ['Resgates', 'resgates.html',       'resgates', ['resgates.html', 'meus-resgates.html', 'resgate-pix.html']]
  ];
  function montarTabBar(u) {
    if (!u || document.querySelector('.bx-tabbar')) return;
    var atual = pagina(location.pathname);
    var nav = document.createElement('nav');
    nav.className = 'bx-tabbar';
    nav.setAttribute('aria-label', 'Navegação principal');
    var html = '';
    ABAS.forEach(function (a) {
      var ativa = a[3].indexOf(atual) >= 0;
      html += '<a href="' + a[1] + '"' + (ativa ? ' aria-current="page" class="ativa"' : '') + '>' +
        ICONE[a[2]] + '<span>' + a[0] + '</span></a>';
    });
    html += '<button type="button" class="bx-tabbar-menu" aria-label="Abrir menu">' + ICONE.menu + '<span>Menu</span></button>';
    nav.innerHTML = html;
    document.body.appendChild(nav);
    document.documentElement.classList.add('bx-com-tabbar');
    nav.querySelector('.bx-tabbar-menu').addEventListener('click', function () {
      var b = document.querySelector('.bxnav-burger, #menuBtn');
      if (b) b.click();
    });
  }

  function montarChromeEmbarque(barra, u) {
    garantirFolha();
    var topo = envolverTopo(barra);
    normalizarMarca(barra);
    if (!barra.getAttribute('data-bx-embarque')) {
      montarUtil(barra);
      if (!u) { montarNavVisitante(topo); montarAcoesVisitante(topo); }
      montarBusca(topo);
      barra.setAttribute('data-bx-embarque', '1');
    }
    montarTabBar(u);
    montarMega(barra, topo, u);
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
  // decidia sozinho, chrome.js abria à esquerda, blaxx-app.js e esta à
  // direita, então a mesma área logada abria de um lado ou do outro conforme
  // a página. A marcação vai no <html> para que valha também para a gaveta do
  // chrome.js, que não é construída aqui.
  function marcarLado(u) {
    var raiz = document.documentElement;
    raiz.classList.toggle('bx-gaveta-esq', !!u);
    raiz.classList.toggle('bx-gaveta-dir', !u);
  }

  function iniciar() {
    // Qualquer barra serve para marcar lado e prender no app. O chrome.js monta
    // `<div class="topbar">` SEM `.nav` dentro, exigir `.nav` aqui deixava as
    // 23 páginas dele de fora justamente da regra de lado, que é onde a
    // inconsistência aparecia.
    var barra = document.querySelector('.topbar');
    var u = usuario();

    // Vale para TODA página com barra, inclusive as que já têm gaveta própria:
    // o lado e a prisão no app não dependem de quem construiu o menu.
    if (barra) {
      marcarLado(u);
      montarChromeEmbarque(barra, u);
    }
    // O rodapé não depende da barra: página sem topbar (regulamento, parceiro,
    // 404) ganha o rodapé-recibo se trouxer <footer class="footer"> no HTML.
    montarRodape();
    // DEPOIS do rodapé: ele acabou de inserir links, e alguns (Conta BlaXx,
    // Cadastre-se) sairiam do app para quem já está logado.
    if (u) prenderNoApp();
    if (!barra) return;

    // `.drawer` cobre chrome.js e a landing, que têm gaveta própria e menu
    // próprio, ali não se constrói outra. O `.bx-drawer` do blaxx-app.js NÃO
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
    // esticado, o botão saía com 143px de largura em vez de 44. Como item
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
        // aba oculta, e ali a classe nunca era aplicada, a gaveta ficava
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
        // depois disso, e, ao contrário do rAF, roda também em aba oculta.
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
      // No desktop os links horizontais reaparecem e a gaveta perde o sentido,       // deixá-la aberta prenderia o scroll do body sobre o conteúdo.
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
