/* blaxx-acesso.js, nenhum link leva visitante a página que exige login.
 *
 * Regra (16/10/2026): quem não entrou nunca clica num link e cai numa tela
 * que o expulsa para o login. Todo link para página protegida vira, para o
 * visitante, "login.html?next=/<página>": a pessoa entra e segue direto para
 * onde ia (o login.html já honra ?next=).
 *
 * PROTEGIDAS saiu de medição, não de leitura: cada página do site foi aberta
 * sem sessão e as 29 que redirecionaram para o login estão aqui. CONTA são as
 * telas da conta que não redirecionam mas só fazem sentido para quem entrou
 * (histórico, notificações, comprovantes); um link para elas também vai ao
 * login. Página nova que exija sessão entra numa das duas listas.
 *
 * Três camadas: reescreve os href ao carregar, observa links inseridos depois
 * (menus, cards montados por JS) e, como garantia, intercepta o clique.
 */
(function () {
  'use strict';

  var PROTEGIDAS = [
    'abrir-chamado', 'admin', 'app', 'beneficio-detalhe', 'cartao', 'carteira',
    'central-notificacoes', 'checkout', 'compra-aprovada', 'comprar-livre',
    'comprar-pontos', 'comprar', 'confirmar-envio', 'confirmar-resgate',
    'dashboard', 'detalhe-beneficio', 'enviar-pontos', 'enviar', 'envio-concluido',
    'extrato', 'indique', 'pagamento-cartao', 'pagamento-pix', 'perfil',
    'resgate-pix', 'resgates', 'seguranca', 'venda-pontos', 'vender-pontos'
  ];
  var CONTA = [
    'meus-resgates', 'notificacoes', 'receber-pontos', 'saldo-insuficiente',
    'excluir-conta', 'meus-chamados', 'detalhe-chamado', 'transacao-detalhe',
    'detalhe-transacao', 'resgate-concluido', 'resgate-sucesso', 'envio-sucesso',
    'compra-pendente', 'compra-recusada', 'campanha-progresso',
    'progresso-campanha', 'indique-ganhe', 'voucher-detalhe', 'detalhe-voucher',
    'onboarding'
  ];
  var FECHADAS = {};
  PROTEGIDAS.concat(CONTA).forEach(function (p) { FECHADAS[p + '.html'] = true; });

  // Mesma leitura de sessão do guard das páginas (blaxx_token ou
  // blaxx_session.token, em localStorage; o app também usa sessionStorage).
  function logado() {
    try {
      if (localStorage.getItem('blaxx_token') || sessionStorage.getItem('blaxx_token')) return true;
      var s = JSON.parse(localStorage.getItem('blaxx_session') || 'null');
      return !!(s && s.token);
    } catch (e) { return false; }
  }

  // Em produção o Netlify serve URL limpa ("/carteira"); aqui os dois
  // formatos viram "carteira.html".
  function pagina(url) {
    var h = url.pathname.split('/').pop().toLowerCase();
    if (!h) return 'index.html';
    return /\.[a-z0-9]+$/.test(h) ? h : h + '.html';
  }

  function destinoFechado(a) {
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
    var url;
    try { url = new URL(href, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin) return null;
    var pg = pagina(url);
    if (pg === 'login.html' || !FECHADAS[pg]) return null;
    return '/' + pg + url.search + url.hash;
  }

  function paraLogin(destino) {
    return 'login.html?next=' + encodeURIComponent(destino);
  }

  function reescrever(raiz) {
    if (logado() || !raiz || !raiz.querySelectorAll) return;
    var links = raiz.matches && raiz.matches('a[href]') ? [raiz] : [];
    links = links.concat([].slice.call(raiz.querySelectorAll('a[href]')));
    links.forEach(function (a) {
      if (a.hasAttribute('data-bx-acesso')) return;
      var destino = destinoFechado(a);
      if (!destino) return;
      a.setAttribute('data-bx-acesso', destino);
      a.setAttribute('href', paraLogin(destino));
    });
  }

  // Garantia final: um link que escapou da reescrita (inserido no meio de um
  // clique, href trocado por outro script) ainda passa pelo login.
  document.addEventListener('click', function (ev) {
    if (logado() || ev.defaultPrevented) return;
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var destino = destinoFechado(a);
    if (!destino) return;
    ev.preventDefault();
    location.href = paraLogin(destino);
  }, true);

  function iniciar() {
    reescrever(document.body);
    if (!window.MutationObserver) return;
    new MutationObserver(function (lista) {
      if (logado()) return;
      lista.forEach(function (m) {
        if (m.type === 'attributes') {
          // a própria reescrita troca o href; só um href novo que não seja o
          // do login (outro script mudou o destino) precisa ser reavaliado
          var h = m.target.getAttribute('href') || '';
          if (h.indexOf('login.html?next=') === 0) return;
          m.target.removeAttribute('data-bx-acesso'); reescrever(m.target); return;
        }
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) reescrever(n); });
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }

  window.BlaxxAcesso = { logado: logado, fechada: function (href) {
    var a = document.createElement('a'); a.setAttribute('href', href); return !!destinoFechado(a);
  } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
