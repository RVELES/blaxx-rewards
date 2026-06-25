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

  // Sprint 2 (P4): Se o user esta logado (tem token), marca <html> com
  // data-auth-loading="true" o mais cedo possivel (este script roda no
  // final do <body>, mas antes de qualquer dado real ser pintado).
  // O CSS em styles.css esconde body[data-auth-loading] para evitar
  // FLASH visivel da Mariana Costa hardcoded nos HTMLs estaticos.
  // O atributo eh removido no fim de applyUserToShell() apos popular dados.
  try {
    var _t = sessionStorage.getItem('blaxx_token');
    if (_t) document.documentElement.setAttribute('data-auth-loading', 'true');
  } catch (_) { /* sessionStorage bloqueado */ }

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

  // ---- Helper: logos reais via Google Favicon API + DuckDuckGo fallback ----
  // Pedido do usuario: "logotipo estilizado e tamanho padrao... maximo de
  // realidade possivel"
  //
  // HISTORICO: Tentamos Clearbit Logo API primeiro (Jan 2024), mas a HubSpot
  // adquiriu a Clearbit e descontinuou a Logo API gratuita — todos os
  // requests ficavam pendentes / 000.
  //
  // SOLUCAO ATUAL — pipeline com 3 niveis:
  // 1. Google Favicon API (sz=128) — confiavel, retorna logo otimizado da
  //    marca a partir do dominio. ~99% das marcas conhecidas.
  // 2. DuckDuckGo Icons (.ico) — fallback secundario, similar mas menor.
  // 3. Emoji do partner (logo_emoji do banco) ou iniciais do nome.
  //
  // Extrai slug do partner description ("Parceiro Livelo · xyz" → xyz) ou
  // slugify do nome. Tenta .com.br primeiro (BR dominante), .com depois.
  // ---------------------------------------------------------------------------

  // Domain a partir do partner: prioriza slug do description, fallback nome.
  function bxPartnerDomain(p) {
    if (!p) return null;
    var slug = null;
    var desc = String(p.description || '');
    var dotIdx = desc.indexOf('·');
    if (dotIdx >= 0) {
      slug = desc.slice(dotIdx + 1).trim().toLowerCase()
        .replace(/[^a-z0-9-]/g, '');   // sanitize defensivo
    }
    if (!slug) {
      slug = bxSlugify(p.name);
    }
    if (!slug || slug.length < 2) return null;
    return slug + '.com.br';
  }

  // URL Google Favicon (primary)
  function bxGoogleFaviconUrl(domain) {
    return 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(domain);
  }

  // URL DuckDuckGo Icons (fallback secundario)
  function bxDdgIconUrl(domain) {
    return 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico';
  }

  function bxPartnerLogoUrl(p) {
    var domain = bxPartnerDomain(p);
    return domain ? bxGoogleFaviconUrl(domain) : null;
  }

  function bxSlugify(name) {
    return String(name || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function bxLogoUrlFromName(name) {
    var slug = bxSlugify(name);
    if (!slug || slug.length < 2) return null;
    return bxGoogleFaviconUrl(slug + '.com.br');
  }
  window.bxLogoUrlFromName = bxLogoUrlFromName;
  window.bxSlugify = bxSlugify;

  // Threshold pra considerar logo "real". Google Favicon retorna 16x16 (icone
  // globo generico) para dominios sem favicon proprio. Logos reais variam
  // de 32x32 a 256x256. Threshold 32 cobre todos os casos validos.
  var BX_LOGO_MIN_SIZE = 32;

  // Pipeline de tentativas: Google .com.br → DDG .com.br → Google .com → DDG .com
  // Em cada onload, verifica naturalWidth >= 32. Se <32, considera "fallback
  // globo generico" e tenta proxima fonte. Se naturalWidth ok, revela o card.
  // Em onerror, tenta proxima fonte. Se TUDO falhar, card fica oculto (user
  // pediu: "so carregue parceiros com logo ativada").
  window.bxLogoCheckReveal = function (img) {
    if (!img) return;
    if (img.naturalWidth >= BX_LOGO_MIN_SIZE) {
      // Logo valido. Card ja esta visivel (paint rapido); so confirma
      // marcando-o como nao-hidden pro contador.
      var card = img.closest('.partner-card, .market-card');
      if (card && card.dataset.bxHidden === '1') {
        delete card.dataset.bxHidden;
        bxCountVisibleSchedule();
      }
      return;
    }
    // Favicon generico → tenta proxima fonte
    bxLogoTryNext(img);
  };

  window.bxLogoTryNext = function (img) {
    if (!img) return;
    var tried = img.getAttribute('data-tried') || '';
    var src = img.getAttribute('src') || '';
    var domainMatch = src.match(/domain=([^&]+)/) || src.match(/ip3\/([^.]+\.[^.]+)/);
    var domain = domainMatch ? decodeURIComponent(domainMatch[1]) : '';

    if (!tried && domain) {
      img.setAttribute('data-tried', 'ddg-br');
      img.src = bxDdgIconUrl(domain);
      return;
    }
    if (tried === 'ddg-br' && domain.endsWith('.com.br')) {
      var stem = domain.replace(/\.com\.br$/, '.com');
      img.setAttribute('data-tried', 'g-com');
      img.src = bxGoogleFaviconUrl(stem);
      return;
    }
    if (tried === 'g-com' && domain.endsWith('.com')) {
      img.setAttribute('data-tried', 'ddg-com');
      img.src = bxDdgIconUrl(domain);
      return;
    }
    // Todas as 4 fontes falharam — card fica oculto.
    bxLogoFailHide(img);
  };

  window.bxLogoFailHide = function (img) {
    var card = img && img.closest('.partner-card, .market-card');
    if (card) {
      card.style.display = 'none';
      card.dataset.bxHidden = '1';
      bxCountVisibleSchedule();
    }
  };

  // Atualiza contador de cards visiveis (debounced ~500ms apos ultimo evento).
  var _bxCountTimer = null;
  function bxCountVisibleSchedule() {
    clearTimeout(_bxCountTimer);
    _bxCountTimer = setTimeout(function () {
      // Parceiros
      var ptGrid = document.getElementById('pt-grid');
      var ptCount = document.getElementById('pt-count');
      if (ptGrid && ptCount) {
        var visible = ptGrid.querySelectorAll('.partner-card:not([data-bx-hidden])').length;
        var total = ptGrid.querySelectorAll('.partner-card').length;
        ptCount.textContent = visible > 0
          ? 'Mostrando ' + visible + ' parceiros com logo'
          : 'Nenhum parceiro com logo disponivel agora.';
      }
      // Resgates/Beneficios
      var rgGrid = document.getElementById('rg-grid');
      var rgCount = document.getElementById('rg-count');
      if (rgGrid && rgCount) {
        var rVisible = rgGrid.querySelectorAll('.market-card:not([data-bx-hidden])').length;
        rgCount.textContent = rVisible > 0
          ? 'Mostrando ' + rVisible + ' beneficios'
          : 'Nenhum beneficio disponivel agora.';
      }
    }, 500);
  }

  // Compat: o bxLogoErr antigo agora delega para bxLogoTryNext + hide
  window.bxLogoErr = function (img, fallback) { bxLogoTryNext(img); };

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

    // Substituicao IMEDIATA dos placeholders hardcoded.
    //
    // Bug anterior: passava skip_numeric:true, deixando o "84.750 pts"
    // (saldo da Mariana de demo) visivel ate /wallet/ resolver. Quando o
    // endpoint falhava (cold start, 401, offline), o usuario via valores
    // antigos que NAO sao dele — pessimo UX e gera duvida.
    //
    // Agora: zera os placeholders na primeira passada. Se /wallet/ resolve,
    // valores reais aparecem em <1s. Se falha, mostra 0 — informativo
    // honesto em vez de mentira (84.750).
    replaceHardcoded({ balance_pts: 0, pending_pts: 0, balance_brl_equiv: 0 });

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
    }).catch(function () { /* sem wallet (404/401/offline): mantem so o nome */ })
      .then(function () {
        // Sprint 2 (P4): so revela o body APOS hidratar com dados reais.
        // Evita flash da Mariana Costa hardcoded nos HTMLs estaticos.
        try { document.documentElement.removeAttribute('data-auth-loading'); }
        catch (_) {}
      });
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

  // Lock global: previne envio duplicado quando o user clica Google duas
  // vezes (popup demora carregar → user reclica → 2 callbacks disparam).
  // Tambem suprime callbacks que cheguem APOS um login bem-sucedido (race
  // window de 350ms entre setToken e redirect).
  var _bxGoogleLoginInProgress = false;

  function handleGoogleCredential(response) {
    var err = document.getElementById('g-signin-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }

    // Idempotencia: se ja temos token valido OU login esta em curso, ignora.
    if (STORE.token()) {
      console.warn('[Blaxx] Google credential ignorado: ja autenticado');
      return;
    }
    if (_bxGoogleLoginInProgress) {
      console.warn('[Blaxx] Google credential duplicado ignorado (lock ativo)');
      return;
    }
    _bxGoogleLoginInProgress = true;
    // Esconde o container do botao Google pra usuario nao clicar de novo
    var gContainer = document.getElementById('g-signin-btn');
    if (gContainer) gContainer.style.pointerEvents = 'none';

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
        // Reduzido de 350ms pra 150ms — window menor pra duplo-callback.
        // Container ja esta pointer-events:none, entao usuario nao consegue
        // disparar callback adicional nesse intervalo.
        setTimeout(function () { location.href = next; }, 150);
      })
      .catch(function (e) {
        _bxGoogleLoginInProgress = false;
        if (gContainer) gContainer.style.pointerEvents = '';
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

    // Sprint 4 (S4-8) · Persiste rascunho do cadastro em sessionStorage.
    // Se o user clicar em "termos de uso" ou "privacidade", vai pra outra
    // pagina, e ao voltar nao perde o que ja preencheu. Senha NUNCA e'
    // persistida.
    var DRAFT_KEY = 'blaxx_signup_draft_v1';
    var DRAFT_FIELDS = ['nome', 'email', 'cpf', 'celular', 'bday'];

    function loadDraft() {
      try {
        var saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
        if (!saved) return;
        DRAFT_FIELDS.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && !el.value && typeof saved[id] === 'string') el.value = saved[id];
        });
        var cbT = document.getElementById('termos');
        var cbP = document.getElementById('privacidade');
        var cbL = document.getElementById('lgpd');
        var cbN = document.getElementById('news');
        if (cbT && saved.termos) cbT.checked = true;
        if (cbP && saved.privacidade) cbP.checked = true;
        if (cbL && saved.lgpd) cbL.checked = true;
        if (cbN && saved.news === false) cbN.checked = false;
      } catch (_) {}
    }

    function saveDraft() {
      var data = {};
      DRAFT_FIELDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) data[id] = el.value;
      });
      data.termos       = !!(document.getElementById('termos') || {}).checked;
      data.privacidade  = !!(document.getElementById('privacidade') || {}).checked;
      data.lgpd         = !!(document.getElementById('lgpd') || {}).checked;
      data.news         = !!(document.getElementById('news') || {}).checked;
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (_) {}
    }

    DRAFT_FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', saveDraft);
    });
    ['termos','privacidade','lgpd','news'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', saveDraft);
    });
    loadDraft();
    // Expoe pra clearDraft no submit success
    window._blaxxClearSignupDraft = function () {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
    };

    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = (form.querySelector('#nome') || {}).value || '';
      var email = (form.querySelector('#email') || {}).value || '';
      var cpf = (cpfEl || {}).value || '';
      var senha = (senhaEl || {}).value || '';
      var senhaConfirm = (form.querySelector('#senha-confirm') || {}).value || '';
      // Sprint 1 (LGPD): 3 aceites SEPARADOS no DOM e no payload
      var aceiteTermos      = (form.querySelector('#termos') || {}).checked || false;
      var aceitePrivacidade = (form.querySelector('#privacidade') || {}).checked || false;
      var aceiteLGPD        = (form.querySelector('#lgpd') || {}).checked || false;
      var news = (form.querySelector('#news') || {}).checked || false;

      if (!nome.trim() || nome.trim().split(/\s+/).length < 2) { notify('Informe nome completo (nome e sobrenome)', 'warn'); return; }
      if (!email.trim()) { notify('Informe um email válido', 'warn'); return; }
      if (!passwordStrength(senha).ok) { notify('Senha fraca: use 10+ chars com maiúscula, minúscula, número e símbolo', 'warn'); return; }
      if (senha !== senhaConfirm) { notify('Confirmação de senha não confere', 'warn'); return; }
      if (!aceiteTermos)      { notify('Você precisa aceitar os termos de uso', 'warn'); return; }
      if (!aceitePrivacidade) { notify('Você precisa aceitar a política de privacidade', 'warn'); return; }
      if (!aceiteLGPD)        { notify('Você precisa autorizar o tratamento de dados (LGPD)', 'warn'); return; }

      var btn = form.querySelector('button[type="submit"], button.button');
      var orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }

      // Payload reflete o que o usuario REALMENTE marcou (sem mais
      // "manda sempre true" — fraude documental de consentimento)
      var body = {
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        cpf: cpf.replace(/\D/g, ''),
        password: senha,
        password_confirm: senhaConfirm,
        accept_terms:    aceiteTermos,
        accept_privacy:  aceitePrivacidade,
        accept_lgpd:     aceiteLGPD,
        accept_terms_at: new Date().toISOString(),
        marketing_optin: news
      };
      api('/auth/register', { method: 'POST', body: JSON.stringify(body) })
        .then(function (data) {
          // Sprint 4 (S4-8): limpa o rascunho ao succeed
          if (typeof window._blaxxClearSignupDraft === 'function') {
            window._blaxxClearSignupDraft();
          }
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
      // Cards iniciam VISIVEIS pra paint rapido (antes era display:none
      // ate logo carregar — 258 imgs simultaneos saturavam pool e site
      // ficava extremamente lento). Agora:
      // - loading="lazy" nativo do browser → so requisita img quando
      //   card entra no viewport. Brower controla concorrencia.
      // - onload valida naturalWidth >= 32 (logo real, nao favicon globo)
      // - onerror ou logo invalido → bxLogoTryNext cascade (Google/DDG)
      // - Se TODAS as fontes falham → card vira display:none (filtro)
      grid.innerHTML = filtered.map(function (p) {
        var logoUrl = bxPartnerLogoUrl(p);
        if (!logoUrl) return '';   // sem dominio extraivel: pula
        return '<a href="detalhe-parceiro.html?id=' + p.id + '" class="partner-card" ' +
          'data-bx-hidden="1">' +
          '<div class="partner-logo">' +
            '<img src="' + logoUrl + '" alt="' + (p.name || '').replace(/"/g, '&quot;') +
            '" class="partner-logo-img" loading="lazy" decoding="async" ' +
            'onload="bxLogoCheckReveal(this)" ' +
            'onerror="bxLogoTryNext(this)">' +
          '</div>' +
          '<div><h3>' + p.name + '</h3>' +
          '<div class="rate">' + (p.accrual_rule || '') + '</div></div></a>';
      }).join('');
      var $c = document.getElementById('pt-count');
      if ($c) $c.textContent = 'Mostrando ' + filtered.length + ' parceiros (logos carregando ao rolar)';
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
  // =========================================================================
  // Detalhe do parceiro: fetch /partners/<id> + popula placeholders data-bx-*
  // =========================================================================
  function initDetalheParceiro() {
    var id = new URLSearchParams(location.search).get('id');
    if (!id) {
      // Fallback: sem id, mostra parceiros generic
      var firstName = document.querySelector('[data-bx-partner-name]');
      if (firstName) firstName.textContent = 'Parceiro nao identificado';
      return;
    }
    bxFetchJson(API + '/partners/' + id, { timeoutMs: 20000 })
      .then(function (p) {
        if (!p) return;
        // Nome — todos os placeholders
        document.querySelectorAll('[data-bx-partner-name]').forEach(function (el) {
          el.textContent = p.name || 'Parceiro';
        });
        // Categoria
        document.querySelectorAll('[data-bx-partner-category]').forEach(function (el) {
          el.textContent = p.category || 'Parceiro';
        });
        // Descricao
        document.querySelectorAll('[data-bx-partner-description]').forEach(function (el) {
          el.textContent = p.description || 'Parceiro Blaxx Pontos.';
        });
        // Regra de acumulo
        document.querySelectorAll('[data-bx-partner-rule]').forEach(function (el) {
          el.textContent = p.accrual_rule || '—';
        });
        // Logo Clearbit no hero
        var logoBox = document.querySelector('[data-bx-partner-logo]');
        if (logoBox) {
          var logoUrl = bxPartnerLogoUrl(p);
          var fallback = (p.logo_emoji || '◯').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          if (logoUrl) {
            logoBox.innerHTML = '<img src="' + logoUrl +
              '" alt="' + (p.name || '').replace(/"/g, '&quot;') + '" ' +
              'class="partner-logo-img" loading="lazy" ' +
              'onerror="bxLogoErr(this,\'' + fallback + '\')">';
          } else {
            logoBox.innerHTML = '<span class="partner-logo-fallback">' + fallback + '</span>';
          }
        }
        // Atualiza title da pagina
        document.title = (p.name || 'Parceiro') + ' | Blaxx Pontos';
      })
      .catch(function (err) {
        document.querySelectorAll('[data-bx-partner-name]').forEach(function (el) {
          el.textContent = 'Parceiro nao encontrado';
        });
        document.querySelectorAll('[data-bx-partner-description]').forEach(function (el) {
          el.textContent = 'O parceiro solicitado nao foi encontrado ou esta inativo. ' +
            (err && err.message ? '(' + err.message + ')' : '');
        });
      });
  }

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
      // Mesma estrategia rapida: visivel + lazy. Hide so se logo falhar.
      grid.innerHTML = filtered.map(function (b) {
        if (!b.partner_name) return '';
        var logoUrl = bxLogoUrlFromName(b.partner_name);
        if (!logoUrl) return '';
        var tag = b.tag ? '<div class="tag-row"><span class="glyph-sm">▣</span> ' + b.tag + '</div>' : '';
        return '<a href="beneficio-detalhe.html?id=' + b.id + '" class="market-card" ' +
          'data-bx-hidden="1">' +
          tag +
          '<div class="market-logo">' +
            '<img src="' + logoUrl + '" alt="' + b.partner_name.replace(/"/g, '&quot;') +
            '" class="partner-logo-img" loading="lazy" decoding="async" ' +
            'onload="bxLogoCheckReveal(this)" ' +
            'onerror="bxLogoTryNext(this)"></div>' +
          '<h3>' + b.name + '</h3>' +
          '<div class="market-partner">' + b.partner_name + '</div>' +
          '<div class="pts">' + fmt(b.cost_pts) + ' <small>pts</small></div>' +
          '<span class="market-cta">Resgatar</span></a>';
      }).join('');
      var $c = document.getElementById('rg-count');
      if ($c) $c.textContent = 'Mostrando ' + filtered.length + ' beneficios (logos ao rolar)';
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
        api('/auth/change-password', { method: 'POST', body: JSON.stringify({ old_password: current, new_password: nova }) })
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
        api('/auth/sessions/revoke-all', { method: 'POST' })
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
    'detalhe-parceiro.html': initDetalheParceiro,
    'parceiro-detalhe.html': initDetalheParceiro,
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

  // =========================================================================
  // Sprint 3 (S3-2) · Hamburger menu mobile
  // =========================================================================
  // Antes deste fix, a nav some abaixo de 880px sem replacement — usuario
  // mobile fica sem navegar. Agora injeta botao hamburger no .nav e drawer
  // com aria + ESC + scroll lock + focus trap.
  function installHamburgerMenu() {
    var nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('.bx-hamburger')) return;  // ja instalado

    // Coleta links existentes do .links pra replicar no drawer
    var linksSrc = nav.querySelector('.links');
    var linkItems = linksSrc
      ? Array.prototype.slice.call(linksSrc.querySelectorAll('a'))
      : [];

    // CTAs (Entrar / Cadastre-se) — replicados do .cta-row se existir
    var ctaSrc = nav.querySelector('.cta-row');
    var ctaItems = ctaSrc
      ? Array.prototype.slice.call(ctaSrc.querySelectorAll('a.button'))
      : [];

    // Botao hamburger — aparece via CSS so < 880px
    var btn = document.createElement('button');
    btn.className = 'bx-hamburger';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Abrir menu de navegacao');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'bx-mobile-drawer');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

    // Posiciona no fim do nav (ao lado da cta-row em mobile)
    nav.appendChild(btn);

    // Backdrop + drawer
    var backdrop = document.createElement('div');
    backdrop.className = 'bx-drawer-backdrop';

    var drawer = document.createElement('aside');
    drawer.className = 'bx-drawer';
    drawer.id = 'bx-mobile-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Menu de navegacao');

    var head = document.createElement('div');
    head.className = 'bx-drawer-head';
    var title = document.createElement('strong');
    title.textContent = 'Menu';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'bx-drawer-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar menu');
    closeBtn.innerHTML = '&times;';
    head.appendChild(title);
    head.appendChild(closeBtn);
    drawer.appendChild(head);

    var navEl = document.createElement('nav');
    linkItems.forEach(function (a) {
      var link = document.createElement('a');
      link.href = a.href;
      link.textContent = a.textContent;
      if (a.classList.contains('active')) link.classList.add('active');
      navEl.appendChild(link);
    });
    drawer.appendChild(navEl);

    if (ctaItems.length) {
      var ctaGrp = document.createElement('div');
      ctaGrp.className = 'bx-drawer-cta';
      ctaItems.forEach(function (a) {
        var link = document.createElement('a');
        link.href = a.href;
        link.textContent = a.textContent;
        link.className = a.className;
        ctaGrp.appendChild(link);
      });
      drawer.appendChild(ctaGrp);
    }

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    function openDrawer() {
      drawer.setAttribute('data-open', '');
      backdrop.setAttribute('data-open', '');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('bx-no-scroll');
      // Foco no botao de fechar (acessibilidade)
      setTimeout(function () { closeBtn.focus(); }, 100);
    }

    function closeDrawer() {
      drawer.removeAttribute('data-open');
      backdrop.removeAttribute('data-open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('bx-no-scroll');
      btn.focus();
    }

    btn.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);

    // ESC fecha
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.hasAttribute('data-open')) closeDrawer();
    });

    // Focus trap basico — Tab cicla dentro do drawer
    drawer.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = drawer.querySelectorAll(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
  }

  // Sprint 3 (S3-7): carrega cookie banner LGPD em todas as paginas.
  // Idempotente — se ja tiver consent salvo, banner nao aparece.
  function installCookieBanner() {
    if (document.querySelector('script[data-bx-cookie]')) return;
    var s = document.createElement('script');
    s.src = 'assets/cookie-banner.js';
    s.defer = true;
    s.setAttribute('data-bx-cookie', '1');
    document.head.appendChild(s);
  }

  // Sprint 4 (S4-5): carrega TOTP UI so se a pagina tiver o slot.
  function installTotpUI() {
    if (!document.getElementById('bx-totp-status')) return;
    if (document.querySelector('script[data-bx-totp]')) return;
    var s = document.createElement('script');
    s.src = 'assets/totp-ui.js';
    s.defer = true;
    s.setAttribute('data-bx-totp', '1');
    document.head.appendChild(s);
  }


  // Sprint 4 wrap-up · bootstrap restaurado apos truncamento Dropbox
  function bootstrap() {
    try {
      if (typeof installGlobalLogoutHandler === 'function') installGlobalLogoutHandler();
      if (typeof applyA11yGlobals === 'function') applyA11yGlobals();
      if (typeof installHamburgerMenu === 'function') installHamburgerMenu();
      if (typeof installCookieBanner === 'function') installCookieBanner();
      if (typeof installTotpUI === 'function') installTotpUI();
      var initFn = (typeof INITS !== 'undefined') ? INITS[PAGE] : null;
      if (initFn) initFn();
      if (typeof STORE !== 'undefined' && STORE.token && STORE.token()
          && typeof applyUserToShell === 'function') {
        applyUserToShell();
      }
    } catch (e) {
      if (window.console) console.error('bootstrap fail:', e);
    }
  }

  window.addEventListener('pageshow', function () {
    if (typeof STORE !== 'undefined' && STORE.token && STORE.token()
        && typeof applyUserToShell === 'function') {
      applyUserToShell();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // Service Worker registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .catch(function (e) { if (window.console) console.warn('SW falhou:', e); });
    });
  }
})();
