/* ==========================================================================
 * Blaxx Pontos - integracao das telas estaticas com o backend Flask.
 *
 * Detecta a pagina atual e instala a logica de cada fluxo, mantendo o
 * visual original intacto. Inclua este arquivo no final do <body> com:
 *   <script src="assets/blaxx-app.js"></script>
 *
 * Estado entre telas: sessionStorage (token, user, dados de fluxo).
 * ========================================================================== */
(function () {
  'use strict';

  // ---- Config ----
  // Em dev (Flask servindo /site/) -> location.origin
  // Em prod (Netlify) -> window.BLAXX_API definido em assets/blaxx-config.js
  var API = window.BLAXX_API || location.origin;
  var DEFAULT_AVATAR = 'M';

  // ---- Helpers ----
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var fmt = function (n) { return Number(n).toLocaleString('pt-BR'); };
  var brl = function (v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); };

  function maskCpf(c) {
    if (!c) return '';
    c = String(c).replace(/\D/g, '');
    if (c.length !== 11) return c;
    return c.slice(0,3) + '.' + c.slice(3,6) + '.' + c.slice(6,9) + '-' + c.slice(9);
  }

  function notify(msg, kind) {
    kind = kind || 'info';
    var bg = { ok: '#efffe6', err: '#ffede8', warn: '#fff7df', info: '#e8f3ff' }[kind];
    var color = { ok: '#2d651b', err: '#a83417', warn: '#8a6500', info: '#1c4f87' }[kind];
    var el = document.createElement('div');
    // A11y: erros usam role=alert (assertivo, interrompe leitor de tela);
    // outros usam role=status (polite, espera o leitor terminar).
    // aria-live garante que o screen reader anuncie o conteudo dinamico.
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.setAttribute('aria-live', kind === 'err' ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.style.cssText =
      'position:fixed;top:24px;right:24px;z-index:9999;background:' + bg +
      ';color:' + color + ';padding:14px 20px;border-radius:14px;font-family:Inter,sans-serif;' +
      'font-size:14px;font-weight:600;box-shadow:0 12px 32px rgba(0,0,0,.12);max-width:360px;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 4000);
    setTimeout(function () { el.remove(); }, 4500);
  }

  // ---- Storage ----
  // Mudança 2026-05-27: token e user agora em localStorage (persiste entre
  // tabs e fechamento do browser). Antes era sessionStorage — perdia sessão
  // ao abrir nova aba, voltar do Google OAuth, etc, forçando re-login.
  //
  // Dados de fluxo curto (charge em andamento, carteira snapshot) continuam
  // em sessionStorage porque são contextuais à navegação atual.
  //
  // Migração transparente: se houver token antigo em sessionStorage, copia
  // pra localStorage uma vez e limpa o sessionStorage antigo.
  function _migrateOldSession() {
    try {
      var oldToken = sessionStorage.getItem('blaxx_token');
      var oldUser = sessionStorage.getItem('blaxx_user');
      if (oldToken && !localStorage.getItem('blaxx_token')) {
        localStorage.setItem('blaxx_token', oldToken);
        if (oldUser) localStorage.setItem('blaxx_user', oldUser);
        sessionStorage.removeItem('blaxx_token');
        sessionStorage.removeItem('blaxx_user');
      }
    } catch (e) { /* localStorage indisponível: tolera */ }
  }
  _migrateOldSession();

  var STORE = {
    token: function () {
      try { return localStorage.getItem('blaxx_token'); }
      catch (e) { return sessionStorage.getItem('blaxx_token'); }
    },
    setToken: function (t) {
      try { localStorage.setItem('blaxx_token', t); }
      catch (e) { sessionStorage.setItem('blaxx_token', t); }
    },
    user: function () {
      try { return JSON.parse(localStorage.getItem('blaxx_user') || 'null'); }
      catch (e) {
        try { return JSON.parse(sessionStorage.getItem('blaxx_user') || 'null'); }
        catch (e2) { return null; }
      }
    },
    setUser: function (u) {
      try { localStorage.setItem('blaxx_user', JSON.stringify(u)); }
      catch (e) { sessionStorage.setItem('blaxx_user', JSON.stringify(u)); }
    },
    clear: function () {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('blaxx_') === 0 && k !== 'blaxx_set_password_dismissed_at') {
            localStorage.removeItem(k);
          }
        });
      } catch (e) {}
      try {
        Object.keys(sessionStorage).forEach(function (k) {
          if (k.indexOf('blaxx_') === 0) sessionStorage.removeItem(k);
        });
      } catch (e) {}
    },
    setFlow: function (k, v) { sessionStorage.setItem('blaxx_flow_' + k, JSON.stringify(v)); },
    getFlow: function (k) {
      try { return JSON.parse(sessionStorage.getItem('blaxx_flow_' + k) || 'null'); }
      catch (e) { return null; }
    }
  };

  // ---- Fetch wrapper ----
  // Contador passivo de falhas de rede. Apos 3 erros consecutivos de
  // conectividade (fetch reject, status>=500, 0/timeout), mostra banner
  // sticky "Backend instavel" com botao de retry. Reset no 1o sucesso.
  // Nao dispara em 4xx (que sao falhas semanticas, nao infra).
  var _bxNetFailCount = 0;
  var _bxAutoRecoverTimer = null;
  var _bxAutoRecoverAttempts = 0;
  var BX_AUTO_RECOVER_INTERVAL_MS = 30000;     // probe a cada 30s
  var BX_AUTO_RECOVER_MAX_ATTEMPTS = 10;       // ate 5 minutos, depois desiste

  function _bxShowOfflineBanner() {
    if (document.getElementById('bx-offline-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'bx-offline-banner';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9998;background:#fff7df;color:#8a6500;' +
      'padding:10px 16px;font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;' +
      'text-align:center;border-bottom:1px solid #f0c850;box-shadow:0 2px 6px rgba(0,0,0,.08);';
    bar.innerHTML =
      '<span id="bx-offline-msg">⚠ Conexao instavel com o servidor. Tentando reconectar…</span> ' +
      '<button id="bx-offline-retry" style="margin-left:12px;background:#8a6500;color:#fff;border:0;' +
      'padding:4px 12px;border-radius:999px;font-weight:700;font-size:12px;cursor:pointer;">' +
      'Verificar agora</button>';
    document.body.appendChild(bar);
    var btn = document.getElementById('bx-offline-retry');
    if (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true; btn.textContent = 'Testando...';
        _bxProbeHealth().then(function (ok) {
          if (ok) { _bxHideOfflineBanner(); _bxNetFailCount = 0; _bxStopAutoRecover(); }
          else { btn.disabled = false; btn.textContent = 'Verificar agora'; }
        });
      });
    }
    // Inicia auto-recover em background (cancelavel)
    _bxStartAutoRecover();
  }
  function _bxHideOfflineBanner() {
    var b = document.getElementById('bx-offline-banner');
    if (b) b.remove();
    _bxStopAutoRecover();
  }
  function _bxNetFailureTick() {
    _bxNetFailCount++;
    if (_bxNetFailCount >= 3) _bxShowOfflineBanner();
  }
  function _bxNetSuccessTick() {
    if (_bxNetFailCount > 0) {
      _bxNetFailCount = 0;
      _bxHideOfflineBanner();
    }
  }

  // Probe /healthz com timeout curto. Resolve true se backend respondeu OK.
  function _bxProbeHealth() {
    return bxFetchJson(API + '/healthz', { timeoutMs: 8000 })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  // Auto-recover: probe periodico ate backend voltar OU desistir apos 5min.
  // Custo total: ate 10 GETs no /healthz (handler de <2ms cada). Negligenciavel.
  function _bxStartAutoRecover() {
    if (_bxAutoRecoverTimer) return;
    _bxAutoRecoverAttempts = 0;
    _bxAutoRecoverTimer = setInterval(function () {
      _bxAutoRecoverAttempts++;
      if (_bxAutoRecoverAttempts > BX_AUTO_RECOVER_MAX_ATTEMPTS) {
        _bxStopAutoRecover();
        var msg = document.getElementById('bx-offline-msg');
        if (msg) msg.innerHTML = '⚠ Backend indisponivel ha muito tempo. Atualize a pagina.';
        return;
      }
      _bxProbeHealth().then(function (ok) {
        if (ok) {
          _bxNetFailCount = 0;
          _bxHideOfflineBanner();
        }
      });
    }, BX_AUTO_RECOVER_INTERVAL_MS);
  }
  function _bxStopAutoRecover() {
    if (_bxAutoRecoverTimer) {
      clearInterval(_bxAutoRecoverTimer);
      _bxAutoRecoverTimer = null;
    }
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var tok = STORE.token();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      // Tracking de saude da conexao: 5xx conta como falha de infra; 4xx
      // conta como sucesso (semantica do user, nao infra). 2xx/3xx = success.
      if (res.status >= 500) _bxNetFailureTick();
      else _bxNetSuccessTick();
      // Lê o body como texto bruto antes de tentar parsear como JSON.
      // Sem isso, se o servidor devolver HTML (página de erro 502, 404 do
      // proxy, etc), o JS quebra com "Unexpected token '<'" e o usuário
      // vê uma mensagem inútil. Aqui apanhamos isso e damos contexto real.
      return res.text().then(function (raw) {
        var data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (parseErr) {
          // Não era JSON — provavelmente HTML de erro do proxy/CDN
          var snippet = (raw || '').slice(0, 120).replace(/\s+/g, ' ').trim();
          var err = new Error(
            'Servidor respondeu HTTP ' + res.status + ' com conteúdo não-JSON' +
            (snippet ? ' ("' + snippet + '...")' : '')
          );
          err.status = res.status;
          err.raw = raw;
          console.error('[Blaxx] api(' + path + ') falhou:', err.message);
          throw err;
        }
        if (!res.ok) {
          var apiErr = new Error(data.error || ('HTTP ' + res.status));
          apiErr.data = data; apiErr.status = res.status;
          // 401 global: token invalido/expirado em qualquer endpoint
          // autenticado → limpa storage e manda pro login preservando destino.
          // Não dispara em paginas publicas (login, cadastro, recuperar, etc).
          // Não dispara em /auth/login porque ai é "credenciais invalidas" — UX
          // específica é feita pelo initLogin.
          if (res.status === 401 && path.indexOf('/auth/login') !== 0
              && path.indexOf('/auth/register') !== 0
              && path.indexOf('/auth/google') !== 0
              && path.indexOf('/auth/forgot') !== 0
              && path.indexOf('/auth/reset') !== 0) {
            try { STORE.clear(); } catch (e) {}
            var hereU = location.pathname + location.search;
            var publicPages = ['login.html','cadastro.html','recuperar-senha.html',
                               'redefinir-senha.html','validacao.html','index.html'];
            // só redireciona se nao estiver ja numa pagina publica
            if (publicPages.indexOf(PAGE) < 0) {
              location.href = '/login.html?next=' + encodeURIComponent(hereU);
            }
          }
          throw apiErr;
        }
        return data;
      });
    }, function (networkErr) {
      // fetch rejeitou (offline real, DNS, CORS etc) — falha de infra
      _bxNetFailureTick();
      throw networkErr;
    });
  }

  // Sanitiza URL pra evitar open redirect: só aceita paths relativos.
  function safeNext(raw, fallback) {
    fallback = fallback || '/dashboard';
    if (!raw || typeof raw !== 'string') return fallback;
    // bloqueia esquemas absolutos e protocol-relative (//evil.com)
    if (raw[0] !== '/' || raw[1] === '/' || raw.indexOf(':') !== -1) return fallback;
    return raw;
  }

  function requireAuth() {
    if (!STORE.token()) {
      // Preserva pra onde o usuario queria ir (sem .html é OK no Netlify)
      var here = location.pathname + location.search;
      location.href = '/login.html?next=' + encodeURIComponent(here);
      return false;
    }
    return true;
  }

  // ---- Banner proativo: Google-only → defina senha pra usar no Windows ----
  // Mostra um banner discreto no topo das páginas autenticadas quando o user
  // entrou via Google e ainda não tem senha local. Dismissível por 7 dias
  // (localStorage). Não aparece em /seguranca.html (lá já tem o CTA dedicado)
  // nem em telas públicas (login/cadastro).
  function maybeShowSetPasswordBanner() {
    var u = STORE.user();
    if (!u) return;
    // Critério: backend retornou has_password explicitamente false.
    // Se has_password vier undefined (backend antigo não expõe), pula.
    if (u.has_password !== false) return;
    // Páginas onde NÃO mostramos (já tem CTA dedicado ou são públicas)
    var skipPages = ['login.html','cadastro.html','recuperar-senha.html',
                     'redefinir-senha.html','validacao.html','seguranca.html'];
    if (skipPages.indexOf(PAGE) >= 0) return;
    // Dismissed?
    try {
      var dismissed = localStorage.getItem('blaxx_set_password_dismissed_at');
      if (dismissed) {
        var when = parseInt(dismissed, 10);
        var SEVEN_DAYS = 7 * 24 * 3600 * 1000;
        if (!isNaN(when) && (Date.now() - when) < SEVEN_DAYS) return;
      }
    } catch (e) { /* localStorage indisponível */ }
    if (document.getElementById('bx-setpwd-banner')) return; // idempotente

    var bar = document.createElement('div');
    bar.id = 'bx-setpwd-banner';
    bar.style.cssText =
      'position:sticky;top:0;z-index:50;background:#0B1820;color:#C6F432;' +
      'padding:10px 16px;display:flex;align-items:center;gap:12px;' +
      'font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12);';
    bar.innerHTML =
      '<span style="flex:1;">' +
        '🔑 Sua conta entra via Google. ' +
        '<strong style="color:#fff;">Defina uma senha</strong> para também usar o app do Windows.' +
      '</span>' +
      '<button id="bx-setpwd-cta" style="background:#C6F432;color:#0B1820;border:0;padding:7px 14px;' +
        'border-radius:18px;font-weight:700;cursor:pointer;font-size:12px;">Definir senha →</button>' +
      '<button id="bx-setpwd-later" style="background:transparent;color:#C6F432;border:1px solid rgba(198,244,50,.3);' +
        'padding:6px 10px;border-radius:18px;cursor:pointer;font-size:12px;">Mais tarde</button>';
    document.body.insertBefore(bar, document.body.firstChild);

    $('#bx-setpwd-cta').addEventListener('click', function () {
      // Manda pra /seguranca.html — lá já tem o botão "Receber link"
      location.href = '/seguranca.html';
    });
    $('#bx-setpwd-later').addEventListener('click', function () {
      try { localStorage.setItem('blaxx_set_password_dismissed_at', String(Date.now())); }
      catch (e) {}
      bar.remove();
    });
  }

  // ======================================================================
  // ROTINA: exige email verificado antes de operações sensíveis (compra)
  // ======================================================================
  // Chame requireEmailVerifiedThen(callback) ANTES de qualquer fluxo que
  // precise de email verificado. Se já está verificado, executa callback.
  // Se não, mostra modal inline com:
  //   1. Mensagem explicando que precisa confirmar email
  //   2. Botão "Reenviar código" → POST /auth/verify-email/send
  //   3. Input de 6 dígitos
  //   4. Botão "Verificar" → POST /auth/verify-email
  //   5. Após sucesso, fecha modal + executa callback original
  //
  // Estados:
  //   - sending: animação no botão de reenviar
  //   - sent: mostra "Código enviado para mar***@email.com"
  //   - verifying: animação no Verificar
  //   - success: marca email_verified_at em STORE.user() + chama callback
  //   - error: mostra mensagem inline (código inválido, expirado, etc)
  // ----------------------------------------------------------------------
  // Exposto como global para que scripts externos (ex: comprar-livre.js)
  // possam disparar a verificação de email antes de operações sensíveis.
  window.requireEmailVerifiedThen = function (cb) { return requireEmailVerifiedThen(cb); };
  function requireEmailVerifiedThen(callback) {
    var u = STORE.user();
    // Quick path: STORE indica que já está verificado
    if (u && (u.email_verified_at || u.email_verified)) {
      callback();
      return;
    }
    // Verifica via /auth/me em caso de STORE desatualizado (ex: user verificou
    // em outra aba; STORE local não sabe ainda)
    api('/auth/me').then(function (r) {
      var freshUser = r && (r.user || r);
      if (freshUser) STORE.setUser(freshUser);
      if (freshUser && (freshUser.email_verified_at || freshUser.email_verified)) {
        callback();
      } else {
        showEmailVerificationModal(freshUser || u || {}, callback);
      }
    }).catch(function () {
      // Sem /auth/me, mostra modal mesmo assim (assume não verificado)
      showEmailVerificationModal(u || {}, callback);
    });
  }

  function maskEmail(email) {
    if (!email) return '***';
    var parts = String(email).split('@');
    if (parts.length !== 2) return email;
    var local = parts[0];
    if (local.length <= 3) return local[0] + '***@' + parts[1];
    return local.slice(0, 3) + '***@' + parts[1];
  }

  function showEmailVerificationModal(user, onSuccess) {
    // Idempotente — se já houver modal aberto, só atualiza callback
    var existing = document.getElementById('bx-verify-modal');
    if (existing) existing.remove();

    var emailMasked = maskEmail(user.email || '');
    var overlay = document.createElement('div');
    overlay.id = 'bx-verify-modal';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9000;background:rgba(8,9,7,0.7);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:Inter,system-ui,sans-serif;';
    overlay.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:#fff;border-radius:14px;' +
        'max-width:440px;width:100%;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">' +
          '<div>' +
            '<div style="font-size:11px;color:#a83417;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Verificação necessária</div>' +
            '<h3 style="margin:6px 0 0;font-size:22px;color:#080907;">Confirme seu email</h3>' +
          '</div>' +
          '<button type="button" id="bx-verify-close" aria-label="Fechar" style="background:none;border:0;font-size:24px;cursor:pointer;color:#666;line-height:1;">×</button>' +
        '</div>' +
        '<p style="font-size:14px;color:#5f665e;line-height:1.5;margin:0 0 18px;">' +
          'Pra comprar pontos Blaxx, primeiro confirme o seu email. ' +
          'Vamos enviar um código de 6 dígitos para <strong style="color:#080907;">' + emailMasked + '</strong>.' +
        '</p>' +

        // Etapa 1: enviar código
        '<div id="bx-verify-step-send">' +
          '<button id="bx-verify-send-btn" type="button" class="button full" style="margin-bottom:12px;">Enviar código por email</button>' +
        '</div>' +

        // Etapa 2: input do código (escondido até enviar)
        '<div id="bx-verify-step-input" style="display:none;">' +
          '<div id="bx-verify-sent-msg" style="font-size:13px;color:#2d651b;background:#efffe6;padding:10px 12px;border-radius:8px;margin-bottom:14px;"></div>' +
          '<label for="bx-verify-code" style="display:block;font-size:13px;font-weight:700;color:#080907;margin-bottom:6px;">Código recebido</label>' +
          '<input id="bx-verify-code" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="000000" autocomplete="one-time-code" ' +
            'style="width:100%;padding:14px;font-size:24px;letter-spacing:0.4em;text-align:center;font-weight:700;' +
            'border:2px solid #e6eadf;border-radius:10px;outline:none;box-sizing:border-box;">' +
          '<button id="bx-verify-confirm-btn" type="button" class="button full" style="margin-top:14px;">Verificar e continuar</button>' +
          '<div style="text-align:center;margin-top:10px;">' +
            '<a href="#" id="bx-verify-resend" style="font-size:12px;color:#5f665e;text-decoration:underline;">Reenviar código</a>' +
          '</div>' +
        '</div>' +

        // Área de erro/feedback compartilhada
        '<p id="bx-verify-error" style="display:none;font-size:13px;color:#a83417;margin-top:10px;text-align:center;"></p>' +
      '</div>';
    document.body.appendChild(overlay);

    var sendBtn  = $('#bx-verify-send-btn');
    var confirmBtn = $('#bx-verify-confirm-btn');
    var codeInput = $('#bx-verify-code');
    var errEl   = $('#bx-verify-error');
    var sentMsg  = $('#bx-verify-sent-msg');
    var stepSend  = $('#bx-verify-step-send');
    var stepInput = $('#bx-verify-step-input');
    var closeBtn = $('#bx-verify-close');
    var resendLink = $('#bx-verify-resend');

    function showErr(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    function clearErr() { errEl.style.display = 'none'; errEl.textContent = ''; }

    function closeModal() {
      try { overlay.remove(); } catch (e) {}
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal(); // fecha clicando fora
    });

    function sendCode(isResend) {
      clearErr();
      var btnToUse = isResend ? resendLink : sendBtn;
      var origText = btnToUse.textContent;
      if (btnToUse === sendBtn) {
        sendBtn.disabled = true; sendBtn.textContent = 'Enviando…';
      } else {
        resendLink.style.opacity = '0.5'; resendLink.style.pointerEvents = 'none';
        resendLink.textContent = 'Enviando…';
      }
      api('/auth/verify-email/send', { method: 'POST', body: JSON.stringify({}) })
        .then(function (resp) {
          // Dev fallback: backend retorna _dev_code quando MAILER=console.
          // Auto-preenche o campo pra desbloquear teste sem email real.
          if (resp && resp._dev_code) {
            sentMsg.innerHTML =
              '<strong>[DEV] MAILER=console</strong> — código foi capturado direto do response. ' +
              'Pra produção, configure Resend.';
            stepSend.style.display = 'none';
            stepInput.style.display = 'block';
            codeInput.value = resp._dev_code;
            setTimeout(function () { codeInput.focus(); submitCode(); }, 200);
            return;
          }
          var deliverNote = resp && resp.delivered === false
            ? ' (⚠ provedor reportou falha no envio — confira Render Logs)'
            : '';
          sentMsg.textContent = '✓ Código enviado para ' + emailMasked + '.' + deliverNote +
            ' Confira sua caixa de entrada (e spam).';
          stepSend.style.display = 'none';
          stepInput.style.display = 'block';
          setTimeout(function () { codeInput.focus(); }, 50);
        })
        .catch(function (err) {
          if (err && err.status === 429) {
            showErr('Aguarde alguns segundos antes de pedir novo código.');
          } else if (err && err.status === 404) {
            showErr('Endpoint indisponível no servidor atual.');
          } else {
            showErr((err && err.message) || 'Falha ao enviar código. Tente novamente.');
          }
        })
        .then(function () {
          if (btnToUse === sendBtn) { sendBtn.disabled = false; sendBtn.textContent = origText; }
          else { resendLink.style.opacity = ''; resendLink.style.pointerEvents = ''; resendLink.textContent = origText; }
        });
    }
    sendBtn.addEventListener('click', function () { sendCode(false); });
    resendLink.addEventListener('click', function (e) { e.preventDefault(); sendCode(true); });

    function submitCode() {
      clearErr();
      var code = (codeInput.value || '').trim();
      if (!/^\d{6}$/.test(code)) { showErr('Digite os 6 dígitos do código.'); return; }
      confirmBtn.disabled = true; confirmBtn.textContent = 'Verificando…';
      api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ code: code }) })
        .then(function (r) {
          // Atualiza STORE.user com email_verified_at preenchido
          var freshUser = r && (r.user || r);
          if (freshUser && (freshUser.email_verified_at || freshUser.email_verified)) {
            STORE.setUser(freshUser);
          } else {
            // Resposta pode ser só {ok:true}. Marca manualmente.
            var cur = STORE.user() || {};
            cur.email_verified_at = new Date().toISOString();
            cur.email_verified = true;
            STORE.setUser(cur);
          }
          notify('Email confirmado! Seguindo pra compra…', 'ok');
          closeModal();
          // Executa callback original (ex: navegar pra comprar-livre)
          if (typeof onSuccess === 'function') onSuccess();
        })
        .catch(function (err) {
          var code2 = err && err.data && err.data.code;
          if (code2 === 'wrong_code') showErr('Código incorreto. Confira o email.');
          else if (code2 === 'code_expired' || code2 === 'token_expired') showErr('Código expirou. Reenvie um novo.');
          else if (code2 === 'too_many_attempts') showErr('Tentativas excedidas. Reenvie um novo código.');
          else showErr((err && err.message) || 'Falha ao verificar.');
          confirmBtn.disabled = false; confirmBtn.textContent = 'Verificar e continuar';
        });
    }
    confirmBtn.addEventListener('click', submitCode);
    codeInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') submitCode();
    });
    // Auto-submit quando completa 6 dígitos
    codeInput.addEventListener('input', function () {
      var v = (codeInput.value || '').replace(/\D/g, '').slice(0, 6);
      codeInput.value = v;
      if (v.length === 6) submitCode();
    });

    sendBtn.focus();
  }

  // ---- Helper: unifica topbar nav quando logado ----
  // Resolve 2 bugs reportados:
  //  1. Em paginas tipo parceiros/comprar-pontos/index, o BRAND e o link
  //     "Inicio" apontam pra index.html (marketing). Usuario logado clica
  //     e cai na landing publica — parece "deslogou".
  //  2. Topbar tem CONJUNTOS DIFERENTES de links entre paginas (dashboard
  //     tem 5, parceiros tem 6 outros). Navegar = "links somem".
  //
  // Solucao: quando logado, reescreve TODOS os topbars com o mesmo conjunto
  // canonico. Brand → dashboard. Links canonicos + aria-current na pagina ativa.
  // ---------------------------------------------------------------------------
  function unifyTopbarLinksWhenLoggedIn() {
    if (!STORE.token()) return;
    var nav = document.querySelector('header.topbar nav.nav');
    if (!nav) return;

    // Brand sempre aponta pra dashboard quando logado
    var brand = nav.querySelector('.brand');
    if (brand && brand.getAttribute('href') !== '/dashboard.html') {
      brand.setAttribute('href', '/dashboard.html');
    }

    // Reescreve .links com conjunto canonico (mesmo em todas as paginas).
    // Cobre 7 destinos principais que sao relevantes pra usuario logado.
    var links = nav.querySelector('.links');
    if (!links) return;

    var pageBase = PAGE.replace('.html', '');
    // Menu superior FIXO (pedido do usuario: aparecem sempre, em qualquer
    // pagina, independente do que foi clicado). Reflete a navegacao
    // institucional do produto. Funcoes pessoais (Carteira, Extrato,
    // Campanhas, Indique) ficam na sidebar lateral.
    var menuItems = [
      { id: 'dashboard',      href: '/dashboard.html',      label: 'Início' },
      { id: 'como-funciona',  href: '/como-funciona.html',  label: 'Como funciona' },
      { id: 'parceiros',      href: '/parceiros.html',      label: 'Parceiros' },
      { id: 'resgates',       href: '/resgates.html',       label: 'Resgates' },
      { id: 'comprar-pontos', href: '/comprar-pontos.html', label: 'Comprar pontos' },
      { id: 'venda-pontos',   href: '/venda-pontos.html',   label: 'Vender pontos' }
    ];
    // "Inicio" ativa pra dashboard, index e qualquer pagina nao mapeada.
    // "Vender pontos" cobre as 2 paginas existentes (venda + vender legado).
    var activeId = pageBase;
    if (pageBase === 'index') activeId = 'dashboard';
    if (pageBase === 'vender-pontos') activeId = 'venda-pontos';

    links.innerHTML = menuItems.map(function (it) {
      var active = (it.id === activeId) ? ' aria-current="page"' : '';
      var activeClass = (it.id === activeId) ? ' active' : '';
      return '<a href="' + it.href + '" data-link="' + it.id + '" class="' + activeClass.trim() + '"' + active + '>' +
        it.label + '</a>';
    }).join('');
  }

  // ---- Helper: atualiza icones de sidebars hardcoded no HTML ----
  // Paginas como dashboard.html, carteira.html, extrato.html, perfil.html,
  // seguranca.html etc tem sidebar inline com simbolos geometricos antigos
  // (●, ◆, ≡, ⊙, ★, ✓, ▲, +, −, →, ♥, ⚙, 🔒, ?, ↩).
  // Reescreve cada badge .ic baseado no data-side do <a> ancestral. Mais
  // robusto que match por texto. Cobre 100% das sidebars em runtime.
  var SIDEBAR_ICON_BY_SIDE = {
    'dashboard':      '🏠',
    'carteira':       '💳',
    'extrato':        '📊',
    'parceiros':      '🏬',
    'resgates':       '🎁',
    'meus-resgates':  '🎟️',
    'campanhas':      '🎯',
    'comprar-pontos': '💰',
    'venda-pontos':   '💼',
    'vender-pontos':  '💼',
    'enviar-pontos':  '📤',
    'indique':        '💝',
    'indique-ganhe':  '💝',
    'perfil':         '👤',
    'seguranca':      '🔐',
    'ajuda':          '💬',
    'central-ajuda':  '💬',
    'sair':           '🚪',
    'logout':         '🚪'
  };
  function upgradeHardcodedSidebarIcons() {
    var sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;
    sidebar.querySelectorAll('a[data-side]').forEach(function (a) {
      var side = a.getAttribute('data-side');
      var newIcon = SIDEBAR_ICON_BY_SIDE[side];
      if (!newIcon) return;
      var ic = a.querySelector('.ic');
      if (ic) ic.textContent = newIcon;
    });
    // Cobre links de "Sair" hardcoded — alguns templates tem so
    // <a href="login.html">Sair</a> sem data attribute. Detecta por
    // href (login.html) + texto (Sair/Logout).
    sidebar.querySelectorAll('a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var txt = (a.textContent || '').toLowerCase();
      var isLogout = (
        a.hasAttribute('data-bx-logout-side') ||
        a.hasAttribute('data-bx-logout') ||
        (/login(\.html)?(\?|#|$)/.test(href) && (txt.indexOf('sair') >= 0 || txt.indexOf('logout') >= 0))
      );
      if (!isLogout) return;
      var ic = a.querySelector('.ic');
      if (ic) ic.textContent = '🚪';
    });
  }

  // ---- Helper: oculta TODOS os links de login/cadastro quando logado ----
  // Cobre casos que replaceLandingCtaWithUserWidget nao alcanca:
  //  - <li><a href="login.html">Entrar</a></li> no footer "Conta"
  //  - <a href="cadastro.html"> isolados em CTAs no body
  //  - .auth-foot ("Já tem conta? Entrar" / "Não tem conta? Cadastre-se")
  //  - Botões "Sign in" / "Cadastrar" em qualquer outro lugar
  //
  // Estrategia: scan global de <a> com href para login/cadastro. Oculta o
  // <li> pai (se for de lista) ou o proprio <a> (se nao). Pula explicitos
  // de logout (data-bx-logout, data-bx-logout-side) e links de Sair.
  function hideAuthLinksWhenLoggedIn() {
    if (!STORE.token()) return; // so age quando logado

    var anchors = document.querySelectorAll(
      'a[href="login.html"], a[href="/login.html"], a[href="/login"],' +
      'a[href="cadastro.html"], a[href="/cadastro.html"], a[href="/cadastro"]'
    );
    anchors.forEach(function (a) {
      // Pula link explicito de logout (usa /login.html como destino apos clear)
      if (a.hasAttribute('data-bx-logout') || a.hasAttribute('data-bx-logout-side')) return;
      var txt = (a.textContent || '').trim().toLowerCase();
      if (txt.indexOf('sair') >= 0 || txt.indexOf('logout') >= 0) return;
      // Pula se ja for o widget de "Olá, nome" (botao secondary refeito)
      if (txt.indexOf('olá') === 0) return;

      // Oculta o <li> pai se estiver em lista (limpa o item inteiro do footer)
      var li = a.closest('li');
      var auth = a.closest('.auth-foot');
      if (auth) {
        // Linhas "Já tem conta? Entrar" / "Não tem conta? Cadastre-se" — esconde a frase inteira
        auth.style.display = 'none';
      } else if (li) {
        li.style.display = 'none';
      } else {
        a.style.display = 'none';
      }
    });
  }

  // ---- Helper: cta-row de páginas marketing vira widget de user logado ----
  // Páginas como comprar-pontos.html, vender-pontos.html, resgates.html,
  // parceiros.html, index.html têm:
  //   <div class="cta-row">
  //     <a href="login.html" class="button ghost">Entrar</a>
  //     <a href="cadastro.html" class="button">Cadastre-se</a>
  //   </div>
  // Quando logado, troca por: 🔔 + "Olá, Nome" + Sair, igual ao dashboard.
  function replaceLandingCtaWithUserWidget(firstName) {
    var ctaRows = $$('.cta-row');
    if (!ctaRows.length) return;
    ctaRows.forEach(function (row) {
      // Detecta padrão "Entrar/Cadastre-se"
      var hasEntrar = false;
      row.querySelectorAll('a').forEach(function (a) {
        var txt = a.textContent.trim().toLowerCase();
        if (txt === 'entrar' || txt === 'cadastre-se' || txt === 'cadastrar') hasEntrar = true;
      });
      if (!hasEntrar) return; // já é versão logada
      // Substitui o conteúdo da cta-row.
      // IMPORTANTE: o botao de logout mostra "Sair" explicitamente (antes
      // era so o icone ↩, que usuario confundia com "voltar" e clicava
      // sem querer, derrubando a sessao). Em mobile pequeno (<=480px) o
      // CSS abaixo esconde o texto e mantem so o icone na area compacta.
      row.innerHTML =
        '<a href="central-notificacoes.html" class="button ghost" aria-label="Notificações" title="Notificações">🔔</a>' +
        '<a href="perfil.html" class="button secondary">Olá, ' + firstName + '</a>' +
        '<a href="login.html" class="button ghost" data-bx-logout="1" aria-label="Sair" title="Sair">' +
          '<span class="bx-logout-label">Sair</span>' +
          '<span style="margin-left:6px;" aria-hidden="true">⎋</span>' +
        '</a>';
      // Wire o handler de logout no link novo
      var logoutLink = row.querySelector('[data-bx-logout]');
      if (logoutLink) {
        logoutLink.addEventListener('click', function (e) {
          e.preventDefault();
          api('/auth/logout', { method: 'POST' }).catch(function () {}).then(function () {
            STORE.clear();
            location.href = '/login.html';
          });
        });
      }
    });
  }

  // ---- Helper: injeta sidebar nas páginas de OPERAÇÃO logadas sem ela ----
  // Garante "navegabilidade pelo menu lateral" mesmo nas páginas que
  // historicamente eram "marketing/landing" (comprar-pontos, vender-pontos,
  // resgates, parceiros) — quando o usuário está logado.
  //
  // Estratégia: detecta páginas sem .sidebar mas com <main>, envolve em
  // .app-shell e prepende o aside com o menu padrão (mesmos itens do
  // dashboard).
  function injectSidebarIfMissing(user) {
    // Já tem sidebar? nada a fazer.
    if (document.querySelector('aside.sidebar')) return;

    // Páginas onde NÃO injetamos (truly public OR checkout/standalone)
    var skip = ['index.html','login.html','cadastro.html','recuperar-senha.html',
                'redefinir-senha.html','validacao.html','termos.html',
                'documentos-termos.html','como-funciona.html','comprar-livre.html',
                'sitemap.html','manutencao.html','404.html','splash.html',
                'app.html','admin.html','design-system.html','convite.html'];
    if (skip.indexOf(PAGE) >= 0) return;

    // Precisa de um <main> pra envolver
    var mainEl = document.querySelector('main.shell, main');
    if (!mainEl) return;

    // Side ativo: lê data-link do header, ou usa o PAGE
    var pageBase = PAGE.replace('.html', '');

    // Icones alegres (emojis coloridos) substituindo simbolos geometricos
    // antigos. Pedido: "icones mais alegres e 1,5x maior que o atual".
    // Tamanho dos badges aumentado via CSS (.side-nav .ic).
    var sideMenu = [
      { id: 'dashboard',     icon: '🏠', label: 'Início',         href: 'dashboard.html' },
      { id: 'carteira',      icon: '💳', label: 'Carteira',       href: 'carteira.html' },
      { id: 'extrato',       icon: '📊', label: 'Extrato',        href: 'extrato.html' },
      { id: 'parceiros',     icon: '🏬', label: 'Parceiros',      href: 'parceiros.html' },
      { id: 'resgates',      icon: '🎁', label: 'Resgates',       href: 'resgates.html' },
      { id: 'meus-resgates', icon: '🎟️', label: 'Meus resgates',  href: 'meus-resgates.html' },
      { id: 'campanhas',     icon: '🎯', label: 'Campanhas',      href: 'campanhas.html' },
      { id: 'comprar-pontos',icon: '💰', label: 'Comprar pontos', href: 'comprar-pontos.html' },
      { id: 'venda-pontos',  icon: '💼', label: 'Vender pontos',  href: 'venda-pontos.html' },
      { id: 'enviar-pontos', icon: '📤', label: 'Enviar pontos',  href: 'enviar-pontos.html' },
      { id: 'indique',       icon: '💝', label: 'Indique e ganhe',href: 'indique-ganhe.html' }
    ];
    var sideFoot = [
      { id: 'perfil',    icon: '👤', label: 'Perfil',     href: 'perfil.html' },
      { id: 'seguranca', icon: '🔐', label: 'Segurança',  href: 'seguranca.html' },
      { id: 'ajuda',     icon: '💬', label: 'Ajuda',      href: 'central-ajuda.html' }
    ];
    var avatarLetter = ((user.name || '?')[0] || '?').toUpperCase();
    function buildItems(items) {
      return items.map(function (it) {
        var active = (pageBase === it.id) ? ' style="background:var(--black);color:var(--lime);font-weight:700;"' : '';
        return '<li><a href="' + it.href + '" data-side="' + it.id + '"' + active + '><span class="ic">' + it.icon + '</span> ' + it.label + '</a></li>';
      }).join('');
    }
    var sidebarHtml =
      '<div class="side-user">' +
        '<div class="avatar">' + avatarLetter + '</div>' +
        '<div>' +
          '<div class="side-user-name">' + (user.name || '') + '</div>' +
          '<div class="side-user-tier">Plano Plus</div>' +
        '</div>' +
      '</div>' +
      '<ul class="side-nav">' + buildItems(sideMenu) + '</ul>' +
      '<div class="side-foot"><ul class="side-nav">' + buildItems(sideFoot) +
        '<li><a href="#" data-bx-logout-side="1"><span class="ic">↩</span> Sair</a></li>' +
      '</ul></div>';

    // Cria o <aside> e wrapper .app-shell
    var aside = document.createElement('aside');
    aside.className = 'sidebar';
    aside.innerHTML = sidebarHtml;

    var wrapper = document.createElement('div');
    wrapper.className = 'app-shell';

    // Pega o pai do <main>, faz: <wrapper>[<aside>][<main>]</wrapper>
    var parent = mainEl.parentNode;
    parent.insertBefore(wrapper, mainEl);
    wrapper.appendChild(aside);
    wrapper.appendChild(mainEl);

    // Wire logout do sidebar
    var sideLogout = aside.querySelector('[data-bx-logout-side]');
    if (sideLogout) {
      sideLogout.addEventListener('click', function (e) {
        e.preventDefault();
        api('/auth/logout', { method: 'POST' }).catch(function () {}).then(function () {
          STORE.clear();
          location.href = '/login.html';
        });
      });
    }
  }

  // ---- Substitui textos hardcoded da Mariana pelos do user logado ----
  // Em duas etapas:
  //   1. Imediato — usa apenas STORE.user(), troca nome/avatar/botao "Olá".
  //      Funciona mesmo se /wallet/ falhar ou demorar.
  //   2. Async — busca saldo via /wallet/ e troca valores numericos.
  function applyUserToShell() {
    var u = STORE.user();
    if (!u) return;
    var firstName = (u.name || '').split(' ')[0] || 'Convidado';
    var avatarLetter = ((u.name || '?')[0] || '?').toUpperCase();

    // === 1. IMEDIATO — depende só do STORE.user ===
    // Avatar (1a letra do nome)
    $$('.avatar').forEach(function (a) { a.textContent = avatarLetter; });
    // Nome na sidebar
    $$('.side-user-name').forEach(function (n) { n.textContent = u.name; });
    // Botão "Olá, Mariana" no navbar
    $$('a.button.secondary').forEach(function (b) {
      if (b.textContent.trim().indexOf('Olá') === 0) {
        b.textContent = 'Olá, ' + firstName;
      }
    });
    // Páginas estilo "marketing/landing" (comprar-pontos, vender, resgates,
    // parceiros) têm cta-row com "Entrar/Cadastre-se" em vez de "Olá X".
    // Quando logado, substitui pelo widget de user (notificações + nome + sair).
    replaceLandingCtaWithUserWidget(firstName);

    // Oculta QUALQUER outro link de "Entrar/Cadastre-se" que tenha escapado
    // do replaceLandingCtaWithUserWidget (footers, body, auth-foots).
    // Usuario logado nunca deve ver convite pra logar de novo.
    hideAuthLinksWhenLoggedIn();

    // Unifica topbar nav (brand → dashboard, links canonicos) para que TODAS
    // as paginas logadas tenham o mesmo menu superior. Antes:
    //  - dashboard tinha 5 links, parceiros tinha 6 (diferentes) → "links somem"
    //  - brand em parceiros/index/comprar apontava pra index.html (publica)
    //    → clicar no logo "deslogava" visualmente
    unifyTopbarLinksWhenLoggedIn();

    // Injeta sidebar dinamicamente em páginas de OPERAÇÃO logadas que estão
    // sem ela (comprar-pontos, vender-pontos, resgates, parceiros). Garante
    // navegabilidade entre as áreas do app sem voltar ao dashboard.
    injectSidebarIfMissing(u);

    // Atualiza icones de sidebars HARDCODED no HTML (dashboard, carteira,
    // extrato, perfil, seguranca etc tem sidebar inline com simbolos
    // geometricos antigos). Reescreve os badges .ic via data-side.
    upgradeHardcodedSidebarIcons();

    // Substituicao de texto generica (cobre <strong>Mariana Costa</strong> etc)
    // — passa um wallet "vazio" pra nao tocar nos numericos ainda
    replaceHardcoded({ balance_pts: 0, pending_pts: 0, balance_brl_equiv: 0 }, { skip_numeric: true });

    // Prefill de inputs marcados com data-bx-prefill="name|email|phone"
    // (so preenche se vazio — nao sobrescreve digitação do usuario)
    $$('input[data-bx-prefill]').forEach(function (inp) {
      if (inp.value) return;
      var field = inp.getAttribute('data-bx-prefill');
      if (field === 'name')  inp.value = u.name || '';
      else if (field === 'email') inp.value = u.email || '';
      else if (field === 'phone') inp.value = u.phone || '';
    });

    // Banner pro-active "defina senha" pra Google-only users
    maybeShowSetPasswordBanner();

    // === 2. ASYNC — depende de /wallet/ ===
    api('/wallet/').then(function (w) {
      $$('.side-user-tier').forEach(function (n) {
        n.textContent = 'Plano Plus · ' + fmt(w.balance_pts) + ' pts';
      });
      replaceHardcoded(w);
    }).catch(function () { /* sem wallet (404/401/offline): mantem so o nome */ });
  }

  function replaceHardcoded(w, opts) {
    opts = opts || {};
    var skipNumeric = !!opts.skip_numeric;
    var u = STORE.user() || {};
    var firstName = (u.name || '').split(' ')[0] || 'Convidado';
    var fullName = u.name || 'Convidado';
    var saldo = w.balance_pts || 0;
    var pending = w.pending_pts || 0;
    var saldoStr = fmt(saldo);
    var pendStr = fmt(pending);
    var brlStr = (w.balance_brl_equiv || 0).toFixed(2).replace('.', ',');
    var META = 100000;
    var faltam = Math.max(0, META - saldo);
    var pctMeta = Math.min(100, Math.round((saldo / META) * 100));

    // Walk no DOM substituindo TODOS os valores hardcoded da Mariana
    // pelos dados reais. NÃO usa innerHTML pra preservar event listeners.
    function walk(node) {
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        var orig = t;
        if (!skipNumeric) {
          // Saldo total
          t = t.replace(/84\.750/g, saldoStr);
          t = t.replace(/R\$ 847,50/g, 'R$ ' + brlStr);
          // "Disponíveis" (era 82.300 - subset do saldo)
          t = t.replace(/82\.300/g, saldoStr);
          // "Pendentes" / "Próx. expirar" (eram 2.450)
          t = t.replace(/2\.450/g, pendStr);
          // "Faltam X pts" (era 15.250)
          t = t.replace(/15\.250/g, fmt(faltam));
          // Progresso (era "85%")
          t = t.replace(/\b85%/g, pctMeta + '%');
        }
        // Nome (sempre, independente de skip_numeric)
        if (t.indexOf('Mariana Costa') >= 0) t = t.replace(/Mariana Costa/g, fullName);
        if (t.indexOf('Mariana') >= 0) t = t.replace(/Mariana/g, firstName);
        if (t !== orig) node.nodeValue = t;
      } else if (node.nodeType === 1 && ['SCRIPT','STYLE','INPUT','TEXTAREA'].indexOf(node.nodeName) === -1) {
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    }
    walk(document.body);

    // Progress bar (style="width: 85%" hardcoded)
    $$('[style*="width: 85%"], [style*="width:85%"]').forEach(function (el) {
      el.style.width = pctMeta + '%';
    });

    // Avatares grandes que mostram "M" hardcoded
    $$('.avatar-letter, .user-letter').forEach(function (el) {
      el.textContent = (fullName[0] || '?').toUpperCase();
    });
  }

  // =========================================================================
  // GOOGLE SIGN-IN
  // =========================================================================
  // Renderiza o botão oficial do Google no container #g-signin-btn de qualquer
  // página que tenha esse elemento. Quando o usuário aceita, o Google chama
  // handleGoogleCredential() com um ID token JWT. Mandamos para o backend
  // /auth/google que valida, cria User+Wallet se for novo, e devolve nosso
  // JWT Blaxx. Salvamos token + user e redirecionamos pro dashboard.
  function initGoogleSignIn() {
    var container = document.getElementById('g-signin-btn');
    if (!container) return;

    var clientId = window.BLAXX_GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      // Sem Client ID configurado → esconde o botão pra não dar UX quebrada.
      container.style.display = 'none';
      var divider = container.previousElementSibling;
      if (divider && divider.classList.contains('auth-divider')) divider.style.display = 'none';
      return;
    }

    // Aguarda o SDK carregar (script com async defer). Cap em 8s pra não
    // ficar em loop infinito se o GSI estiver bloqueado.
    var attempts = 0;
    function tryRender() {
      if (!(window.google && window.google.accounts && window.google.accounts.id)) {
        if (++attempts > 100) {
          console.error('[Blaxx] Google Identity Services nunca carregou. Adblock ou erro de rede?');
          showGoogleError('Não foi possível carregar o login Google. Verifique se há bloqueador de anúncios.');
          return;
        }
        return setTimeout(tryRender, 80);
      }
      try {
        // Nonce anti-replay: gera 32 bytes aleatórios, armazena na sessão,
        // passa pro GIS. Backend valida que o id_token.nonce bate.
        var nonce = '';
        try {
          var arr = new Uint8Array(24);
          (window.crypto || window.msCrypto).getRandomValues(arr);
          nonce = Array.from(arr).map(function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        } catch (e) {
          // Fallback fraco — só pra browsers MUITO antigos. Não usa em prod sério.
          nonce = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        }
        sessionStorage.setItem('blaxx_google_nonce', nonce);

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
          use_fedcm_for_prompt: true,
          nonce: nonce,                      // anti-replay
        });
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 320,
        });
        console.log('[Blaxx] Google Sign-In button rendered ✓');
      } catch (err) {
        console.error('[Blaxx] GSI renderButton failed:', err);
        showGoogleError('Falha ao inicializar Google Sign-In: ' + (err.message || err));
      }
    }
    tryRender();
  }

  function showGoogleError(msg) {
    var errEl = document.getElementById('g-signin-error');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  function handleGoogleCredential(response) {
    var err = document.getElementById('g-signin-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }

    if (!response || !response.credential) {
      if (err) {
        err.textContent = 'Não recebemos token do Google. Tente novamente.';
        err.style.display = 'block';
      }
      return;
    }

    // Anti-replay: backend valida que id_token.nonce bate com este valor.
    var nonce = sessionStorage.getItem('blaxx_google_nonce') || '';
    sessionStorage.removeItem('blaxx_google_nonce');  // single-use

    api('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: response.credential, nonce: nonce }),
    })
      .then(function (r) {
        STORE.setToken(r.token);
        STORE.setUser(r.user);
        notify('Bem-vindo, ' + (r.user.name || '').split(' ')[0] + '!', 'ok');
        var next = safeNext(new URLSearchParams(location.search).get('next'));
        setTimeout(function () { location.href = next; }, 350);
      })
      .catch(function (e) {
        if (err) {
          err.textContent = e.message || 'Falha ao validar Google login';
          err.style.display = 'block';
        } else {
          notify(e.message || 'falha no login Google', 'err');
        }
      });
  }

  // =========================================================================
  // PER-PAGE INIT
  // =========================================================================

  function initLogin() {
    var form = document.querySelector('form[action="dashboard.html"]');
    if (!form) return;
    // Botão "Entrar com Google" (se Client ID estiver configurado)
    initGoogleSignIn();

    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = $('#email').value.trim().toLowerCase();
      var password = $('#password').value;
      if (!email || !password) { notify('Preencha e-mail e senha', 'warn'); return; }
      var btn = form.querySelector('button.button');
      var orig = btn.textContent; btn.disabled = true; btn.textContent = 'Entrando...';

      api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) })
        .then(function (r) {
          // Resposta pode ser:
          //  - Login direto: { token, user }
          //  - 2FA pendente: { mfa_required: true, mfa_challenge_token, mfa_phone_hint, mfa_method }
          if (r && r.mfa_required) {
            showMfaChallenge(r);
            btn.disabled = false; btn.textContent = orig;
            return;
          }
          STORE.setToken(r.token); STORE.setUser(r.user);
          var next = safeNext(new URLSearchParams(location.search).get('next'));
          location.href = next;
        })
        .catch(function (e) {
          var code = e.data && e.data.code;
          if (code === 'email_not_verified') {
            notify('Confirme seu email para entrar. Reenviando link...', 'warn');
            api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: email }) }).catch(function () {});
            setTimeout(function () { location.href = '/validacao.html'; }, 1500);
          } else {
            notify(e.message || 'Credenciais inválidas', 'err');
          }
          btn.disabled = false; btn.textContent = orig;
        });
    });
  }

  // ---- Renderiza o passo de challenge 2FA in-place sobre o form de login ----
  function showMfaChallenge(challengeResp) {
    var form = document.querySelector('form[action="dashboard.html"]');
    if (!form) return;
    // Esconde form de login original
    form.style.display = 'none';

    // Constroi (uma unica vez) o card de challenge
    var existing = document.getElementById('bx-mfa-card');
    if (existing) existing.remove();
    var card = document.createElement('div');
    card.id = 'bx-mfa-card';
    card.style.cssText = 'max-width:420px;margin:0 auto;';
    card.innerHTML =
      '<h2 style="margin:0 0 8px;">Verificação em duas etapas</h2>' +
      '<p style="color:var(--muted);font-size:14px;">' +
        'Enviamos um código por SMS para <strong>' + (challengeResp.mfa_phone_hint || 'seu telefone') + '</strong>. ' +
        'Insira o código de 6 dígitos para entrar.' +
      '</p>' +
      '<div class="form-row" style="margin-top:14px;">' +
        '<label for="bx-mfa-code">Código</label>' +
        '<input id="bx-mfa-code" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="000000" autocomplete="one-time-code" ' +
          'style="font-size:24px;letter-spacing:0.4em;text-align:center;font-weight:800;">' +
      '</div>' +
      '<button id="bx-mfa-submit" type="button" class="button full lg" style="margin-top:8px;">Validar e entrar →</button>' +
      '<p style="margin-top:10px;text-align:center;font-size:13px;color:var(--muted);">' +
        'O código expira em alguns minutos. ' +
        '<a href="#" id="bx-mfa-retry" style="color:var(--ink);font-weight:700;">Voltar e tentar novamente</a>' +
      '</p>' +
      '<p id="bx-mfa-err" style="display:none;color:#a83417;text-align:center;font-size:13px;margin-top:6px;"></p>';
    form.parentNode.insertBefore(card, form);
    var codeInput = document.getElementById('bx-mfa-code');
    if (codeInput) codeInput.focus();

    var submit = document.getElementById('bx-mfa-submit');
    var errEl = document.getElementById('bx-mfa-err');
    function showErr(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    function clearErr() { if (errEl) errEl.style.display = 'none'; }

    submit.addEventListener('click', function () {
      clearErr();
      var code = (codeInput && codeInput.value || '').trim();
      if (!/^\d{6}$/.test(code)) { showErr('Código de 6 dígitos'); return; }
      submit.disabled = true; submit.textContent = 'Validando…';
      api('/auth/login/2fa', { method: 'POST', body: JSON.stringify({
        challenge_token: challengeResp.mfa_challenge_token, code: code
      }) }).then(function (r) {
        STORE.setToken(r.token); STORE.setUser(r.user);
        var next = safeNext(new URLSearchParams(location.search).get('next'));
        location.href = next;
      }).catch(function (e) {
        var code2 = e.data && e.data.code;
        if (code2 === 'wrong_code') showErr('Código incorreto. Verifique o SMS.');
        else if (code2 === 'code_expired' || code2 === 'challenge_expired') showErr('Código expirado. Volte e tente novamente.');
        else showErr(e.message || 'Falha ao validar código');
        submit.disabled = false; submit.textContent = 'Validar e entrar →';
      });
    });

    codeInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') submit.click();
    });

    var retry = document.getElementById('bx-mfa-retry');
    if (retry) {
      retry.addEventListener('click', function (ev) {
        ev.preventDefault();
        card.remove();
        form.style.display = '';
      });
    }
  }

  function initDashboard() {
    if (!requireAuth()) return;
    applyUserToShell();
    // Adiciona handler de logout no link "Sair"
    $$('a').forEach(function (a) {
      if (a.getAttribute('href') === 'login.html' && a.textContent.indexOf('Sair') >= 0) {
        a.addEventListener('click', function (e) { STORE.clear(); });
      }
    });

    // FAB: Escanear QR (demo do leitor de camera)
    var fab = document.createElement('button');
    fab.id = 'bx-scan-fab';
    fab.title = 'Escanear QR de parceiro';
    fab.innerHTML = '⊞';
    fab.style.cssText =
      'position:fixed;bottom:20px;left:20px;z-index:8000;width:56px;height:56px;' +
      'background:#080907;color:#C6F432;border:0;border-radius:50%;font-size:24px;' +
      'box-shadow:0 12px 32px rgba(0,0,0,.18);cursor:pointer;';
    fab.addEventListener('click', function () {
      window.blaxxScanQR(function (code) {
        if (code) notify('QR lido: ' + code.substring(0, 40) + '…', 'ok');
      });
    });
    document.body.appendChild(fab);
  }

  function initComprarPontos() {
    // Mapeia cada cartão de pacote para o package_key do backend
    var cards = $$('.price-card');
    var keys = ['start', 'plus', 'prime', 'black'];
    cards.forEach(function (card, i) {
      var pkgKey = keys[i] || 'plus';
      var btn = card.querySelector('a.button');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!requireAuth()) return;
        btn.style.opacity = '.6'; btn.textContent = 'Gerando PIX...';
        api('/pix/charge', { method: 'POST', body: JSON.stringify({ package: pkgKey }) })
          .then(function (charge) {
            STORE.setFlow('charge', charge);
            location.href = '/pagamento-pix';
          })
          .catch(function (err) {
            notify(err.message, 'err');
            btn.style.opacity = '1'; btn.textContent = 'Comprar agora';
          });
      });
    });
  }

  function initPagamentoPix() {
    if (!requireAuth()) return;
    var charge = STORE.getFlow('charge');
    if (!charge) {
      notify('Nenhuma cobrança ativa - voltando para pacotes', 'warn');
      setTimeout(function () { location.href = '/comprar-pontos'; }, 1500);
      return;
    }
    renderPixCharge(charge);
    startChargePolling(charge.id);
  }

  function renderPixCharge(charge) {
    // QR Code real do MP (PNG base64 em data-URI). Se o provider não devolveu
    // (ex: mock), esconde a img e mantém o copia-e-cola visível.
    var img = $('#bx-qr-img');
    var placeholder = $('#bx-qr-placeholder');
    if (img && charge.qr_code_image) {
      img.src = charge.qr_code_image;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else if (placeholder) {
      placeholder.textContent = 'QR não disponível — use o código copia-e-cola';
    }

    // BR Code copia-e-cola
    var brEl = $('#bx-brcode-text');
    if (brEl) brEl.textContent = charge.br_code || '—';
    var copyBtn = $('#bx-brcode-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var range = document.createRange();
        range.selectNode(brEl);
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        try {
          document.execCommand('copy');
          copyBtn.textContent = '✓ Copiado';
          setTimeout(function () { copyBtn.textContent = 'Copiar'; }, 2000);
        } catch (e) { /* silent */ }
        sel.removeAllRanges();
      });
    }

    // Resumo lateral
    var pkgEl = $('#bx-summary-pkg');
    if (pkgEl) pkgEl.textContent = charge.package === 'custom' ? 'Valor livre' : (charge.package || '—');
    var ptsEl = $('#bx-summary-pts');
    if (ptsEl) ptsEl.textContent = '+' + fmt(charge.points_to_credit || 0) + ' pts';
    var amtEl = $('#bx-summary-amt');
    if (amtEl) amtEl.textContent = brl(charge.amount_brl);
  }

  function startChargePolling(chargeId) {
    var pill = $('#bx-status-pill');
    var handle = setInterval(function () {
      api('/pix/charge/' + chargeId).then(function (c) {
        if (c.status === 'paid') {
          clearInterval(handle);
          if (pill) {
            pill.style.background = 'var(--ok-soft, #efffe6)';
            pill.style.color = 'var(--ok-text, #2d651b)';
            pill.textContent = '✓ Pagamento confirmado';
          }
          STORE.setFlow('charge_paid', c);
          setTimeout(function () { location.href = '/compra-aprovada'; }, 1200);
        } else if (c.status === 'expired' || c.status === 'rejected') {
          clearInterval(handle);
          if (pill) {
            pill.style.background = '#ffede8';
            pill.style.color = '#a83417';
            pill.textContent = c.status === 'expired' ? '⏱ Expirado' : '✗ Rejeitado';
          }
        }
      }).catch(function () { /* silent retry */ });
    }, 4000);
  }

  function initCompraAprovada() {
    if (!requireAuth()) return;
    var paid = STORE.getFlow('charge_paid');
    if (!paid) return;
    var box = document.createElement('div');
    box.className = 'card lime';
    box.style.cssText = 'padding:24px;margin:24px auto;max-width:720px;';
    box.innerHTML =
      '<h2 style="margin:0 0 6px;">Compra confirmada pelo backend</h2>' +
      '<div class="dl mt-2">' +
        '<div><span class="k">Pacote</span><span class="v">' + paid.package + '</span></div>' +
        '<div><span class="k">Valor</span><span class="v">' + brl(paid.amount_brl) + '</span></div>' +
        '<div><span class="k">Pontos creditados</span><span class="v" style="color:var(--ok-text);font-weight:700;">+' + fmt(paid.points_to_credit) + ' pts</span></div>' +
        '<div><span class="k">TXID</span><span class="v" style="font-family:monospace;font-size:11px;">' + paid.txid + '</span></div>' +
        '<div><span class="k">Pago em</span><span class="v">' + new Date(paid.paid_at).toLocaleString('pt-BR') + '</span></div>' +
      '</div>';
    var host = $('main') || document.body;
    host.insertBefore(box, host.firstChild);
  }

  function initEnviarPontos() {
    if (!requireAuth()) return;
    applyUserToShell();
    var form = document.querySelector('form[action="confirmar-envio.html"]');
    if (!form) return;

    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var inputs = form.querySelectorAll('input, textarea');
      var to = inputs[0].value.trim();
      var amount = parseInt(inputs[1].value || '0');
      var msg = (form.querySelector('textarea') || {}).value || '';
      var pwd = form.querySelector('input[type="password"]').value;

      if (!to) return notify('Informe o destinatário', 'warn');
      if (amount < 100) return notify('Mínimo 100 pts', 'warn');
      if (!pwd) return notify('Informe sua senha', 'warn');

      STORE.setFlow('transfer_pending', { to: to, amount_pts: amount, message: msg, password: pwd });
      location.href = '/confirmar-envio';
    });
  }

  function initConfirmarEnvio() {
    if (!requireAuth()) return;
    applyUserToShell();
    var p = STORE.getFlow('transfer_pending');
    if (!p) {
      notify('Nenhum envio pendente - voltando', 'warn');
      setTimeout(function () { location.href = '/enviar-pontos'; }, 1200);
      return;
    }

    // Substitui o conteúdo principal pela revisão real
    var host = $('main') || document.body;
    var box = document.createElement('div');
    box.className = 'card';
    box.style.cssText = 'padding:24px;margin:24px auto;max-width:720px;';
    box.innerHTML =
      '<h2 style="margin:0 0 14px;">Confirmar envio</h2>' +
      '<div class="dl">' +
        '<div><span class="k">Para</span><span class="v">' + p.to + '</span></div>' +
        '<div><span class="k">Pontos</span><span class="v" style="font-size:20px;font-weight:700;">' + fmt(p.amount_pts) + ' pts</span></div>' +
        (p.message ? '<div><span class="k">Mensagem</span><span class="v">' + p.message + '</span></div>' : '') +
        '<div><span class="k">Taxa</span><span class="v" style="color:var(--ok-text);">Grátis</span></div>' +
      '</div>' +
      '<div class="alert warn mt-2"><div class="alert-icon">!</div><div><p>Pontos não podem ser cancelados após confirmação.</p></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button id="bx-cancel" class="button secondary">Voltar e editar</button>' +
        '<button id="bx-confirm" class="button">Confirmar envio →</button>' +
      '</div>';
    host.insertBefore(box, host.firstChild);

    $('#bx-cancel').addEventListener('click', function () { location.href = '/enviar-pontos'; });
    $('#bx-confirm').addEventListener('click', function () {
      var btn = $('#bx-confirm'); btn.disabled = true; btn.textContent = 'Enviando...';
      api('/transfer/', { method: 'POST', body: JSON.stringify(p) })
        .then(function (t) {
          STORE.setFlow('transfer_done', t);
          sessionStorage.removeItem('blaxx_flow_transfer_pending');
          location.href = '/envio-concluido';
        })
        .catch(function (e) { notify(e.message, 'err'); btn.disabled = false; btn.textContent = 'Confirmar envio →'; });
    });
  }

  function initEnvioConcluido() {
    if (!requireAuth()) return;
    applyUserToShell();
    var t = STORE.getFlow('transfer_done');
    if (!t) return;
    api('/wallet/').then(function (w) {
      var host = $('main') || document.body;
      var box = document.createElement('div');
      box.className = 'card lime';
      box.style.cssText = 'padding:24px;margin:24px auto;max-width:720px;text-align:left;';
      box.innerHTML =
        '<div style="display:flex;align-items:center;gap:14px;">' +
          '<div style="width:54px;height:54px;border-radius:50%;background:var(--ink);color:var(--lime);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;">✓</div>' +
          '<div><h2 style="margin:0;">Pontos enviados!</h2><p style="margin:0;color:var(--muted);">Comprovante registrado no extrato.</p></div>' +
        '</div>' +
        '<div class="dl mt-4">' +
          '<div><span class="k">Pontos enviados</span><span class="v" style="font-size:20px;">' + fmt(t.amount_pts) + ' pts</span></div>' +
          '<div><span class="k">Saldo atualizado</span><span class="v">' + fmt(w.balance_pts) + ' pts</span></div>' +
          '<div><span class="k">Comprovante</span><span class="v" style="font-family:monospace;">' + t.receipt_code + '</span></div>' +
          '<div><span class="k">Data</span><span class="v">' + new Date(t.created_at).toLocaleString('pt-BR') + '</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<a href="dashboard.html" class="button">Voltar ao painel</a>' +
          '<a href="enviar-pontos.html" class="button secondary">Enviar mais</a>' +
          '<a href="extrato.html" class="button secondary">Ver extrato</a>' +
        '</div>';
      var host2 = $('main') || document.body;
      host2.insertBefore(box, host2.firstChild);
    });
  }

  function initResgatePix() {
    if (!requireAuth()) return;
    applyUserToShell();
    var ptsInput = $('#bx-r-pts');
    if (!ptsInput) return;

    // 1 pt = R$ 0,09 = 9 centavos. Sincronizar com backend Config.CENTS_PER_POINT.
    var BX_CENTS_PER_POINT = 9;
    function quote() {
      var p = parseInt(ptsInput.value || '0');
      $('#bx-r-quote').textContent = p > 0
        ? '≈ ' + brl(p * BX_CENTS_PER_POINT / 100) + ' (1 pt = R$ 0,09)'
        : '';
    }
    ptsInput.addEventListener('input', quote); quote();

    $('#bx-r-go').addEventListener('click', function () {
      var btn = $('#bx-r-go');
      var pts = parseInt(ptsInput.value || '0');
      var key = $('#bx-r-key').value.trim();
      var pwd = $('#bx-r-pwd').value;
      btn.disabled = true; btn.textContent = 'Processando...';
      api('/redeem/', { method: 'POST', body: JSON.stringify({ points: pts, pix_key: key, password: pwd }) })
        .then(function (r) {
          var box = $('#bx-r-out');
          box.style.display = 'block';
          if (r.status === 'paid') {
            box.className = 'alert success mt-2';
            box.innerHTML = '<div class="alert-icon">✓</div><div><p><strong>' + brl(r.amount_brl) + ' enviados via PIX</strong> para <code>' + r.pix_key + '</code></p><p>EndToEndID: <code>' + r.end_to_end_id + '</code></p></div>';
          } else if (r.status === 'failed') {
            box.className = 'alert warn mt-2';
            box.innerHTML = '<div class="alert-icon">!</div><div><p><strong>Payout falhou:</strong> ' + r.failure_reason + '</p><p>' + fmt(r.points_debited) + ' pts <strong>estornados automaticamente</strong>.</p></div>';
          } else {
            box.className = 'alert info mt-2';
            box.innerHTML = '<div class="alert-icon">i</div><div><p>Status: ' + r.status + '</p></div>';
          }
          applyUserToShell(); // atualiza saldo
          btn.disabled = false; btn.textContent = 'Resgatar';
        })
        .catch(function (e) {
          var box = $('#bx-r-out');
          box.style.display = 'block';
          box.className = 'alert error mt-2';
          box.innerHTML = '<div class="alert-icon">✗</div><div><p>' + e.message + '</p></div>';
          btn.disabled = false; btn.textContent = 'Resgatar';
        });
    });
  }

  // =========================================================================
  // QR Code visual (decorativo - o BR Code real está sempre no copia-e-cola)
  // =========================================================================
  function drawQR(text) {
    var size = 27, cell = 100/size;
    var h = 0; for (var i = 0; i < text.length; i++) h = ((h<<5)-h + text.charCodeAt(i)) | 0;
    function rng(i){ h = (h * 1103515245 + 12345 + i) & 0x7fffffff; return h; }
    var svg = '<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="white"/>';
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var corner = (x<7&&y<7)||(x>=size-7&&y<7)||(x<7&&y>=size-7);
      var inCorner = corner && !((x>0&&x<6&&y>0&&y<6)||(x>size-7&&x<size-1&&y>0&&y<6)||(x>0&&x<6&&y>size-7&&y<size-1));
      var dotInCorner = corner && ((x>1&&x<5&&y>1&&y<5)||(x>size-6&&x<size-2&&y>1&&y<5)||(x>1&&x<5&&y>size-6&&y<size-2));
      var on = corner ? (inCorner || dotInCorner) : ((rng(y*size+x) % 2) === 0);
      if (on) svg += '<rect x="' + (x*cell).toFixed(2) + '" y="' + (y*cell).toFixed(2) + '" width="' + cell.toFixed(2) + '" height="' + cell.toFixed(2) + '" fill="black"/>';
    }
    return svg + '</svg>';
  }

  // =========================================================================
  // Cadastro de novo cliente (POST /auth/register)
  // =========================================================================
  function initCadastro() {
    var form = $('#form-cadastro') || $('form');
    if (!form) return;
    // Botão "Entrar com Google" no cadastro (cria conta no 1º login)
    initGoogleSignIn();
    // Máscara de CPF se houver campo
    var cpfEl = form.querySelector('#cpf') || form.querySelector('input[name="cpf"]');
    if (cpfEl) {
      cpfEl.addEventListener('input', function () {
        var v = cpfEl.value.replace(/\D/g, '').slice(0, 11);
        cpfEl.value = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      });
    }
    // Indicador inline de forca de senha
    var senhaEl = form.querySelector('#senha');
    var strengthEl = $('#bx-strength');
    attachPasswordStrength(senhaEl, strengthEl);

    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = (form.querySelector('#nome') || {}).value || '';
      var email = (form.querySelector('#email') || {}).value || '';
      var cpf = (cpfEl || {}).value || '';
      var senha = (senhaEl || {}).value || '';
      var senhaConfirm = (form.querySelector('#senha-confirm') || {}).value || '';
      var termos = (form.querySelector('#termos') || {}).checked || false;
      var news = (form.querySelector('#news') || {}).checked || false;

      if (!nome.trim() || nome.trim().split(/\s+/).length < 2) { notify('Informe nome completo (nome e sobrenome)', 'warn'); return; }
      if (!email.trim()) { notify('Informe um email válido', 'warn'); return; }
      if (!passwordStrength(senha).ok) { notify('Senha fraca: use 10+ chars com maiúscula, minúscula, número e símbolo', 'warn'); return; }
      if (senha !== senhaConfirm) { notify('Confirmação de senha não confere', 'warn'); return; }
      if (!termos) { notify('Você precisa aceitar os termos e a política de privacidade', 'warn'); return; }

      var btn = form.querySelector('button[type="submit"], button.button');
      var orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }

      // Body compativel com backend antigo (cpf obrigatorio) e novo (terms + confirm).
      // Cada um ignora silenciosamente os campos que nao reconhece.
      var body = {
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        cpf: cpf.replace(/\D/g, ''),
        password: senha,
        password_confirm: senhaConfirm,
        // Backend exige 3 aceites separados (Termos, Privacidade, LGPD).
        // Frontend simplifica com 1 checkbox cobrindo os 3 documentos —
        // os links de "termos de uso" e "política de privacidade" do
        // checkbox levam aos 3 docs.
        accept_terms: true,
        accept_privacy: true,
        accept_lgpd: true,
        marketing_optin: news
      };
      api('/auth/register', { method: 'POST', body: JSON.stringify(body) })
        .then(function (data) {
          if (data && data.token) {
            // Backend antigo: emite token na hora, sem verificacao de email
            STORE.setToken(data.token); STORE.setUser(data.user);
            notify('Conta criada! Bem-vindo, ' + (data.user.name || '').split(' ')[0], 'ok');
            setTimeout(function () { location.href = '/dashboard'; }, 800);
          } else {
            // Backend novo: exige confirmacao de email antes do login
            notify('Conta criada! Verifique seu email para ativar.', 'ok');
            setTimeout(function () { location.href = '/validacao.html'; }, 1200);
          }
        })
        .catch(function (err) {
          notify(err.message || 'Falha no cadastro', 'err');
          if (btn) { btn.disabled = false; btn.textContent = orig; }
        });
    });
  }

  // =========================================================================
  // Parceiros (GET /partners)
  // =========================================================================
  function initParceiros() {
    if (!requireAuth()) return;
    api('/partners/').then(function (d) {
      var items = d.items || [];
      var grid = $('.bx-grid, .grid, main');
      if (!grid) return;
      var html = items.map(function (p) {
        return '<div class="bx-card" style="padding:16px;border:1px solid #eee;border-radius:12px;margin:8px;">'
          + '<div style="font-size:20px;">' + (p.logo_emoji || '◯') + ' <strong>' + p.name + '</strong></div>'
          + '<div style="color:#888;font-size:13px;margin-top:4px;">' + p.category + '</div>'
          + '<div style="margin-top:8px;font-size:14px;">' + (p.description || '') + '</div>'
          + '<div style="margin-top:10px;background:#F0FAD9;color:#8FB81F;padding:6px 10px;border-radius:6px;display:inline-block;font-size:12px;font-weight:600;">'
          + (p.accrual_rule || '') + '</div></div>';
      }).join('');
      var container = $('#bx-parceiros-list') || grid;
      if (container.id === 'bx-parceiros-list') container.innerHTML = html;
    }).catch(function (e) { notify(e.message, 'error'); });
  }

  // =========================================================================
  // Resgates / Benefícios (GET /benefits + POST /benefits/<id>/redeem)
  // =========================================================================
  function initResgates() {
    if (!requireAuth()) return;
    api('/benefits/').then(function (d) {
      var items = d.items || [];
      var container = $('#bx-beneficios-list');
      if (!container) return;
      container.innerHTML = items.map(function (b) {
        return '<div class="bx-benefit-card" data-id="' + b.id + '" style="padding:14px;border:1px solid #eee;border-radius:12px;margin:8px;cursor:pointer;">'
          + (b.tag ? '<span style="background:#F0FAD9;color:#8FB81F;padding:2px 8px;border-radius:4px;font-size:11px;">' + b.tag + '</span>' : '')
          + '<div style="font-size:28px;margin-top:6px;">' + (b.image_emoji || '★') + '</div>'
          + '<strong>' + b.name + '</strong>'
          + (b.partner_name ? '<div style="color:#888;font-size:12px;">' + b.partner_name + '</div>' : '')
          + '<div style="margin-top:8px;font-weight:600;">' + fmt(b.cost_pts) + ' pts</div>'
          + '</div>';
      }).join('');
      $$('.bx-benefit-card').forEach(function (card) {
        card.addEventListener('click', function () {
          location.href = '/beneficio-detalhe?id=' + card.dataset.id;
        });
      });
    }).catch(function (e) { notify(e.message, 'error'); });
  }

  function initBeneficioDetalhe() {
    if (!requireAuth()) return;
    var id = new URLSearchParams(location.search).get('id');
    if (!id) return;
    var target = $('#bx-beneficio-card') || $('main');
    Promise.all([api('/benefits/' + id), api('/wallet/')]).then(function (res) {
      var b = res[0], w = res[1];
      if (target) {
        target.innerHTML = '<h2>' + (b.image_emoji || '★') + ' ' + b.name + '</h2>'
          + '<p>' + (b.description || '') + '</p>'
          + '<p><strong>Custo:</strong> ' + fmt(b.cost_pts) + ' pts</p>'
          + '<p><strong>Seu saldo:</strong> ' + fmt(w.balance_pts) + ' pts</p>'
          + '<button id="bx-redeem" ' + (w.balance_pts < b.cost_pts ? 'disabled' : '') + '>'
          + (w.balance_pts < b.cost_pts ? 'Saldo insuficiente' : 'Resgatar') + '</button>';
      }
      var btn = $('#bx-redeem');
      if (btn && w.balance_pts >= b.cost_pts) {
        btn.addEventListener('click', function () {
          btn.disabled = true; btn.textContent = 'Processando…';
          api('/benefits/' + id + '/redeem', { method: 'POST' })
            .then(function (v) {
              sessionStorage.setItem('blaxx_voucher_id', v.id);
              notify('Voucher emitido: ' + v.code, 'success');
              setTimeout(function () { location.href = '/detalhe-voucher?id=' + v.id; }, 800);
            })
            .catch(function (e) { notify(e.message, 'error'); btn.disabled = false; btn.textContent = 'Resgatar'; });
        });
      }
    }).catch(function (e) { notify(e.message, 'error'); });
  }

  // =========================================================================
  // Campanhas (GET /campaigns + POST /campaigns/<id>/join)
  // =========================================================================
  function initCampanhas() {
    if (!requireAuth()) return;
    var container = $('#bx-campanhas-list');
    if (!container) return;
    bxRenderGridSkeleton(container, 4, 180);

    api('/campaigns/').then(function (d) {
      var items = d.items || [];
      container.innerHTML = items.map(function (c) {
        var pct = c.progress_pct || 0;
        return '<div class="bx-camp-card" style="padding:14px;border:1px solid #eee;border-radius:12px;margin:8px;">'
          + (c.completed_at ? '<span style="color:#8FB81F">✓ Concluída</span>' : c.joined ? '<span>Participando</span>' : '<span>Ativa</span>')
          + '<h3>' + c.name + '</h3>'
          + '<p>' + (c.description || '') + '</p>'
          + '<p style="color:#888;font-size:12px;">' + (c.mechanic || '') + '</p>'
          + (c.joined ? '<div style="height:8px;background:#eee;border-radius:99px;"><div style="height:100%;width:' + pct + '%;background:#C6F432;border-radius:99px;"></div></div><small>' + pct + '%</small>' : '')
          + '<p><strong>Bônus:</strong> ' + fmt(c.reward_pts) + ' pts</p>'
          + (c.completed_at ? '' : c.joined
              ? '<button class="bx-camp-progress" data-id="' + c.id + '">Simular gasto R$ 100</button>'
              : '<button class="bx-camp-join" data-id="' + c.id + '">Participar</button>')
          + '</div>';
      }).join('');
      $$('.bx-camp-join').forEach(function (b) {
        b.addEventListener('click', function () {
          api('/campaigns/' + b.dataset.id + '/join', { method: 'POST' })
            .then(function () { notify('Você está participando!', 'success'); initCampanhas(); })
            .catch(function (e) { notify(e.message, 'error'); });
        });
      });
      $$('.bx-camp-progress').forEach(function (b) {
        b.addEventListener('click', function () {
          api('/campaigns/' + b.dataset.id + '/progress', { method: 'POST', body: JSON.stringify({ amount_brl: 100 }) })
            .then(function (r) {
              if (r.completed_at) notify('Campanha concluída! Bônus creditado.', 'success');
              else notify('Progresso: ' + r.progress_pct + '%', 'success');
              initCampanhas();
            })
            .catch(function (e) { notify(e.message, 'error'); });
        });
      });
    }).catch(function (e) {
      // Em vez de toast efêmero, mostra erro inline com retry — usuario tem
      // contexto e botao pra acionar de novo sem precisar recarregar a pagina.
      var cls = bxClassifyError(e, 'Endpoint /campaigns/ nao respondeu.');
      bxRenderError({
        kind: 'grid', host: container,
        message: cls.message, hint: cls.hint,
        onRetry: initCampanhas,
      });
    });
  }

  // =========================================================================
  // Notificações (GET /notifications + PATCH read)
  // =========================================================================
  function initNotificacoes() {
    if (!requireAuth()) return;
    api('/notifications/').then(function (d) {
      var items = d.items || [];
      var container = $('#bx-notif-list');
      if (!container) return;
      if (!items.length) { container.innerHTML = '<p>Sem notificações.</p>'; return; }
      container.innerHTML = items.map(function (n) {
        return '<div class="bx-notif" data-id="' + n.id + '" style="padding:12px;border-bottom:1px solid #eee;'
          + (n.is_read ? '' : 'background:rgba(198,244,50,0.06);')
          + 'cursor:pointer;">'
          + '<div style="display:inline-block;width:32px;height:32px;border-radius:50%;background:#0A0A0A;color:#C6F432;text-align:center;line-height:32px;">' + (n.icon || '!') + '</div> '
          + '<strong>' + n.title + (n.is_read ? '' : ' •') + '</strong>'
          + '<p style="margin:4px 0 0;color:#888;font-size:13px;">' + (n.body || '') + '</p>'
          + '</div>';
      }).join('');
      $$('.bx-notif').forEach(function (el) {
        el.addEventListener('click', function () {
          api('/notifications/' + el.dataset.id + '/read', { method: 'PATCH' })
            .then(initNotificacoes).catch(function () {});
        });
      });
    }).catch(function (e) { notify(e.message, 'error'); });
  }

  // =========================================================================
  // Helpers compartilhados entre Dashboard / Carteira / Extrato
  // =========================================================================
  var TX_TYPE_LABEL = {
    purchase: 'Compra', transfer_in: 'Recebido', transfer_out: 'Enviado',
    redeem: 'Resgate', refund: 'Estorno', bonus: 'Bônus',
  };
  var TX_STATUS_LABEL = {
    confirmed: 'Confirmado', pending: 'Aguardando', reversed: 'Estornado',
  };
  var TX_STATUS_CLASS = {
    confirmed: 'confirmado', pending: 'pendente', reversed: 'estornado',
  };

  function renderTxRow(t, withDescriptionBold) {
    var d = (t.created_at || '').replace('T', ' ').slice(0, 16);
    var sign = t.amount_pts > 0 ? '+' : '−';
    var amount = sign + fmt(Math.abs(t.amount_pts));
    var amountClass = t.amount_pts > 0 ? 'amount-pos' : 'amount-neg';
    var statusKey = (t.status || 'confirmed').toLowerCase();
    var statusLabel = TX_STATUS_LABEL[statusKey] || statusKey;
    var statusClass = TX_STATUS_CLASS[statusKey] || 'confirmado';
    var desc = t.description || '—';
    if (withDescriptionBold) desc = '<strong>' + desc + '</strong>';
    return '<tr>' +
      '<td data-label="Data">' + d + '</td>' +
      '<td data-label="Descrição">' + desc + '</td>' +
      '<td data-label="Status"><span class="status ' + statusClass + '">● ' + statusLabel + '</span></td>' +
      '<td data-label="Pontos" class="right ' + amountClass + '">' + amount + '</td>' +
      '</tr>';
  }

  // Atualiza o card de saldo escuro com balance_pts + equivalente em R$ +
  // bloco de Disponíveis/Pendentes/Próx. expirar. Compartilhado entre
  // dashboard.html e carteira.html.
  function applyWalletToShell(w) {
    var $ = function (id) { return document.getElementById(id); };
    var balance = w.balance_pts || 0;
    var pending = w.pending_pts || 0;
    var brl = (w.balance_brl_equiv || 0).toFixed(2).replace('.', ',');
    // Dashboard
    if ($('dash-balance')) $('dash-balance').textContent = fmt(balance);
    if ($('dash-balance-brl')) $('dash-balance-brl').textContent = 'R$ ' + brl;
    if ($('dash-available')) $('dash-available').textContent = fmt(balance - pending);
    if ($('dash-pending')) $('dash-pending').textContent = fmt(pending);
    if ($('dash-expire')) $('dash-expire').textContent = '0';  // sem expiração ativa por enquanto
    // Carteira
    if ($('wallet-balance')) $('wallet-balance').innerHTML = fmt(balance) + ' <small>pts</small>';
    if ($('wallet-balance-brl')) $('wallet-balance-brl').textContent = 'R$ ' + brl;
    if ($('wallet-available')) $('wallet-available').textContent = fmt(balance - pending);
    if ($('wallet-pending')) $('wallet-pending').textContent = fmt(pending);
    if ($('wallet-expire')) $('wallet-expire').textContent = '0';
  }

  // =========================================================================
  // Dashboard (KPIs + últimas movimentações reais)
  // =========================================================================
  // Overload do initDashboard original — preserva substituir_textos_hardcoded
  // mas adiciona binding por ID dos elementos do dashboard.html.
  var __originalInitDashboard = window.__originalInitDashboard || initDashboard;
  function initDashboardEnhanced() {
    if (!requireAuth()) return;
    api('/wallet/').then(applyWalletToShell).catch(function (e) { console.error('wallet:', e); });

    var tbody = document.getElementById('dash-tx-tbody');
    if (tbody) {
      api('/wallet/transactions?limit=5').then(function (r) {
        var items = r.items || [];
        if (items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);">Nenhuma movimentação ainda.</td></tr>';
        } else {
          tbody.innerHTML = items.map(function (t) { return renderTxRow(t, true); }).join('');
        }
      }).catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:#a83417;">Erro: ' + e.message + '</td></tr>';
      });
    }
    applyUserToShell();
  }

  // =========================================================================
  // Carteira (saldo, KPIs, movimentações recentes)
  // =========================================================================
  function initCarteira() {
    if (!requireAuth()) return;
    applyUserToShell();
    api('/wallet/').then(applyWalletToShell).catch(function (e) { console.error(e); });

    var tbody = document.getElementById('wallet-tx-tbody');
    if (!tbody) return;

    function loadTx() {
      bxRenderTableSkeleton(tbody, 4, 4);
      api('/wallet/transactions?limit=10').then(function (r) {
        var items = r.items || [];
        if (items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);">Nenhuma movimentação ainda.</td></tr>';
        } else {
          tbody.innerHTML = items.map(function (t) { return renderTxRow(t, false); }).join('');
        }
      }).catch(function (e) {
        var cls = bxClassifyError(e, 'Endpoint /wallet/transactions nao respondeu.');
        bxRenderError({
          kind: 'row', host: tbody, cols: 4,
          message: cls.message, hint: cls.hint,
          onRetry: loadTx,
        });
      });
    }
    loadTx();
  }

  // =========================================================================
  // Comprar pontos (pacotes reais via /pix/packages)
  // =========================================================================
  function initComprarPontosReal() {
    var grid = document.getElementById('pkg-grid');
    if (!grid) return;

    // Helper: handler unico de click pros cards de pacote
    // - Pre-check apenas de AUTH (sem login → manda pra login com next)
    // - NAO bloqueia por email_verified aqui — deixa o backend decidir.
    //   Se /pix/charge retornar 403 email_not_verified, comprar-livre.js
    //   abre o modal de verificacao e re-tenta automaticamente.
    function attachPkgClickHandlers() {
      $$('a.bx-buy-pkg', grid).forEach(function (a) {
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          var pkg = a.getAttribute('data-pkg') || '';
          var target = '/comprar-livre.html?pkg=' + encodeURIComponent(pkg);
          if (!STORE.token()) {
            location.href = '/login.html?next=' + encodeURIComponent(target);
            return;
          }
          // Logado: feedback visual + navega direto (sem gating)
          a.style.opacity = '0.6';
          a.textContent = 'Carregando…';
          a.style.pointerEvents = 'none';
          location.href = target;
        });
      });
    }
    // Botao "Valor livre" do topo — mesmo comportamento
    var freeBtn = document.querySelector('a[href="comprar-livre.html"]');
    if (freeBtn) {
      freeBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (!STORE.token()) {
          location.href = '/login.html?next=' + encodeURIComponent('/comprar-livre.html');
          return;
        }
        location.href = '/comprar-livre.html';
      });
    }

    function loadPackages() {
      bxRenderGridSkeleton(grid, 4, 220);
      bxFetchJson(API + '/pix/packages', { timeoutMs: 20000 })
        .then(function (data) {
          var keys = Object.keys(data);
          if (keys.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);">Nenhum pacote disponível.</div>';
            return;
          }
          // Ordem preferida
          var order = ['start', 'plus', 'prime', 'black'];
          keys.sort(function (a, b) {
            return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
                   (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
          });
          grid.innerHTML = keys.map(function (k) {
            var p = data[k];
            var featured = k === 'plus' ? ' featured' : '';
            var ribbon = k === 'plus' ? '<span class="ribbon">Mais popular</span>' : '';
            var btnClass = k === 'plus' ? 'button' : 'button secondary';
            var bonus = k === 'start' ? 'Para começar'
                      : k === 'plus' ? '+10% bônus'
                      : k === 'prime' ? '+20% bônus'
                      : k === 'black' ? '+40% bônus' : '';
            var priceBRL = Number(p.price_brl).toFixed(2).replace('.', ',');
            return '<div class="price-card' + featured + '">' +
              ribbon +
              '<div class="pname">' + (p.label || k) + '</div>' +
              '<div class="price">R$ ' + priceBRL + '</div>' +
              '<div class="pts-line">' + fmt(p.points) + ' pts</div>' +
              '<div class="bonus">' + bonus + '</div>' +
              '<a href="comprar-livre.html?pkg=' + k + '" data-pkg="' + k + '" class="bx-buy-pkg ' + btnClass + '">Comprar agora</a>' +
              '</div>';
          }).join('');
          attachPkgClickHandlers();
        })
        .catch(function (err) {
          var cls = bxClassifyError(err, 'Endpoint /pix/packages nao respondeu.');
          bxRenderError({
            kind: 'grid', host: grid,
            message: cls.message, hint: cls.hint,
            onRetry: loadPackages,
          });
        });
    }
    loadPackages();
  }

  // =========================================================================
  // Parceiros (lista real via /partners/)
  // =========================================================================
  function initParceirosReal() {
    var grid = document.getElementById('pt-grid');
    if (!grid) return;

    var ALL_PARTNERS = [];

    function render() {
      var search = (document.getElementById('pt-search') || {}).value || '';
      var cat = (document.getElementById('pt-cat') || {}).value || '';
      var s = search.trim().toLowerCase();
      var filtered = ALL_PARTNERS.filter(function (p) {
        if (cat && p.category !== cat) return false;
        if (s && (p.name || '').toLowerCase().indexOf(s) === -1) return false;
        return true;
      });
      var $c = document.getElementById('pt-count');
      if ($c) $c.textContent = 'Mostrando ' + filtered.length + ' de ' + ALL_PARTNERS.length + ' parceiros';
      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);">Nenhum parceiro encontrado.</div>';
        return;
      }
      grid.innerHTML = filtered.map(function (p) {
        var initials = (p.name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        return '<a href="detalhe-parceiro.html?id=' + p.id + '" class="partner-card">' +
          '<div class="partner-logo">' + (p.logo_emoji || initials) + '</div>' +
          '<div><h3>' + p.name + '</h3>' +
          '<div class="rate">' + (p.accrual_rule || '') + '</div></div></a>';
      }).join('');
    }

    window.reloadParceiros = render;

    function loadPartners() {
      bxRenderGridSkeleton(grid, 8, 110);
      bxFetchJson(API + '/partners/', { timeoutMs: 20000 })
        .then(function (data) {
          ALL_PARTNERS = data.items || [];
          // Popula filtro de categorias (reset antes pra evitar duplicacao no retry)
          var cats = {};
          ALL_PARTNERS.forEach(function (p) { if (p.category) cats[p.category] = true; });
          var $cat = document.getElementById('pt-cat');
          if ($cat) {
            $cat.innerHTML = '<option value="">Todas as categorias</option>';
            Object.keys(cats).sort().forEach(function (c) {
              var opt = document.createElement('option');
              opt.value = c; opt.textContent = c;
              $cat.appendChild(opt);
            });
          }
          render();
        })
        .catch(function (err) {
          var cls = bxClassifyError(err, 'Endpoint /partners/ nao respondeu.');
          bxRenderError({
            kind: 'grid', host: grid,
            message: cls.message, hint: cls.hint,
            onRetry: loadPartners,
          });
        });
    }
    loadPartners();
  }

  // =========================================================================
  // Helpers de resiliência pra telas dinâmicas (Wave 2 da auditoria)
  // =========================================================================
  // Padrao unificado em todas as paginas que dependem de fetch do backend:
  //   1. Skeleton com pulse animation enquanto carrega.
  //   2. AbortController + timeout duro (20s — Render free cold start ~10s).
  //   3. Mensagem de erro com contexto (cold start vs offline vs 5xx).
  //   4. Botao "Tentar novamente" que chama de novo a funcao de load.
  // ---------------------------------------------------------------------------

  // Injeta keyframe da animacao de pulse uma vez por sessao
  function _ensureSkeletonStyle() {
    if (document.getElementById('bx-skeleton-style')) return;
    var st = document.createElement('style');
    st.id = 'bx-skeleton-style';
    st.textContent = '@keyframes bxPulse{from{opacity:.55}to{opacity:1}}' +
      '.bx-skeleton{background:#f5f7f0;border-radius:14px;animation:bxPulse 1.4s ease-in-out infinite alternate;}' +
      '.bx-skeleton-line{background:#f5f7f0;border-radius:6px;height:14px;animation:bxPulse 1.4s ease-in-out infinite alternate;}';
    document.head.appendChild(st);
  }

  // Renderiza skeleton de cards num <grid>. count = quantos placeholders.
  function bxRenderGridSkeleton(host, count, height) {
    _ensureSkeletonStyle();
    var n = count || 6;
    var h = height || 160;
    host.innerHTML = '<div style="grid-column:1/-1;display:grid;' +
      'grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">' +
      Array(n).fill(0).map(function () {
        return '<div class="bx-skeleton" style="height:' + h + 'px;"></div>';
      }).join('') +
    '</div>';
  }

  // Skeleton de linhas pra tabela <tbody>.
  function bxRenderTableSkeleton(tbody, cols, rows) {
    _ensureSkeletonStyle();
    var nRows = rows || 5;
    var nCols = cols || 5;
    var rowHtml = '<tr>' + Array(nCols).fill(0).map(function () {
      return '<td style="padding:14px;"><div class="bx-skeleton-line"></div></td>';
    }).join('') + '</tr>';
    tbody.innerHTML = Array(nRows).fill(rowHtml).join('');
  }

  // Renderiza erro com botao de retry. opts = {kind: 'grid'|'row', host, cols,
  // message, hint, onRetry, color}.
  function bxRenderError(opts) {
    var color = opts.color || '#a83417';
    var msg = opts.message || 'Falha ao carregar.';
    var hint = opts.hint || 'Verifique sua conexao e tente de novo.';
    var btnId = 'bx-retry-' + Math.random().toString(36).slice(2, 8);
    var btn = '<button type="button" id="' + btnId + '" ' +
      'style="background:var(--lime,#C6F432);color:var(--ink,#080907);border:0;padding:10px 20px;' +
      'border-radius:999px;font-weight:700;cursor:pointer;margin-top:14px;font-size:13px;">' +
      '↻ Tentar novamente</button>';
    var body =
      '<div style="text-align:center;padding:32px 24px;color:' + color + ';">' +
        '<div style="font-size:32px;margin-bottom:8px;">⚠</div>' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;color:var(--ink,#080907);">' + msg + '</div>' +
        '<div style="font-size:13px;color:var(--muted,#5f665e);margin-bottom:6px;max-width:420px;margin-left:auto;margin-right:auto;">' +
          hint +
        '</div>' +
        btn +
      '</div>';
    if (opts.kind === 'row') {
      opts.host.innerHTML = '<tr><td colspan="' + (opts.cols || 5) + '">' + body + '</td></tr>';
    } else {
      opts.host.innerHTML = '<div style="grid-column:1/-1;">' + body + '</div>';
    }
    var b = document.getElementById(btnId);
    if (b && typeof opts.onRetry === 'function') b.addEventListener('click', opts.onRetry);
  }

  // Helper: erro -> {message, hint} com base na causa (timeout vs offline vs 5xx)
  function bxClassifyError(err, ctx) {
    var name = (err && err.name) || '';
    var status = (err && err.status) || 0;
    if (name === 'AbortError') {
      return {
        message: 'Tempo esgotado',
        hint: 'O servidor demorou demais (cold start até 30s no plano free do Render). Tente de novo em alguns segundos.',
      };
    }
    if (status === 401) {
      return { message: 'Sessão expirada', hint: 'Faça login novamente.' };
    }
    if (status === 404) {
      return { message: 'Recurso não encontrado', hint: (ctx || 'O endpoint procurado nao existe neste servidor.') };
    }
    if (status >= 500) {
      return { message: 'Erro no servidor (' + status + ')', hint: 'O backend reportou erro interno. Tente em alguns minutos.' };
    }
    if (status === 0 || !status) {
      return { message: 'Sem conexão', hint: 'Verifique sua internet ou se o backend esta online.' };
    }
    return { message: 'Erro inesperado', hint: (err && err.message) || 'Tente recarregar a pagina.' };
  }

  // fetch + timeout duro + parse JSON. Retorna Promise com {data, status}.
  // Em erro, throwa Error com .name='AbortError' (timeout) ou .status (HTTP).
  function bxFetchJson(url, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 20000;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);

    var fetchOpts = Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {});
    delete fetchOpts.timeoutMs;

    return fetch(url, fetchOpts).then(function (r) {
      clearTimeout(timer);
      return r.text().then(function (raw) {
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
        if (!r.ok) {
          var e = new Error(data.error || ('HTTP ' + r.status));
          e.status = r.status;
          e.data = data;
          throw e;
        }
        return data;
      });
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  // =========================================================================
  // Resgates (benefícios reais via /benefits/)
  // =========================================================================
  function initResgatesReal() {
    var grid = document.getElementById('rg-grid');
    if (!grid) return;

    var ALL_BENEFITS = [];

    function render() {
      var search = (document.getElementById('rg-search') || {}).value || '';
      var cat = (document.getElementById('rg-cat') || {}).value || '';
      var s = search.trim().toLowerCase();
      var filtered = ALL_BENEFITS.filter(function (b) {
        if (cat && b.category !== cat) return false;
        if (s && (b.name || '').toLowerCase().indexOf(s) === -1) return false;
        return true;
      });
      var $c = document.getElementById('rg-count');
      if ($c) $c.textContent = 'Mostrando ' + filtered.length + ' de ' + ALL_BENEFITS.length + ' benefícios';
      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);">Nenhum benefício encontrado.</div>';
        return;
      }
      grid.innerHTML = filtered.map(function (b) {
        var tag = b.tag ? '<div class="tag-row"><span class="glyph-sm">▣</span> ' + b.tag + '</div>' : '';
        return '<a href="beneficio-detalhe.html?id=' + b.id + '" class="market-card">' +
          tag +
          '<h3>' + b.name + '</h3>' +
          '<div class="pts">' + fmt(b.cost_pts) + ' <small>pts</small></div>' +
          '<span class="market-cta">Resgatar</span></a>';
      }).join('');
    }

    window.reloadResgates = render;

    function loadBenefits() {
      bxRenderGridSkeleton(grid, 6, 160);
      bxFetchJson(API + '/benefits/', { timeoutMs: 20000 })
        .then(function (data) {
          ALL_BENEFITS = data.items || [];
          var cats = {};
          ALL_BENEFITS.forEach(function (b) { if (b.category) cats[b.category] = true; });
          var $cat = document.getElementById('rg-cat');
          if ($cat) {
            $cat.innerHTML = '<option value="">Todas as categorias</option>';
            Object.keys(cats).sort().forEach(function (c) {
              var opt = document.createElement('option');
              opt.value = c; opt.textContent = c;
              $cat.appendChild(opt);
            });
          }
          render();
        })
        .catch(function (err) {
          var cls = bxClassifyError(err, 'Endpoint /benefits/ nao respondeu.');
          bxRenderError({
            kind: 'grid', host: grid,
            message: cls.message, hint: cls.hint,
            onRetry: loadBenefits,
          });
        });
    }
    loadBenefits();
  }

  // =========================================================================
  // Extrato (paridade com Mac StatementView)
  // =========================================================================
  function initExtrato() {
    if (!requireAuth()) return;
    applyUserToShell();

    var TYPE_LABEL = {
      purchase: 'Compra', transfer_in: 'Recebido', transfer_out: 'Enviado',
      redeem: 'Resgate', refund: 'Estorno', bonus: 'Bônus',
    };
    var STATUS_CLASS = { confirmed: 'confirmado', pending: 'pendente', reversed: 'estornado' };

    function reload() {
      var typeFilter = ($('#ex-type') || {}).value || '';
      var search = (($('#ex-search') || {}).value || '').trim().toLowerCase();
      var tbody = $('#ex-tbody');
      if (tbody) bxRenderTableSkeleton(tbody, 5, 6);

      var url = '/wallet/transactions?limit=200';
      api(url).then(function (r) {
        var items = (r.items || []).filter(function (t) {
          if (typeFilter && t.type !== typeFilter) return false;
          if (search && (t.description || '').toLowerCase().indexOf(search) === -1) return false;
          return true;
        });

        // Stats (mesma lógica do Mac AdminStats agregando por tipo)
        var totalIn = 0, totalRedeem = 0, totalPurchase = 0, purchaseCount = 0;
        items.forEach(function (t) {
          if (t.amount_pts > 0) totalIn += t.amount_pts;
          if (t.type === 'redeem') totalRedeem += Math.abs(t.amount_pts);
          if (t.type === 'purchase') { totalPurchase += t.amount_pts; purchaseCount++; }
        });
        var $s = function (id) { return document.getElementById(id); };
        if ($s('ex-stat-in')) $s('ex-stat-in').textContent = '+' + fmt(totalIn);
        if ($s('ex-stat-redeem')) $s('ex-stat-redeem').textContent = '−' + fmt(totalRedeem);
        if ($s('ex-stat-purchase')) $s('ex-stat-purchase').textContent = '+' + fmt(totalPurchase);
        if ($s('ex-stat-purchase-count')) $s('ex-stat-purchase-count').textContent = purchaseCount + (purchaseCount === 1 ? ' transação' : ' transações');

        // Tabela
        if (items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted);">Sem movimentações neste filtro.</td></tr>';
        } else {
          tbody.innerHTML = items.map(function (t) {
            var d = (t.created_at || '').replace('T', ' ').slice(0, 16);
            var typeLabel = TYPE_LABEL[t.type] || t.type;
            var statusClass = STATUS_CLASS[t.status] || 'confirmado';
            var statusLabel = t.status === 'confirmed' ? 'Confirmado'
                              : t.status === 'pending' ? 'Pendente'
                              : t.status === 'reversed' ? 'Estornado' : t.status;
            var sign = t.amount_pts > 0 ? '+' : '−';
            var amount = sign + fmt(Math.abs(t.amount_pts));
            var amountClass = t.amount_pts > 0 ? 'amount-pos' : 'amount-neg';
            return '<tr>' +
              '<td data-label="Data">' + d + '</td>' +
              '<td data-label="Descrição">' + (t.description || '—') + '</td>' +
              '<td data-label="Tipo">' + typeLabel + '</td>' +
              '<td data-label="Status"><span class="status ' + statusClass + '">● ' + statusLabel + '</span></td>' +
              '<td data-label="Pontos" class="right ' + amountClass + '">' + amount + '</td>' +
              '</tr>';
          }).join('');
        }

        var $c = document.getElementById('ex-count');
        if ($c) $c.textContent = 'Mostrando ' + items.length + ' de ' + (r.items || []).length + ' transações';
        var $lf = document.getElementById('ex-last-fetch');
        if ($lf) $lf.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
      }).catch(function (e) {
        var cls = bxClassifyError(e, 'Endpoint /wallet/transactions nao respondeu.');
        bxRenderError({
          kind: 'row', host: tbody, cols: 5,
          message: cls.message, hint: cls.hint,
          onRetry: reload,
        });
      });

      // Saldo atual da carteira (paridade Mac)
      api('/wallet/').then(function (w) {
        var $b = document.getElementById('ex-stat-balance');
        if ($b) $b.textContent = fmt(w.balance_pts);
      }).catch(function () {});
    }

    window.reloadExtrato = reload;
    reload();
  }

  // =========================================================================
  // Helpers de auth/fluxo (Fase 1)
  // =========================================================================
  function passwordStrength(pwd) {
    pwd = pwd || '';
    var score = 0, hints = [];
    if (pwd.length >= 10) score++; else hints.push('10+ caracteres');
    if (/[a-z]/.test(pwd)) score++; else hints.push('minúscula');
    if (/[A-Z]/.test(pwd)) score++; else hints.push('maiúscula');
    if (/\d/.test(pwd)) score++; else hints.push('número');
    if (/[^A-Za-z0-9\s]/.test(pwd)) score++; else hints.push('caractere especial');
    var labels = ['muito fraca','fraca','razoável','boa','forte'];
    return { score: score, label: labels[Math.max(0, score - 1)] || 'muito fraca', hints: hints, ok: score === 5 };
  }

  function attachPasswordStrength(input, target) {
    if (!input || !target) return;
    var defaultText = target.textContent;
    input.addEventListener('input', function () {
      var pwd = input.value;
      if (!pwd) { target.textContent = defaultText; target.style.color = ''; return; }
      var r = passwordStrength(pwd);
      var colors = ['#a83417','#a83417','#8a6500','#2d651b','#2d651b'];
      target.style.color = colors[Math.max(0, r.score - 1)] || '#888';
      target.textContent = 'Senha ' + r.label + (r.hints.length ? ' — falta: ' + r.hints.join(', ') : ' ✓');
    });
  }

  // ---- Recuperar senha (POST /auth/forgot-password) ----
  function initRecuperarSenha() {
    var form = $('#form-recuperar') || $('form');
    if (!form) return;
    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (form.querySelector('#email') || {}).value || '';
      var btn = form.querySelector('button[type="submit"], button.button');
      var orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
      api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) })
        .then(function (d) {
          notify(d.message || 'Se este email existir, enviaremos instruções.', 'ok');
          form.reset();
        })
        .catch(function (err) { notify(err.message || 'Falha ao processar', 'err'); })
        .then(function () {
          if (btn) { btn.disabled = false; btn.textContent = orig; }
        });
    });
  }

  // ---- Redefinir senha (POST /auth/reset-password) ----
  function initRedefinirSenha() {
    var token = new URLSearchParams(location.search).get('token') || '';
    var form = $('#form-redefinir') || $('form');
    var stateEl = $('#bx-state');
    var msgEl = $('#bx-state-msg');
    var showState = function (msg, kind) {
      if (!stateEl) return;
      stateEl.style.display = 'block';
      stateEl.className = 'alert ' + (kind || 'info');
      if (msgEl) msgEl.textContent = msg; else stateEl.textContent = msg;
    };
    if (!token) {
      showState('Link inválido ou expirado. Solicite um novo em "Esqueci minha senha".', 'warn');
      if (form) form.style.display = 'none';
      return;
    }
    if (!form) return;
    attachPasswordStrength(form.querySelector('#senha'), $('#bx-strength'));

    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var senha = (form.querySelector('#senha') || {}).value || '';
      var confirm = (form.querySelector('#senha-confirm') || {}).value || '';
      if (!passwordStrength(senha).ok) { notify('Senha fraca: use 10+ chars com maiúscula, minúscula, número e símbolo', 'warn'); return; }
      if (senha !== confirm) { notify('Confirmação não confere', 'warn'); return; }
      var btn = form.querySelector('button[type="submit"], button.button');
      var orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
      api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: token, password: senha, password_confirm: confirm }) })
        .then(function (d) {
          showState('Senha redefinida com sucesso. Redirecionando para o login...', 'ok');
          STORE.clear();
          setTimeout(function () { location.href = '/login'; }, 1500);
        })
        .catch(function (err) {
          var code = err.data && err.data.code;
          var msg = err.message || 'Falha ao redefinir senha';
          if (code === 'token_expired') msg = 'Este link expirou. Solicite um novo em "Esqueci minha senha".';
          else if (code === 'token_used') msg = 'Este link já foi utilizado.';
          else if (code === 'invalid_token') msg = 'Link inválido. Verifique a URL.';
          showState(msg, 'err');
          if (btn) { btn.disabled = false; btn.textContent = orig; }
        });
    });
  }

  // ---- Validação de email (POST /auth/verify-email) ----
  function initValidacao() {
    var token = new URLSearchParams(location.search).get('token') || '';
    var stateEl = $('#bx-state');
    var resendForm = $('#form-resend');
    var setState = function (msg, kind) {
      if (!stateEl) return;
      stateEl.className = 'alert ' + (kind || 'info');
      stateEl.innerHTML = '<div><p>' + msg + '</p></div>';
    };

    if (!token) {
      setState('Não recebeu o link? Informe seu email abaixo para reenviar.', 'info');
      if (resendForm) resendForm.style.display = 'block';
    } else {
      setState('Validando seu email...', 'info');
      api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: token }) })
        .then(function () {
          setState('Email confirmado com sucesso! Redirecionando para o login...', 'ok');
          setTimeout(function () { location.href = '/login'; }, 1800);
        })
        .catch(function (err) {
          var code = err.data && err.data.code;
          var msg = err.message || 'Token inválido';
          if (code === 'token_expired') msg = 'Este link expirou. Solicite um novo abaixo.';
          else if (code === 'token_used') msg = 'Este link já foi utilizado. Faça login normalmente.';
          else if (code === 'invalid_token') msg = 'Link inválido. Verifique a URL ou solicite um novo.';
          setState(msg, 'err');
          if (resendForm) resendForm.style.display = 'block';
        });
    }

    if (resendForm) {
      resendForm.setAttribute('novalidate', 'novalidate');
      resendForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (resendForm.querySelector('#email') || {}).value || '';
        var btn = resendForm.querySelector('button[type="submit"]');
        var orig = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) })
          .then(function (d) { notify(d.message || 'Se necessário, enviamos novo link.', 'ok'); })
          .catch(function (err) { notify(err.message || 'Falha ao reenviar', 'err'); })
          .then(function () { if (btn) { btn.disabled = false; btn.textContent = orig; } });
      });
    }
  }

  // ---- Perfil (GET /auth/me + PATCH /user/profile) ----
  function initPerfil() {
    if (!requireAuth()) return;

    function setVal(sel, v) {
      var el = $(sel);
      if (el) el.value = v == null ? '' : v;
    }
    function setText(sel, v) {
      var el = $(sel);
      if (el) el.textContent = v == null ? '' : v;
    }

    api('/auth/me').then(function (d) {
      var u = d.user || d;
      STORE.setUser(u);
      // Inputs do formulario
      setVal('#perfil-nome', u.name);
      setVal('#perfil-email', u.email);
      // Mantemos email editavel via fluxo proprio (PATCH /user/email) mas
      // bloqueamos aqui pra evitar troca silenciosa no submit de "Salvar".
      var emailEl = $('#perfil-email');
      if (emailEl) emailEl.readOnly = true;
      setVal('#perfil-phone', u.phone || '');
      setVal('#perfil-bday', u.birth_date || '');
      setVal('#perfil-cpf', u.cpf || '');
      // Cabecalho da pagina
      setText('#bx-perfil-fullname', u.name || 'Sem nome');
      if (u.created_at) {
        var d2 = new Date(u.created_at);
        if (!isNaN(d2)) {
          var mm = String(d2.getMonth() + 1).padStart(2, '0');
          var yyyy = d2.getFullYear();
          setText('#bx-perfil-since', 'Plano Plus · cliente desde ' + mm + '/' + yyyy);
        }
      }
    }).catch(function (err) {
      if (err && err.status !== 401) {
        notify(err.message || 'Falha ao carregar perfil', 'err');
      }
    });

    var form = $('#form-perfil');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var nome = ($('#perfil-nome') || {}).value || '';
        if (!nome.trim() || nome.trim().split(/\s+/).length < 2) {
          notify('Informe nome e sobrenome', 'warn');
          return;
        }
        var saveBtn = $('#bx-perfil-save') || form.querySelector('button[type="submit"], button');
        if (saveBtn) saveBtn.disabled = true;
        api('/user/profile', { method: 'PATCH', body: JSON.stringify({ name: nome.trim() }) })
          .then(function (d) {
            STORE.setUser(d.user);
            setText('#bx-perfil-fullname', d.user.name);
            notify('Perfil atualizado', 'ok');
          })
          .catch(function (err) {
            if (err && err.status === 404) {
              notify('Edição de perfil ainda não disponível no servidor', 'warn');
            } else {
              notify((err && err.message) || 'Falha ao salvar', 'err');
            }
          })
          .then(function () { if (saveBtn) saveBtn.disabled = false; });
      });
    }
  }

  // ---- Segurança da conta (senha + telefone + 2FA + sessões + acesso) ----
  function initSeguranca() {
    if (!requireAuth()) return;

    // ------ Detecta Google-only e oferece "Definir senha" ------
    // Faz fetch /auth/me upfront pra decidir se mostra form ou hint.
    api('/auth/me').then(function (d) {
      var u = (d && d.user) || d || {};
      STORE.setUser(u);
      var googleOnly = (u.has_password === false) || (u.auth_provider === 'google' && !u.has_password);
      var formS = $('#form-senha');
      if (googleOnly && formS) {
        // Esconde form de "senha atual" + mostra CTA "Definir senha"
        formS.style.display = 'none';
        var card = formS.closest('.card');
        if (card && !$('#bx-google-only-hint')) {
          var hint = document.createElement('div');
          hint.id = 'bx-google-only-hint';
          hint.style.cssText = 'padding:14px;border-radius:10px;background:#e8f3ff;border:1px solid #c1ddff;font-size:13px;line-height:1.5;margin-top:12px;color:#1c4f87;';
          hint.innerHTML =
            '<strong>Sua conta entra via Google.</strong> ' +
            'Você ainda não tem senha local. Para também acessar por email+senha, ' +
            'envie um link de definição de senha para o seu email.' +
            '<button type="button" id="bx-send-first-password" class="button" style="margin-top:10px;display:block;">Receber link para definir senha</button>';
          card.appendChild(hint);
          $('#bx-send-first-password').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Enviando…';
            api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: u.email }) })
              .then(function () {
                notify('Link enviado para ' + u.email + '. Confira sua caixa.', 'ok');
                btn.textContent = '✓ Link enviado';
              })
              .catch(function () {
                notify('Falha ao enviar', 'err');
                btn.disabled = false; btn.textContent = orig;
              });
          });
        }
      }
    }).catch(function () { /* offline: deixa o form normal */ });

    // ------ 1. Trocar senha ------
    var formSenha = $('#form-senha');
    if (formSenha) {
      attachPasswordStrength(formSenha.querySelector('#senha-nova'), $('#bx-strength'));
      formSenha.addEventListener('submit', function (e) {
        e.preventDefault();
        var current = ($('#senha-atual') || {}).value || '';
        var nova = ($('#senha-nova') || {}).value || '';
        var confirm = ($('#senha-confirm') || {}).value || '';
        if (!current) { notify('Informe sua senha atual', 'warn'); return; }
        if (!passwordStrength(nova).ok) { notify('Senha fraca: use 10+ chars com maiúscula, minúscula, número e símbolo', 'warn'); return; }
        if (nova !== confirm) { notify('Confirmação não confere', 'warn'); return; }
        var btn = formSenha.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        api('/user/password', { method: 'PATCH', body: JSON.stringify({ current_password: current, new_password: nova, new_password_confirm: confirm }) })
          .then(function () {
            notify('Senha alterada. Faça login novamente.', 'ok');
            STORE.clear();
            setTimeout(function () { location.href = '/login.html'; }, 1500);
          })
          .catch(function (err) {
            if (err && err.status === 404) notify('Troca de senha indisponível no servidor atual', 'warn');
            else notify((err && err.message) || 'Falha ao trocar senha', 'err');
            if (btn) btn.disabled = false;
          });
      });
    }

    // ------ 2. Telefone + 2FA ------
    var formPhone = $('#form-phone');
    var formVerify = $('#form-phone-verify');
    var statusEl = $('#bx-2fa-status');
    var actionsEl = $('#bx-2fa-actions');
    var phoneStatusEl = $('#bx-phone-status');

    function renderMfaState(u) {
      if (!statusEl || !u) return;
      if (u.mfa_enabled && u.mfa_method === 'sms') {
        statusEl.className = 'status confirmado mt-2';
        statusEl.textContent = '● 2FA por SMS ativada — número ' + (u._phone_masked || '***');
      } else if (u.phone_verified) {
        statusEl.className = 'status pendente mt-2';
        statusEl.textContent = '○ Telefone verificado, mas 2FA inativa';
      } else if (u.phone) {
        statusEl.className = 'status pendente mt-2';
        statusEl.textContent = '○ Telefone aguardando verificação';
      } else {
        statusEl.className = 'status mt-2';
        statusEl.textContent = '○ Sem telefone cadastrado';
      }
      // Botoes de acao
      if (!actionsEl) return;
      actionsEl.innerHTML = '';
      if (u.phone_verified && !u.mfa_enabled) {
        var bEn = document.createElement('button');
        bEn.type = 'button'; bEn.className = 'button';
        bEn.textContent = 'Ativar 2FA por SMS';
        bEn.addEventListener('click', enable2FA);
        actionsEl.appendChild(bEn);
      }
      if (u.mfa_enabled) {
        var bDis = document.createElement('button');
        bDis.type = 'button'; bDis.className = 'button ghost';
        bDis.textContent = 'Desativar 2FA';
        bDis.addEventListener('click', disable2FA);
        actionsEl.appendChild(bDis);
      }
      if (u.phone) {
        var bRem = document.createElement('button');
        bRem.type = 'button'; bRem.className = 'button secondary';
        bRem.style.marginLeft = '8px';
        bRem.textContent = 'Remover telefone';
        bRem.addEventListener('click', removePhone);
        actionsEl.appendChild(bRem);
      }
    }

    function loadMe() {
      api('/auth/me').then(function (d) {
        var u = d.user || d;
        // mascara telefone aqui no front (backend tambem mascara em access-log)
        if (u.phone) {
          u._phone_masked = '***' + String(u.phone).slice(-4);
          var phoneEl = $('#bx-phone');
          if (phoneEl && !phoneEl.value) phoneEl.value = u.phone;
        }
        STORE.setUser(u);
        renderMfaState(u);
      }).catch(function () {
        if (statusEl) { statusEl.className = 'status mt-2'; statusEl.textContent = '— indisponível —'; }
      });
    }

    if (formPhone) {
      formPhone.addEventListener('submit', function (e) {
        e.preventDefault();
        var phone = ($('#bx-phone') || {}).value || '';
        if (!phone.replace(/\D/g, '').match(/^\d{10,15}$/)) {
          notify('Telefone inválido. Use (11) 99999-9999', 'warn'); return;
        }
        var btn = $('#bx-phone-send');
        if (btn) btn.disabled = true;
        api('/user/phone', { method: 'POST', body: JSON.stringify({ phone: phone }) })
          .then(function (d) {
            if (phoneStatusEl) phoneStatusEl.textContent = 'Código enviado para ' + (d.phone_masked || phone) + '. Verifique seu SMS.';
            if (formVerify) formVerify.style.display = 'block';
            var codeEl = $('#bx-phone-code');
            if (codeEl) codeEl.focus();
          })
          .catch(function (err) {
            if (err && err.status === 404) notify('Cadastro de telefone indisponível no servidor atual', 'warn');
            else if (err && err.status === 429) notify(err.message + ' (' + ((err.data && err.data.retry_in) || '?') + 's)', 'warn');
            else notify((err && err.message) || 'Falha ao enviar SMS', 'err');
          })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    if (formVerify) {
      formVerify.addEventListener('submit', function (e) {
        e.preventDefault();
        var code = ($('#bx-phone-code') || {}).value || '';
        if (!/^\d{6}$/.test(code)) { notify('Código de 6 dígitos', 'warn'); return; }
        var btn = $('#bx-phone-verify-btn');
        if (btn) btn.disabled = true;
        api('/user/phone/verify', { method: 'POST', body: JSON.stringify({ code: code }) })
          .then(function (d) {
            notify('Telefone verificado!', 'ok');
            STORE.setUser(d.user);
            formVerify.style.display = 'none';
            if (phoneStatusEl) phoneStatusEl.textContent = 'Telefone verificado ✓';
            loadMe();
          })
          .catch(function (err) { notify((err && err.message) || 'Código inválido', 'err'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }

    function enable2FA() {
      if (!confirm('Ativar 2FA por SMS? Você precisará do código a cada novo login.')) return;
      api('/user/2fa/sms/enable', { method: 'POST', body: JSON.stringify({}) })
        .then(function (d) { notify('2FA ativada', 'ok'); STORE.setUser(d.user); loadMe(); })
        .catch(function (err) { notify((err && err.message) || 'Falha ao ativar', 'err'); });
    }
    function disable2FA() {
      var pwd = prompt('Para desativar a 2FA, confirme sua senha:');
      if (!pwd) return;
      api('/user/2fa/sms/disable', { method: 'POST', body: JSON.stringify({ password: pwd }) })
        .then(function (d) { notify('2FA desativada', 'ok'); STORE.setUser(d.user); loadMe(); })
        .catch(function (err) { notify((err && err.message) || 'Falha ao desativar', 'err'); });
    }
    function removePhone() {
      var pwd = prompt('Para remover o telefone, confirme sua senha:');
      if (!pwd) return;
      api('/user/phone', { method: 'DELETE', body: JSON.stringify({ password: pwd }) })
        .then(function (d) {
          notify('Telefone removido', 'ok');
          STORE.setUser(d.user);
          var phoneEl = $('#bx-phone'); if (phoneEl) phoneEl.value = '';
          if (formVerify) formVerify.style.display = 'none';
          if (phoneStatusEl) phoneStatusEl.textContent = '';
          loadMe();
        })
        .catch(function (err) { notify((err && err.message) || 'Falha ao remover', 'err'); });
    }

    loadMe();

    // ------ 3. Sessões ativas ------
    function loadSessions() {
      var sessList = $('#bx-sessions-list');
      if (!sessList) return;
      api('/user/sessions').then(function (d) {
        var rows = (d.sessions || []).map(function (s) {
          var curMark = s.current ? ' <strong style="color:var(--ink);">(esta)</strong>' : '';
          return '<tr>' +
            '<td data-label="Dispositivo"><strong>' + (s.device_name || '—') + '</strong>' + curMark + '</td>' +
            '<td data-label="IP">' + (s.ip_address || '—') + '</td>' +
            '<td data-label="Atividade">' + (s.last_used_at ? new Date(s.last_used_at).toLocaleString('pt-BR') : '—') + '</td>' +
            '<td data-label="">' + (s.current ? '<span class="status ativo">● ativa</span>' : '<button type="button" data-id="' + s.id + '" class="button ghost small" style="color:var(--danger-text);">Encerrar</button>') + '</td>' +
            '</tr>';
        }).join('');
        sessList.innerHTML = rows || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">Sem sessões ativas.</td></tr>';
        $$('[data-id]', sessList).forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Encerrar esta sessão?')) return;
            api('/user/sessions/' + b.dataset.id, { method: 'DELETE' })
              .then(function () { notify('Sessão encerrada', 'ok'); loadSessions(); })
              .catch(function (e) { notify((e && e.message) || 'Falha', 'err'); });
          });
        });
      }).catch(function (err) {
        sessList.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">Histórico indisponível</td></tr>';
      });
    }
    loadSessions();

    var logoutAllBtn = $('#bx-logout-all');
    if (logoutAllBtn) {
      logoutAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!confirm('Encerrar todas as outras sessões?')) return;
        api('/auth/logout-all', { method: 'POST' })
          .then(function (d) { notify('Sessões encerradas: ' + (d.revoked || 0), 'ok'); STORE.clear(); location.href = '/login.html'; })
          .catch(function (e) { notify((e && e.message) || 'Falha', 'err'); });
      });
    }

    // ------ 4. Histórico de acessos ------
    var logBody = $('#bx-access-log');
    var eventLabels = {
      'auth.login.success': '✓ Login com sucesso',
      'auth.login.fail': '✗ Tentativa de login (falha)',
      'auth.login.blocked': '✗ Login bloqueado',
      'auth.logout': '↩ Logout',
      'auth.logout.all': '↩ Logout de todas as sessões',
      'user.password.changed': '🔑 Senha alterada',
      'auth.reset_password.success': '🔑 Senha redefinida via email',
      'user.mfa.enabled': '🛡 2FA ativada',
      'user.mfa.disabled': '🛡 2FA desativada',
      'auth.mfa.challenge_success': '🛡 2FA validada no login',
      'auth.mfa.challenge_fail': '🛡 Falha em 2FA',
      'user.phone.verified': '📱 Telefone verificado',
      'user.phone.removed': '📱 Telefone removido',
      'user.email.changed': '✉ Email alterado'
    };
    var eventStatusClass = function (ev) {
      if (ev.indexOf('fail') >= 0 || ev.indexOf('blocked') >= 0) return 'pendente';
      if (ev.indexOf('success') >= 0 || ev.indexOf('verified') >= 0 || ev.indexOf('changed') >= 0 || ev.indexOf('enabled') >= 0) return 'confirmado';
      return '';
    };
    if (logBody) {
      api('/user/access-log').then(function (d) {
        var items = d.items || [];
        if (!items.length) {
          logBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">Sem eventos registrados.</td></tr>';
          return;
        }
        logBody.innerHTML = items.map(function (it) {
          var when = it.at ? new Date(it.at).toLocaleString('pt-BR') : '—';
          var label = eventLabels[it.event] || it.event;
          var cls = eventStatusClass(it.event);
          return '<tr>' +
            '<td data-label="Data">' + when + '</td>' +
            '<td data-label="Evento"><span class="status ' + cls + '">' + label + '</span></td>' +
            '<td data-label="Dispositivo">' + (it.device || '—') + '</td>' +
            '<td data-label="IP">' + (it.ip || '—') + '</td>' +
            '</tr>';
        }).join('');
      }).catch(function (err) {
        logBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">Histórico indisponível no servidor atual</td></tr>';
      });
    }
  }

  // ---- Logout que avisa o backend ----
  function logoutAndRedirect() {
    api('/auth/logout', { method: 'POST' }).catch(function () {}).then(function () {
      STORE.clear();
      location.href = '/login.html';
    });
  }
  window.blaxxLogout = logoutAndRedirect;

  // ---- Handler global de cliques em "Sair" e "Entrar" hardcoded no HTML ----
  // Muitas páginas têm <a href="login.html">Sair</a> direto no HTML, sem JS
  // anexado. Sem este handler, o link só navega pra login.html sem limpar
  // o STORE — usuário acha que "deslogou" mas o token continua, causando
  // bounce de volta pro dashboard via redirectIfLoggedIn.
  //
  // Solução: event delegation no document — intercepta TODO <a> que aponta
  // pra login.html e analisa o texto pra decidir:
  //   - "Sair", "Logout", "↩ Sair" → executa logout completo
  //   - "Entrar" → se logado, vai pro dashboard (não faz nada confuso)
  function installGlobalLogoutHandler() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      // Só intercepta links pra /login (com ou sem .html, com ou sem path)
      if (!/^\/?login(\.html)?(\?|#|$)/.test(href) && href.indexOf('login.html') < 0) return;
      var text = (a.textContent || '').trim().toLowerCase();
      // Sair → logout proper
      if (text.indexOf('sair') >= 0 || text.indexOf('logout') >= 0) {
        e.preventDefault();
        logoutAndRedirect();
        return;
      }
      // Entrar / Cadastre-se quando JÁ logado → manda pro dashboard
      // (evita o bounce visível login→dashboard)
      if (STORE.token() && (text.indexOf('entrar') >= 0 || text.indexOf('cadastre') >= 0)) {
        e.preventDefault();
        location.href = '/dashboard.html';
      }
    }, true);
  }

  // ---- Redirect logado tentando acessar /login ou /cadastro ----
  // SINCRONO: redireciona imediatamente se ha token, pra evitar flash da
  // tela de login. Se o token vier a ser invalido, o /auth/me no dashboard
  // dispara o 401 handler global e bounca o user pro login proper.
  // Retorna true se redirecionou (caller deve nao inicializar nada).
  function redirectIfLoggedIn() {
    if (STORE.token()) {
      location.href = '/dashboard.html';
      return true;
    }
    return false;
  }

  // =========================================================================
  // Router
  // =========================================================================
  // Suporta tanto URLs "tradicionais" (login.html) quanto "pretty URLs" do
  // Netlify (/login). Ambas mapeiam para a mesma chave em INITS.
  var rawPage = (location.pathname.split('/').pop() || 'index').toLowerCase();
  var PAGE = rawPage.indexOf('.') >= 0 ? rawPage : rawPage + '.html';
  if (PAGE === '.html' || PAGE === '') PAGE = 'index.html';
  var INITS = {
    'login.html': function () { if (redirectIfLoggedIn()) return; initLogin(); },
    'cadastro.html': function () { if (redirectIfLoggedIn()) return; initCadastro(); },
    'recuperar-senha.html': initRecuperarSenha,
    'redefinir-senha.html': initRedefinirSenha,
    'validacao.html': initValidacao,
    'perfil.html': initPerfil,
    'seguranca.html': initSeguranca,
    'dashboard.html': initDashboardEnhanced,
    'carteira.html': initCarteira,
    'extrato.html': initExtrato,
    'comprar-pontos.html': initComprarPontosReal,
    'parceiros.html': initParceirosReal,
    'resgates.html': initResgatesReal,
    'pagamento-pix.html': initPagamentoPix,
    'compra-aprovada.html': initCompraAprovada,
    'enviar-pontos.html': initEnviarPontos,
    'confirmar-envio.html': initConfirmarEnvio,
    'envio-concluido.html': initEnvioConcluido,
    'resgate-pix.html': initResgatePix,
    'beneficio-detalhe.html': initBeneficioDetalhe,
    'detalhe-beneficio.html': initBeneficioDetalhe,
    'campanhas.html': initCampanhas,
    'central-notificacoes.html': initNotificacoes
  };

  // A11y global: injeta skip link + marca aria-current nos nav items.
  // Roda em TODAS as paginas (publicas e logadas), antes do init especifico.
  function applyA11yGlobals() {
    // 1. Skip link — primeiro elemento focavel da pagina, oculto ate Tab.
    //    Pula direto pro <main>. Se main nao tem id, atribui um.
    if (!document.querySelector('.bx-skip-link')) {
      var mainEl = document.querySelector('main');
      if (mainEl) {
        if (!mainEl.id) mainEl.id = 'bx-main';
        // Aria-label pra screen reader confirmar onde esta indo
        if (!mainEl.hasAttribute('role')) mainEl.setAttribute('role', 'main');
        var link = document.createElement('a');
        link.className = 'bx-skip-link';
        link.href = '#' + mainEl.id;
        link.textContent = 'Pular para o conteúdo';
        document.body.insertBefore(link, document.body.firstChild);
      }
    }

    // 2. aria-current=page nos links de navegacao que apontam pra pagina atual.
    //    Marca tanto rotas .html quanto pretty URLs. Screen readers anunciam
    //    "current page" automaticamente nessa marcacao.
    var here = PAGE.replace('.html', '');
    var navLinks = document.querySelectorAll('header a[href], aside.sidebar a[href], aside.sidebar [onclick]');
    navLinks.forEach(function (a) {
      var href = (a.getAttribute('href') || '').replace(/^\//, '').replace('.html', '');
      var onclick = a.getAttribute('onclick') || '';
      // Detecta onclick="go('xxx.html')" ou href="xxx.html"
      var matches = false;
      if (href === here) matches = true;
      var m = onclick.match(/go\(['"]([^'"]+)/);
      if (m && m[1].replace('.html', '') === here) matches = true;
      if (matches) a.setAttribute('aria-current', 'page');
    });

    // 3. Garante que <html lang="pt-BR"> esta presente (algumas paginas
    //    podem ter sido criadas sem o attr).
    if (!document.documentElement.lang) {
      document.documentElement.lang = 'pt-BR';
    }
  }

  function bootstrap() {
    // Instala interceptador global de Sair/Entrar SEMPRE — funciona logado
    // ou deslogado e em qualquer página com links pra /login.html.
    installGlobalLogoutHandler();
    applyA11yGlobals();

    var initFn = INITS[PAGE];
    if (initFn) initFn();
    // applyUserToShell é idempotente — chama SEMPRE que houver token,
    // mesmo em páginas com init. Cobre sidebar/navbar/avatar que os
    // inits específicos (initPerfil, initSeguranca, ...) não tocam.
    if (STORE.token()) applyUserToShell();
  }

  // Re-aplica ao terminar transições, garantindo override em qualquer página
  window.addEventListener('pageshow', function () {
    if (STORE.token()) applyUserToShell();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // =========================================================================
  // PWA: registro do service worker + install prompt + recursos mobile
  // =========================================================================

  // Registra o service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      // SW registrado na raiz — site é servido em /, não em /site/.
      // Bug anterior: registro em /site/service-worker.js retornava 404 e
      // a PWA nunca instalava (manifest + scope tambem apontavam /site/).
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .catch(function (e) { console.warn('SW falhou:', e); });
    });
  }

  // Install prompt (Android/Chrome). iOS exige instrucao manual.
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });

  function showInstallButton() {
    if (document.getElementById('bx-install-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'bx-install-btn';
    btn.textContent = '+ Instalar app';
    btn.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:9000;background:#C6F432;color:#080907;' +
      'border:0;padding:12px 22px;border-radius:999px;font-weight:700;font-size:14px;' +
      'box-shadow:0 12px 32px rgba(0,0,0,.18);cursor:pointer;font-family:Inter,sans-serif;';
    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (c) {
        if (c.outcome === 'accepted') btn.remove();
        deferredPrompt = null;
      });
    });
    document.body.appendChild(btn);
  }

  // iOS: detecta Safari mobile e mostra dica para "Adicionar a tela inicial"
  function showIOSInstallHint() {
    if (sessionStorage.getItem('blaxx_ios_hint')) return;
    var ua = navigator.userAgent;
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isInStandalone = window.navigator.standalone === true;
    if (!isIOS || isInStandalone) return;
    sessionStorage.setItem('blaxx_ios_hint', '1');
    var bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:9000;background:#080907;color:#C6F432;' +
      'padding:14px 18px;font-family:Inter,sans-serif;font-size:13px;display:flex;align-items:center;gap:8px;';
    bar.innerHTML =
      '<span style="flex:1;line-height:1.4;">Para instalar como app: toque em <strong>Compartilhar</strong> ' +
      'e depois em <strong>Adicionar à Tela de Início</strong>.</span>' +
      '<button style="background:transparent;border:1px solid #C6F432;color:#C6F432;padding:6px 12px;border-radius:8px;font-weight:700;">OK</button>';
    bar.querySelector('button').addEventListener('click', function () { bar.remove(); });
    document.body.appendChild(bar);
  }
  setTimeout(showIOSInstallHint, 1500);

  // =========================================================================
  // Deep link PIX: abre o app do banco com BR Code (Android)
  // =========================================================================
  // Padrao Bacen (em estudo): nao ha esquema "pix:" universal aceito ainda.
  // O caminho confiavel hoje e' "copiar codigo" + abrir o app do banco.
  // Em Android e' possivel acionar Intent direto se o usuario tiver app que
  // registre o esquema. Aqui exponho a funcao globalmente para a tela usar.
  window.blaxxOpenBankApp = function (brCode) {
    navigator.clipboard.writeText(brCode).then(function () {
      notify('Código PIX copiado. Abra o app do seu banco e cole em "PIX Copia e Cola".', 'ok');
    }).catch(function () {
      notify('Selecione e copie o código manualmente.', 'warn');
    });
  };

  // =========================================================================
  // Leitor de QR Code (camera) - usado em parceiros para acumular pontos
  // =========================================================================
  // API exposta como window.blaxxScanQR(callback). Usa BarcodeDetector quando
  // disponivel (Chrome Android), senao mostra instrucao para colar manual.
  window.blaxxScanQR = function (cb) {
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;' +
      'align-items:center;justify-content:center;flex-direction:column;color:white;font-family:Inter,sans-serif;';
    overlay.innerHTML =
      '<div style="font-size:14px;margin-bottom:10px;color:#C6F432;">Escanear QR Code</div>' +
      '<video id="bx-cam" playsinline autoplay style="max-width:90vw;max-height:60vh;border-radius:18px;background:black;"></video>' +
      '<div id="bx-cam-msg" style="font-size:12px;color:#888;margin-top:10px;text-align:center;max-width:80vw;">Aponte para o QR Code do parceiro</div>' +
      '<button id="bx-cam-cancel" style="margin-top:14px;background:white;color:#080907;border:0;padding:10px 22px;border-radius:999px;font-weight:700;cursor:pointer;">Cancelar</button>';
    document.body.appendChild(overlay);

    var video = overlay.querySelector('#bx-cam');
    var msg = overlay.querySelector('#bx-cam-msg');
    var stream = null;
    var detector = null;
    var raf = null;

    function close(result) {
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      overlay.remove();
      if (cb) cb(result || null);
    }
    overlay.querySelector('#bx-cam-cancel').addEventListener('click', function () { close(null); });

    if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
      msg.textContent = 'Seu navegador não tem câmera. Cole o código manualmente.';
      return;
    }
    if ('BarcodeDetector' in window) {
      try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function (s) {
        stream = s; video.srcObject = s;
        if (!detector) {
          msg.textContent = 'Câmera ativa. Detecção automática de QR não disponível neste navegador — Capacitor resolve.';
          return;
        }
        function tick() {
          detector.detect(video).then(function (codes) {
            if (codes && codes.length) { close(codes[0].rawValue); return; }
            raf = requestAnimationFrame(tick);
          }).catch(function () { raf = requestAnimationFrame(tick); });
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(function () { msg.textContent = 'Não consegui acessar a câmera. Verifique a permissão.'; });
  };

  // =========================================================================
  // Biometria (WebAuthn) - placeholder pronto para Capacitor
  // =========================================================================
  // No PWA puro, WebAuthn permite criar/usar credenciais ligadas ao Face ID
  // (iOS) e Touch/Face do Android. A API completa exige um endpoint backend
  // que ainda nao foi implementado (challenge + verify). Exponho stubs aqui:
  window.blaxxBiometricsAvailable = function () {
    return !!(window.PublicKeyCredential && navigator.credentials);
  };

  // =========================================================================
  // Push notifications - subscribe se o backend tiver VAPID
  // =========================================================================
  // Stub que verifica suporte. Em prod precisa: backend gera VAPID keys, expõe
  // /push/subscribe, e o SW handle o evento 'push' (já implementado).
  window.blaxxPushAvailable = function () {
    return 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
  };
  window.blaxxRequestPushPermission = function () {
    if (!window.blaxxPushAvailable()) return Promise.resolve('unsupported');
    return Notification.requestPermission();
  };
})();
