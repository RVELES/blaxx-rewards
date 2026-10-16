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

  // --------------------------------------------------------------------- //
  // Ícones do site (16/10/2026)                                            //
  // --------------------------------------------------------------------- //
  // Padrão único: desenho de traço que herda a cor (currentColor), sempre
  // dentro de um quadrado verde neon com o desenho em preto (CSS em
  // assets/blaxx-embarque.css, bloco "Ícones padronizados"). Emoji e
  // símbolos de texto saíram porque não pintam de preto. Exposto em
  // window.BlaxxIcones para o blaxx-app.js e as páginas usarem o mesmo set.
  function tracoSvg(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var ICONES = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/>',
    carteira: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 9h18"/><circle cx="17" cy="13.5" r="1.4" fill="currentColor" stroke="none"/>',
    extrato: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
    parceiros: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/><path d="M13.5 14.8c2.4-.4 4.5 1.2 4.5 4.2"/>',
    resgates: '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9C9 9 7 5 9.5 4.2 11 3.7 12 6.5 12 9c0-2.5 1-5.3 2.5-4.8C17 5 15 9 12 9Z"/>',
    voucher: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M14 7v10" stroke-dasharray="2 2.4"/>',
    campanhas: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    comprar: '<ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v5c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7"/><path d="M9 14.6v2.8c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V11"/>',
    enviar: '<path d="M20 4 3.5 10.8c-.8.3-.8 1.5.1 1.7l6.4 1.6 1.6 6.4c.2.9 1.4.9 1.7.1L20 4Z"/><path d="m20 4-9.9 10.1"/>',
    receber: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
    indique: '<path d="M12 20S4 14.5 4 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.2C20 14.5 12 20 12 20Z"/>',
    perfil: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5"/>',
    seguranca: '<path d="M12 3 5 6v6c0 4.3 3 7.2 7 9 4-1.8 7-4.7 7-9V6Z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    ajuda: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.4 2.4 0 0 1 4.6.9c0 1.6-2.2 1.8-2.2 3.3"/><circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none"/>',
    sair: '<path d="M15 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9"/><path d="M10 12h11m0 0-3.5-3.5M21 12l-3.5 3.5"/>',
    notificacoes: '<path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.2H4.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    cartao: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alerta: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none"/>',
    erro: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none"/>',
    estrela: '<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8Z"/>',
    email: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
    documento: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    anexo: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.8 17.1a1.7 1.7 0 0 1-2.4-2.4L15 7"/>',
    festa: '<path d="M4 20 9 7l8 8Z"/><path d="M14 4.5v.5M19 9.5h.5M16.5 6.5l1-1M12.5 8.5c1-1.5.5-3-.5-4M15.5 11.5c1.5-1 3-.5 4 .5"/>',
    raio: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z"/>',
    carrinho: '<circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/><path d="M3 4h2.5l2.2 11h10.8l2-7.5H6.6"/>',
    aviao: '<path d="M21 15.5 13.5 11V5.5a1.5 1.5 0 0 0-3 0V11L3 15.5V17l7.5-2.2V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-4.2L21 17Z"/>',
    hotel: '<path d="M3 19V6M21 19v-5a3 3 0 0 0-3-3h-8v5"/><path d="M3 14h18"/><circle cx="6.5" cy="10.5" r="1.8"/>',
    posto: '<path d="M5 20V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15M3.5 20h12"/><path d="M5 10h9M14 8l3 3v6.5a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>',
    farmacia: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    supermercado: '<path d="M4 9h16l-1.5 10.5h-13Z"/><path d="M8.5 9 11 4.5M15.5 9 13 4.5"/>',
    filme: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
    moda: '<path d="M4.5 12.5 12 5h7.5v7.5L12 20Z"/><circle cx="15.5" cy="8.5" r="1.2"/>',
    local: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
    loja: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 11.5V20h13v-8.5M10 20v-5h4v5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    seta: '<path d="M5 12h14m0 0-5-5m5 5-5 5"/>',
    grafico: '<path d="M4 19 9.5 12l4 3.5L20 6.5"/><path d="M15.5 6.5H20V11"/>',
    relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    tag: '<path d="M3.5 12.5 12 4h8v8l-8.5 8.5Z"/><circle cx="16" cy="8" r="1.2"/>',
    favorito: '<path d="M12 20S4 14.5 4 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.2C20 14.5 12 20 12 20Z"/>',
    celular: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    busca: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    configuracoes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    trocar: '<path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5"/><path d="M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5"/>',
    usuario_mais: '<circle cx="10" cy="8" r="3.6"/><path d="M3.5 20c0-3.6 2.9-5.5 6.5-5.5 1.6 0 3 .4 4.1 1"/><path d="M18 14v6M15 17h6"/>'
  };
  var BlaxxIcones = {
    svg: function (nome) { return ICONES[nome] ? tracoSvg(ICONES[nome]) : ''; },
    nomes: Object.keys(ICONES)
  };
  window.BlaxxIcones = BlaxxIcones;

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
      ['Comprar pontos', 'comprar-pontos.html'],
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
    // Visitante: "Criar conta" abre a gaveta (16/10). No celular ela saiu da
    // barra e mora só aqui, então vem primeiro, antes dos grupos.
    var html = u ? '' :
      '<a class="bxnav-cta bxnav-cta--topo" href="cadastro.html">Criar conta</a>' +
      '<a class="bxnav-cta bxnav-cta--vazado" href="login.html">Entrar</a>';
    grupos.forEach(function (g) {
      html += '<p class="bxnav-grupo">' + esc(g[0]) + '</p>';
      g[1].forEach(function (item) {
        var ativo = pagina(item[1]) === atual ? ' aria-current="page"' : '';
        html += '<a href="' + esc(item[1]) + '"' + ativo + '>' + esc(item[0]) + '</a>';
      });
    });
    if (u) html += '<a class="bxnav-cta" href="#" data-bxnav-sair>Sair</a>';
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
  // São Paulo e Rio de Janeiro: as cidades do mapa da home. A rede está em
  // expansão (16/10: o texto não afirma parceiro contratado nessas cidades).
  var CIDADES_NA_REDE = 2;

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
      ['on', '● Rede em expansão'],
      ['',   '✳ Benefícios em parceiros selecionados'],
      ['',   'Sem mensalidade']
    ],
    dir: [
      ['Segurança', 'sobre-seguranca.html'],
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
            ['Enviar pontos', 'Mande para quem quiser', u ? 'enviar.html' : 'sobre-enviar-pontos.html'],
            ['Resgatar benefícios', 'Troque pontos por vantagens', u ? 'resgates.html' : 'sobre-resgatar-beneficios.html']
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
            ['Mapa da rede', 'Cidades da rede em expansão', 'home-embarque.html#mapa'],
            ['Todos os parceiros', 'Lista completa por cidade', 'parceiros.html'],
            ['Seja parceiro', 'Leve sua marca para a rede', 'contato.html']
          ]]
        ],
        destaque: { tipo: 'painel', rotulo: 'PAINEL DE PARTIDAS',
                    linhas: ['SÃO PAULO', 'RIO DE JANEIRO'],
                    ir: 'Rede em expansão · ver mapa →', href: 'home-embarque.html#mapa' }
      },
      ajuda: {
        cols: [
          ['COMEÇAR', [
            ['Como funciona', 'Compre, envie e troque', 'como-funciona.html'],
            ['Regulamento do programa', 'As regras, por extenso', 'regulamento.html'],
            ['Segurança', 'Como protegemos sua conta', 'sobre-seguranca.html']
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
    // Cada link leva a uma página que EXPLICA o tema (pedido de 16/10); a
    // funcionalidade fica no botão dela. Nada aqui aponta para tela de função.
    ['PRODUTO', [
      ['Comprar pontos', 'sobre-comprar-pontos.html'],
      ['Parceiros', 'sobre-parceiros.html'],
      ['Enviar pontos', 'sobre-enviar-pontos.html'],
      ['Resgatar benefícios', 'sobre-resgatar-beneficios.html']
    ]],
    ['AJUDA', [
      ['Como funciona', 'como-funciona.html'],
      ['Central de ajuda', 'central-ajuda.html'],
      ['Falar com a gente', 'contato.html'],
      ['Segurança', 'sobre-seguranca.html']
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

  // Na barra preta a marca é só a palavra "BlaXx", sem o B e sem "REWARDS"
  // (pedido de 16/10), na variante de fundo escuro; qualquer wordmark ou B
  // que a página traga vira essa.
  function normalizarMarca(barra) {
    barra.querySelectorAll('img[src*="blaxx-wordmark"], img[src*="blaxx-simbolo-b"]').forEach(function (img) {
      img.src = img.src.replace(/blaxx-(wordmark(-claro(-neon)?)?|simbolo-b(-claro(-neon)?)?)\.svg/, 'blaxx-wordmark-barra.svg');
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

  // --------------------------------------------------------------------- //
  // Área comum: o mesmo menu em toda página pública (16/10)                //
  // --------------------------------------------------------------------- //
  // "O menu e o rodapé não se movem ou se alteram na área comum sob nenhuma
  // hipótese." Medido antes: três marcações de barra (topbar inline,
  // chrome.js, home), três pares de ações à direita ("Criar conta",
  // "Cadastre-se", só o sino), logo em x=73 na home e x=129 nas outras, oito
  // páginas sem barra e menu que rolava para fora em 13. Em página pública a
  // barra é refeita aqui, sempre com a mesma marcação: a página não escolhe
  // o menu. Só o lado direito acompanha a sessão.
  // Painel do Parceiro (empresas, parceiro.html): <html data-bx-area="parceiro">.
  // Lá não entra nada de consumidor (menu, lateral, abas, convite); a página
  // monta a barra própria. O rodapé comum continua.
  function areaParceiro() {
    return document.documentElement.getAttribute('data-bx-area') === 'parceiro';
  }

  function areaComum() {
    if (document.documentElement.getAttribute('data-bx-area') === 'logada') return false;
    var a = window.BlaxxAcesso;
    return !(a && a.fechada && a.fechada('/' + pagina(location.pathname)));
  }

  function acoesComuns(u) {
    if (!u) {
      return '<a class="bx-entrar" href="login.html">Entrar</a>' +
        '<a class="bx-criar" href="cadastro.html">Criar conta</a>';
    }
    var nu = window.BlaxxNavUser || {};
    var nome = nu.primeiroNome ? nu.primeiroNome(u) : '';
    return '<a class="bx-sino nav-bell" href="central-notificacoes.html" aria-label="Notificações">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.2H4.5Z"/>' +
      '<path d="M10 19a2 2 0 0 0 4 0"/></svg></a>' +
      '<a class="bx-chip" href="perfil.html" aria-label="Perfil">' +
      '<span class="bx-chip-av" aria-hidden="true">' + esc(nu.inicial ? nu.inicial(u) : '') + '</span>' +
      '<span class="bx-chip-nome">' + esc(nome ? 'Olá, ' + nome : 'Minha conta') + '</span></a>' +
      '<button type="button" class="bx-sair">Sair</button>';
  }

  function montarBarraComum(u) {
    var barras = document.querySelectorAll('.topbar');
    var barra = document.querySelector('.topbar[data-bx-comum]');
    if (barra) {
      // o chrome.js pode nascer depois com a barra dele: fica uma só
      [].forEach.call(barras, function (b) { if (b !== barra) b.remove(); });
      return barra;
    }
    barra = barras[0] || document.createElement('header');
    [].forEach.call(barras, function (b) { if (b !== barra) b.remove(); });
    // sempre filho direto do <body>, logo após o link "pular para o conteúdo"
    var pular = document.querySelector('body > .bx-skip-link');
    document.body.insertBefore(barra, pular ? pular.nextSibling : document.body.firstChild);
    barra.className = 'topbar';
    barra.removeAttribute('data-bx-embarque');
    barra.removeAttribute('data-bx-mega');
    [].forEach.call(document.querySelectorAll('.bx-mega'), function (m) { m.remove(); });
    var atual = pagina(location.pathname), links = '';
    if (u) atual = ATIVO_LOGADO[atual] || atual;
    (u ? NAV_LOGADO : NAV_VISITANTE).forEach(function (it) {
      var ativo = pagina(it[1]) === atual;
      links += '<a href="' + esc(it[1]) + '"' + (ativo ? ' class="active" aria-current="page"' : '') +
        '>' + esc(it[0]) + '</a>';
    });
    if (u) barra.setAttribute('data-bx-logado', '1'); else barra.removeAttribute('data-bx-logado');
    barra.innerHTML =
      '<nav class="nav" aria-label="Principal">' +
        '<a class="brand" href="' + (u ? HOME_LOGADA : '/') + '" aria-label="BlaXx Pontos, página inicial"><span class="mark">BlaXx</span></a>' +
        '<div class="links">' + links + '</div>' +
        '<div class="cta-row">' + acoesComuns(u) + '</div>' +
      '</nav>';
    barra.setAttribute('data-bx-comum', '1');
    var botaoSair = barra.querySelector('.bx-sair');
    if (botaoSair) botaoSair.addEventListener('click', sair);
    return barra;
  }

  // --------------------------------------------------------------------- //
  // Área logada no padrão do painel (16/10)                                //
  // --------------------------------------------------------------------- //
  // "Aplique dashboard.html para toda área logada": com sessão, TODA página
  // ganha o menu do topo do painel (os seis itens que o blaxx-app.js fixou),
  // a mesma barra lateral (perfil, itens e ícones do painel) e a mesma coluna
  // centralizada (.app-shell). Antes as páginas do chrome.js tinham outra
  // lateral, colada na borda, e as públicas mostravam o menu de visitante.
  // Administração e protótipo têm barra própria.
  var SEM_BARRA_LOGADA = ['admin.html', 'app.html'];
  var NAV_LOGADO = [
    ['Início', 'dashboard.html'],
    ['Como funciona', 'como-funciona.html'],
    ['Parceiros', 'parceiros.html'],
    ['Resgates', 'resgates.html'],
    ['Comprar pontos', 'comprar-pontos.html'],
    ['Vender pontos', 'venda-pontos.html']
  ];
  var ATIVO_LOGADO = { 'index.html': 'dashboard.html', 'vender-pontos.html': 'venda-pontos.html' };
  // [data-side, ícone (window.BlaxxIcones), rótulo, destino]: os do painel.
  var LATERAL = [
    ['dashboard', 'inicio', 'Início', 'dashboard.html'],
    ['carteira', 'carteira', 'Carteira', 'carteira.html'],
    ['extrato', 'extrato', 'Extrato', 'extrato.html'],
    ['parceiros', 'parceiros', 'Parceiros', 'parceiros.html'],
    ['resgates', 'resgates', 'Resgates', 'resgates.html'],
    ['meus-resgates', 'voucher', 'Meus resgates', 'meus-resgates.html'],
    ['campanhas', 'campanhas', 'Campanhas', 'campanhas.html'],
    ['comprar-pontos', 'comprar', 'Comprar pontos', 'comprar-pontos.html'],
    ['enviar-pontos', 'enviar', 'Enviar pontos', 'enviar-pontos.html'],
    ['indique', 'indique', 'Indique e ganhe', 'indique-ganhe.html']
  ];
  var LATERAL_PE = [
    ['perfil', 'perfil', 'Perfil', 'perfil.html'],
    ['seguranca', 'seguranca', 'Segurança', 'seguranca.html'],
    ['ajuda', 'ajuda', 'Ajuda', 'central-ajuda.html']
  ];
  var LADO_ATIVO = { 'index.html': 'dashboard', 'indique-ganhe.html': 'indique', 'indique.html': 'indique', 'central-ajuda.html': 'ajuda' };
  // Telas que não são "área de conta": entrada, erro, administração e a home
  // de marketing (layout de largura total).
  var SEM_LATERAL = ['login.html', 'cadastro.html', 'recuperar-senha.html', 'redefinir-senha.html',
    'validacao.html', 'manutencao.html', '404.html', 'app.html', 'admin.html', 'home-embarque.html'];

  function montarLateral(u) {
    if (!u || areaParceiro() || document.documentElement.hasAttribute('data-bx-sem-lateral')) return;
    var pg = pagina(location.pathname);
    if (SEM_LATERAL.indexOf(pg) >= 0) return;
    var aside = document.querySelector('aside.sidebar');
    if (aside && aside.getAttribute('data-bx-lateral')) return;
    // O chrome.js chama iniciar() ANTES de montar o .shell dele; mexer no
    // <main> nessa hora embaralharia as duas estruturas. A chamada do
    // DOMContentLoaded, que vem depois, faz o trabalho.
    if (document.querySelector('script[src$="chrome.js"]') && !document.querySelector('.shell, .app-shell')) return;
    var main = document.querySelector('main');
    if (!main) return;
    var casca = aside ? aside.parentNode : null;
    if (!aside) {
      aside = document.createElement('aside');
      casca = document.createElement('div');
      main.parentNode.insertBefore(casca, main);
      casca.appendChild(aside);
      casca.appendChild(main);
    }
    casca.className = 'app-shell';
    aside.className = 'sidebar';
    aside.setAttribute('data-bx-lateral', '1');
    var lado = LADO_ATIVO[pg] || pg.replace(/\.html$/, '');
    function itens(lista) {
      return lista.map(function (it) {
        var ativo = it[0] === lado;
        return '<li><a href="' + it[3] + '" data-side="' + it[0] + '"' + (ativo ? ' class="active" aria-current="page"' : '') +
          '><span class="ic" aria-hidden="true">' + BlaxxIcones.svg(it[1]) + '</span> ' + esc(it[2]) + '</a></li>';
      }).join('');
    }
    var nu = window.BlaxxNavUser || {};
    aside.innerHTML =
      '<div class="side-user">' +
        '<div class="avatar">' + esc(nu.inicial ? nu.inicial(u) : '') + '</div>' +
        '<div><div class="side-user-name">' + esc(u.name || u.nome || (nu.primeiroNome ? nu.primeiroNome(u) : '')) + '</div>' +
        '<div class="side-user-tier">Minha conta</div></div>' +
      '</div>' +
      '<ul class="side-nav">' + itens(LATERAL) + '</ul>' +
      '<div class="side-foot"><ul class="side-nav">' + itens(LATERAL_PE) +
        '<li><a href="login.html" data-bxnav-sair><span class="ic" aria-hidden="true">' + BlaxxIcones.svg('sair') + '</span> Sair</a></li>' +
      '</ul></div>';
    aside.querySelector('[data-bxnav-sair]').addEventListener('click', function (ev) { ev.preventDefault(); sair(); });
  }

  // Convite "Criar conta" no corpo de toda página pública, para quem não
  // entrou (16/10): faixa antes do rodapé. Fica fora das telas que já são o
  // próprio cadastro ou login.
  var SEM_CONVITE = ['cadastro.html', 'login.html', 'recuperar-senha.html', 'redefinir-senha.html', 'validacao.html'];
  function montarConvite() {
    if (document.querySelector('.bx-convite')) return;
    if (areaParceiro() || SEM_CONVITE.indexOf(pagina(location.pathname)) >= 0) return;
    var pe = document.querySelector('footer.footer, footer.site-footer');
    if (!pe) return;
    var sec = document.createElement('section');
    sec.className = 'bx-convite';
    sec.setAttribute('aria-labelledby', 'bxConviteTitulo');
    // Cartões no modelo dos atalhos do painel: ícone de traço em quadrado
    // neon, título e uma linha. Fatos: cadastro gratuito (termos.html), login
    // com Google (login/cadastro), mensalidade nenhuma (home), envio entre
    // contas e benefícios em parceiros selecionados (regulamento).
    var ICONE = function (d) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    };
    var CARTOES = [
      ['<circle cx="10" cy="8" r="3.6"/><path d="M3.5 20c0-3.6 2.9-5.5 6.5-5.5 1.6 0 3 .4 4.1 1"/><path d="M18 14v6M15 17h6"/>',
       'Cadastro em minutos', 'Crie sua conta com e-mail ou com o Google. O cadastro é gratuito.'],
      ['<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9.5 13.5 5 5M14.5 13.5l-5 5"/>',
       'Sem mensalidade', 'Nada de taxa fixa por mês para manter a conta.'],
      ['<path d="M20 4 3.5 10.8c-.8.3-.8 1.5.1 1.7l6.4 1.6 1.6 6.4c.2.9 1.4.9 1.7.1L20 4Z"/><path d="m20 4-9.9 10.1"/>',
       'Envie para quem quiser', 'Mande pontos para outras contas BlaXx, com registro no extrato.'],
      ['<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9C9 9 7 5 9.5 4.2 11 3.7 12 6.5 12 9c0-2.5 1-5.3 2.5-4.8C17 5 15 9 12 9Z"/>',
       'Troque por benefícios', 'Benefícios e experiências em parceiros selecionados.']
    ].map(function (c) {
      return '<li class="bx-convite-card"><span class="bx-convite-ico">' + ICONE(c[0]) + '</span>' +
        '<h3>' + c[1] + '</h3><p>' + c[2] + '</p></li>';
    }).join('');
    sec.innerHTML =
      '<div class="bx-convite-in">' +
        '<div class="bx-convite-topo">' +
          '<span class="bx-convite-rotulo">CRIAR CONTA · SEM MENSALIDADE</span>' +
          '<h2 id="bxConviteTitulo">Inicie sua aventura com a BlaXx.</h2>' +
          '<p>Abra sua conta em poucos minutos e comece a comprar, enviar e trocar pontos.</p>' +
        '</div>' +
        '<ul class="bx-convite-grade">' + CARTOES + '</ul>' +
        '<div class="bx-convite-acao">' +
          '<div><b>Pronto para embarcar?</b><span>Sua conta BlaXx fica pronta em poucos minutos.</span></div>' +
          '<div class="bx-convite-botoes">' +
            '<a class="bx-convite-criar" href="cadastro.html">Criar conta <span aria-hidden="true">→</span></a>' +
            '<a class="bx-convite-entrar" href="login.html">Já tenho conta · Entrar</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    pe.parentNode.insertBefore(sec, pe);
  }

  // Logado: "Sair" à vista na barra, não só dentro da gaveta (pedido de
  // 16/10). Página que traz "Entrar / Criar conta" fixo no HTML (a home) troca
  // esses dois pela saudação, que leva para a área logada.
  function montarAcoesLogado(topo, u) {
    var dir = topo.querySelector('.cta-row, .topbar__right');
    if (!dir) return;
    var visitante = [].filter.call(dir.querySelectorAll('a[href]'), function (a) {
      var pg = pagina(a.getAttribute('href'));
      return (pg === 'login.html' || pg === 'cadastro.html') && !/sair/i.test(a.textContent || '');
    });
    if (visitante.length) {
      visitante.forEach(function (a) { a.remove(); });
      if (!dir.querySelector('.nav-user, .user-pill')) {
        var nu = window.BlaxxNavUser || {};
        var nome = nu.primeiroNome ? nu.primeiroNome(u) : '';
        dir.insertAdjacentHTML('beforeend',
          '<a class="button secondary nav-user" href="' + HOME_LOGADA + '" aria-label="Minha conta">' +
          '<span class="nav-av" aria-hidden="true">' + esc(nu.inicial ? nu.inicial(u) : '') + '</span>' +
          '<span class="nav-user__nome">' + esc(nome ? 'Olá, ' + nome : 'Minha conta') + '</span></a>');
      }
    }
    var jaTem = dir.querySelector('.bx-sair, [data-bx-logout], [data-bxnav-sair]') ||
      [].some.call(dir.querySelectorAll('a, button'), function (el) {
        return (el.textContent || '').trim().toLowerCase() === 'sair';
      });
    if (jaTem) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bx-sair';
    b.textContent = 'Sair';
    b.addEventListener('click', sair);
    dir.appendChild(b);
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
    if (areaParceiro()) return;
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
      if (barra.hasAttribute('data-bx-comum')) { /* links e ações já canônicos */ }
      else if (!u) { montarNavVisitante(topo); montarAcoesVisitante(topo); }
      else montarAcoesLogado(topo, u);
      if (!barra.hasAttribute('data-bx-logado')) montarBusca(topo);
      barra.setAttribute('data-bx-embarque', '1');
    }
    montarTabBar(u);
    // o menu do painel não tem mega-menus: os itens levam direto às páginas
    if (!barra.hasAttribute('data-bx-logado')) montarMega(barra, topo, u);
  }

  function sair() {
    // O blaxx-app.js, quando está na página, avisa o backend (revoga o
    // refresh) antes de limpar; sem ele, limpa a sessão local aqui mesmo.
    if (typeof window.blaxxLogout === 'function') { window.blaxxLogout(); return; }
    try {
      [localStorage, sessionStorage].forEach(function (st) {
        Object.keys(st).forEach(function (k) {
          if (k.indexOf('blaxx_') === 0 && k !== 'blaxx_set_password_dismissed_at' &&
              k !== 'blaxx_cookie_consent_v1') st.removeItem(k);
        });
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
    var u = usuario();
    var comum = areaComum();
    // Com sessão, o menu do painel vale em toda página; sem sessão, o menu
    // comum vale nas páginas públicas.
    var canonica = !areaParceiro() && (comum || u) && SEM_BARRA_LOGADA.indexOf(pagina(location.pathname)) < 0;
    if (canonica) montarBarraComum(u);
    montarLateral(u);
    var barra = document.querySelector('.topbar');

    // Vale para TODA página com barra, inclusive as que já têm gaveta própria:
    // o lado e a prisão no app não dependem de quem construiu o menu.
    if (barra) {
      marcarLado(u);
      montarChromeEmbarque(barra, u);
    }
    // O rodapé não depende da barra: página sem topbar (regulamento, parceiro,
    // 404) ganha o rodapé-recibo se trouxer <footer class="footer"> no HTML.
    montarRodape();
    if (comum && !u) montarConvite();
    // DEPOIS do rodapé: ele acabou de inserir links, e alguns (Conta BlaXx,
    // Cadastre-se) sairiam do app para quem já está logado.
    if (u) prenderNoApp();
    if (!barra) return;

    // `.drawer` cobre chrome.js e a landing, que têm gaveta própria e menu
    // próprio, ali não se constrói outra. O `.bx-drawer` do blaxx-app.js NÃO
    // entra nesta lista de propósito: ele cede a nós (ver installHamburgerMenu),
    // para que as 49 páginas inline tenham UMA gaveta só, e a mesma.
    // Na área comum a gaveta é sempre esta, para o menu do celular também ser
    // um só; a do chrome.js fica sem botão que a abra.
    if (document.getElementById(ID_GAVETA)) return;
    if (!canonica && document.querySelector('.drawer')) return;

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
