/* blaxx-google.js — Login com Google para as páginas de autenticação.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * `login.html` e `cadastro.html` NÃO carregam o `blaxx-app.js`: elas têm a
 * própria camada de fetch inline. A implementação de Google Sign-In que existia
 * dentro do `blaxx-app.js` portanto nunca rodava justamente nas duas páginas que
 * precisam dela. Em vez de copiar o fluxo (este projeto tem histórico caro de
 * segunda cópia divergente), ele vive aqui e é carregado pelas duas.
 *
 * CONTRATO
 * --------
 * Precisa de:
 *   - `window.BLAXX_GOOGLE_CLIENT_ID` (de `blaxx-config.js`) — público por design
 *   - `window.BLAXX_API`             (de `blaxx-config.js`)
 *   - um `<div id="g-signin-btn">` na página
 *   - o SDK: <script src="https://accounts.google.com/gsi/client" async defer>
 *
 * Sem Client ID, esconde o botão e o divisor — melhor não oferecer do que
 * oferecer quebrado.
 *
 * SEGURANÇA
 * ---------
 * O Client ID é público (está no bundle do browser e no Info.plist do iOS). A
 * segurança vem do backend: `/auth/google` valida assinatura RSA contra o JWKS
 * do Google, expiração, issuer, audience e `email_verified`. Aqui geramos um
 * nonce de uso único que o backend confere contra o `nonce` do ID token —
 * é o que impede replay de um token capturado.
 */
(function () {
  'use strict';

  var CONTAINER_ID = 'g-signin-btn';
  var NONCE_KEY = 'blaxx_google_nonce';
  var emAndamento = false;

  function base() {
    var padrao = window.BLAXX_API || 'https://blaxx-pontos-exe.onrender.com';
    try {
      return (localStorage.getItem('blaxx_api_url') || padrao).replace(/\/+$/, '');
    } catch (e) {
      return padrao;
    }
  }

  // Mesmas regras do login.html e do safeNext() do blaxx-app.js: só caminho
  // interno. Sem isso, ?next=//evil.com vira open redirect autenticado.
  function destino() {
    try {
      var n = new URLSearchParams(location.search).get('next') || '';
      if (n.charAt(0) === '/' && n.charAt(1) !== '/' &&
          n.indexOf(':') === -1 && n.indexOf('\\') === -1) return n;
    } catch (e) {}
    return 'dashboard.html';
  }

  // O dashboard lê `blaxx_token`/`blaxx_user`; o index/Command Center lê
  // `blaxx_session`. Gravar só um dos formatos manda o usuário de volta pro
  // login em loop — por isso as quatro chaves, igual ao saveSession() do
  // login.html.
  function salvarSessao(j) {
    try {
      localStorage.setItem('blaxx_session', JSON.stringify(j));
      if (j.token) localStorage.setItem('blaxx_token', j.token);
      if (j.user) localStorage.setItem('blaxx_user', JSON.stringify(j.user));
      if (j.refresh_token) localStorage.setItem('blaxx_refresh', j.refresh_token);
    } catch (e) {}
  }

  function erro(container, msg) {
    var alvo = null;
    var id = container && container.getAttribute('data-erro-id');
    if (id) alvo = document.getElementById(id);
    if (!alvo) alvo = document.getElementById('loginErr') || document.getElementById('cadErr');
    if (alvo) {
      alvo.textContent = msg;
      alvo.style.display = 'block';
    } else if (window.console) {
      console.error('[Blaxx] ' + msg);
    }
  }

  function gerarNonce() {
    var bytes = new Uint8Array(24);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return s;
  }

  function aoReceberCredencial(resposta) {
    var container = document.getElementById(CONTAINER_ID);

    // O GSI pode disparar o callback duas vezes em reconexão. Sem trava, isso
    // vira duas chamadas de login concorrentes.
    if (emAndamento) {
      if (window.console) console.warn('[Blaxx] credencial Google duplicada ignorada');
      return;
    }
    if (!resposta || !resposta.credential) {
      erro(container, 'Não recebemos o token do Google. Tente novamente.');
      return;
    }
    emAndamento = true;
    if (container) container.style.pointerEvents = 'none';

    var nonce = '';
    try {
      nonce = sessionStorage.getItem(NONCE_KEY) || '';
      sessionStorage.removeItem(NONCE_KEY);   // uso único
    } catch (e) {}

    fetch(base() + '/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: resposta.credential, nonce: nonce })
    })
      .then(function (r) {
        return r.json().then(function (j) { return { s: r.status, j: j }; });
      })
      .then(function (res) {
        if (res.s === 200 && res.j && res.j.token) {
          salvarSessao(res.j);
          location.href = destino();
          return;
        }
        emAndamento = false;
        if (container) container.style.pointerEvents = '';
        erro(container, (res.j && res.j.error) || 'Não foi possível entrar com o Google.');
      })
      .catch(function (e) {
        emAndamento = false;
        if (container) container.style.pointerEvents = '';
        erro(container, 'Falha de conexão com o Google: ' + e.message);
      });
  }

  function iniciar() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;   // página não oferece login social

    var clientId = window.BLAXX_GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      container.style.display = 'none';
      var divisor = container.previousElementSibling;
      if (divisor && divisor.classList.contains('auth-divider')) divisor.style.display = 'none';
      return;
    }

    // O SDK entra com async/defer, então pode não estar pronto ainda. Teto de
    // ~8s para não girar para sempre quando um bloqueador barra o script.
    var tentativas = 0;
    (function aguardarSdk() {
      if (!(window.google && window.google.accounts && window.google.accounts.id)) {
        if (++tentativas > 100) {
          erro(container,
               'Não foi possível carregar o login do Google. Verifique se há bloqueador de anúncios.');
          return;
        }
        return setTimeout(aguardarSdk, 80);
      }

      var nonce = gerarNonce();
      try { sessionStorage.setItem(NONCE_KEY, nonce); } catch (e) {}

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: aoReceberCredencial,
          nonce: nonce,
          // O One Tap automático confunde em página de login, onde o usuário já
          // decidiu entrar. Botão explícito só.
          auto_select: false,
          cancel_on_tap_outside: true
        });
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: container.getAttribute('data-texto') === 'signup_with'
            ? 'signup_with' : 'signin_with',
          logo_alignment: 'left',
          width: Math.min(container.offsetWidth || 320, 400)
        });
      } catch (e) {
        erro(container, 'Falha ao iniciar o login do Google: ' + e.message);
      }
    })();
  }

  // Exposto para o blaxx-app.js delegar em vez de manter a segunda cópia.
  window.BlaxxGoogle = { iniciar: iniciar };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
