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
  var STORE = {
    token: function () { return sessionStorage.getItem('blaxx_token'); },
    setToken: function (t) { sessionStorage.setItem('blaxx_token', t); },
    user: function () {
      try { return JSON.parse(sessionStorage.getItem('blaxx_user') || 'null'); }
      catch (e) { return null; }
    },
    setUser: function (u) { sessionStorage.setItem('blaxx_user', JSON.stringify(u)); },
    clear: function () {
      Object.keys(sessionStorage).forEach(function (k) {
        if (k.indexOf('blaxx_') === 0) sessionStorage.removeItem(k);
      });
    },
    setFlow: function (k, v) { sessionStorage.setItem('blaxx_flow_' + k, JSON.stringify(v)); },
    getFlow: function (k) {
      try { return JSON.parse(sessionStorage.getItem('blaxx_flow_' + k) || 'null'); }
      catch (e) { return null; }
    }
  };

  // ---- Fetch wrapper ----
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var tok = STORE.token();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (res) {
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
          throw apiErr;
        }
        return data;
      });
    });
  }

  function requireAuth() {
    if (!STORE.token()) {
      location.href = '/login';
      return false;
    }
    return true;
  }

  // ---- Substitui textos hardcoded da Mariana pelos do user logado ----
  function applyUserToShell() {
    var u = STORE.user();
    if (!u) return;
    api('/wallet/').then(function (w) {
      // Avatar (1a letra do nome)
      $$('.avatar').forEach(function (a) { a.textContent = u.name[0].toUpperCase(); });
      // Nome na sidebar
      $$('.side-user-name').forEach(function (n) { n.textContent = u.name; });
      // Plano + saldo na sidebar
      $$('.side-user-tier').forEach(function (n) {
        n.textContent = 'Plano Plus · ' + fmt(w.balance_pts) + ' pts';
      });
      // Botão "Olá, Mariana"
      $$('a.button.secondary').forEach(function (b) {
        if (b.textContent.trim().indexOf('Olá') === 0) {
          b.textContent = 'Olá, ' + u.name.split(' ')[0];
        }
      });
      // Saldo grande (dashboard / carteira) e R$ equivalente
      replaceHardcoded(w);
    }).catch(function () { /* sem token, segue */ });
  }

  function replaceHardcoded(w) {
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
        // Nome (cobre "Olá, Mariana", "Mariana 👋", "Mariana Costa", "Mariana,")
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
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
          use_fedcm_for_prompt: true,
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

    api('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: response.credential }),
    })
      .then(function (r) {
        STORE.setToken(r.token);
        STORE.setUser(r.user);
        notify('Bem-vindo, ' + (r.user.name || '').split(' ')[0] + '!', 'ok');
        setTimeout(function () { location.href = '/dashboard'; }, 350);
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
          STORE.setToken(r.token); STORE.setUser(r.user);
          location.href = '/dashboard';
        })
        .catch(function (e) {
          notify(e.message || 'falha no login', 'err');
          btn.disabled = false; btn.textContent = orig;
        });
    });
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
    // Procura locais óbvios na tela para injetar o BR Code
    injectPixCharge(charge);
  }

  function injectPixCharge(charge) {
    // Tenta achar um container existente; se não, cria um overlay
    var host = $('.pix-area') || $('main') || document.body;
    var box = document.createElement('div');
    box.className = 'card lime';
    box.style.cssText = 'padding:24px;margin:24px auto;max-width:720px;';
    box.innerHTML =
      '<h2 style="margin:0 0 6px;">PIX gerado pelo backend</h2>' +
      '<p style="color:var(--muted);margin:0 0 16px;font-size:14px;">' +
        'Pacote <strong>' + charge.package + '</strong> · ' + brl(charge.amount_brl) +
        ' → <strong>' + fmt(charge.points_to_credit) + ' pts</strong>' +
      '</p>' +
      '<div style="display:grid;grid-template-columns:160px 1fr;gap:18px;align-items:start;">' +
        '<div id="bx-qr" style="width:160px;height:160px;background:#fff;border-radius:14px;padding:8px;border:1px solid var(--line);"></div>' +
        '<div>' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">BR Code copia-e-cola</div>' +
          '<textarea readonly style="width:100%;height:90px;font-family:ui-monospace,monospace;font-size:10px;background:white;border:1px solid var(--line);border-radius:10px;padding:10px;">' +
          charge.br_code + '</textarea>' +
          '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">' +
            '<span id="bx-status" class="status pendente">' + charge.status + '</span>' +
            '<button id="bx-pay" class="button">Simular pagamento (webhook)</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    host.insertBefore(box, host.firstChild);

    $('#bx-qr').innerHTML = drawQR(charge.br_code);

    $('#bx-pay').addEventListener('click', function () {
      var btn = $('#bx-pay'); btn.disabled = true; btn.textContent = 'Confirmando...';
      api('/pix/simulate-payment', { method: 'POST', body: JSON.stringify({ charge_id: charge.id }) })
        .then(function (res) {
          STORE.setFlow('charge_paid', res.charge);
          location.href = '/compra-aprovada';
        })
        .catch(function (e) { notify(e.message, 'err'); btn.disabled = false; btn.textContent = 'Simular pagamento (webhook)'; });
    });

    // Botao extra "Abrir no app do banco" - copia o BR Code e instrui o user
    var openBankBtn = document.createElement('button');
    openBankBtn.className = 'button secondary';
    openBankBtn.style.cssText = 'font-size:13px;padding:8px 14px;margin-left:6px;';
    openBankBtn.textContent = '📱 Abrir no app do banco';
    openBankBtn.addEventListener('click', function () { window.blaxxOpenBankApp(charge.br_code); });
    $('#bx-pay').parentNode.appendChild(openBankBtn);
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

    function quote() {
      var p = parseInt(ptsInput.value || '0');
      $('#bx-r-quote').textContent = p > 0 ? '≈ ' + brl(p / 100) + ' (100 pts = R$ 1,00)' : '';
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
    var form = $('form') || $('#bx-form-cadastro');
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
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = (form.querySelector('#nome, input[name="nome"]') || {}).value || '';
      var email = (form.querySelector('#email, input[type="email"]') || {}).value || '';
      var cpf = (cpfEl || {}).value || '';
      var senha = (form.querySelector('#senha, input[type="password"]') || {}).value || '';
      if (!nome.trim() || !email.trim() || !cpf.trim() || !senha) {
        notify('Preencha todos os campos', 'error');
        return;
      }
      var body = {
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        cpf: cpf.replace(/\D/g, ''),
        password: senha
      };
      api('/auth/register', { method: 'POST', body: JSON.stringify(body) })
        .then(function (data) {
          STORE.setToken(data.token); STORE.setUser(data.user);
          notify('Conta criada! Bem-vindo, ' + data.user.name.split(' ')[0], 'success');
          setTimeout(function () { location.href = '/dashboard'; }, 700);
        })
        .catch(function (err) { notify(err.message || 'Falha no cadastro', 'error'); });
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
    api('/campaigns/').then(function (d) {
      var items = d.items || [];
      var container = $('#bx-campanhas-list');
      if (!container) return;
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
    }).catch(function (e) { notify(e.message, 'error'); });
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
  // Router
  // =========================================================================
  // Suporta tanto URLs "tradicionais" (login.html) quanto "pretty URLs" do
  // Netlify (/login). Ambas mapeiam para a mesma chave em INITS.
  var rawPage = (location.pathname.split('/').pop() || 'index').toLowerCase();
  var PAGE = rawPage.indexOf('.') >= 0 ? rawPage : rawPage + '.html';
  if (PAGE === '.html' || PAGE === '') PAGE = 'index.html';
  var INITS = {
    'login.html': initLogin,
    'cadastro.html': initCadastro,
    'dashboard.html': initDashboard,
    'carteira.html': initDashboard,
    'extrato.html': initDashboard,
    'comprar-pontos.html': initComprarPontos,
    'pagamento-pix.html': initPagamentoPix,
    'compra-aprovada.html': initCompraAprovada,
    'enviar-pontos.html': initEnviarPontos,
    'confirmar-envio.html': initConfirmarEnvio,
    'envio-concluido.html': initEnvioConcluido,
    'resgate-pix.html': initResgatePix,
    'parceiros.html': initParceiros,
    'resgates.html': initResgates,
    'beneficio-detalhe.html': initBeneficioDetalhe,
    'detalhe-beneficio.html': initBeneficioDetalhe,
    'campanhas.html': initCampanhas,
    'central-notificacoes.html': initNotificacoes
  };

  function bootstrap() {
    var initFn = INITS[PAGE];
    if (initFn) initFn();
    // Em qualquer página logada, atualiza textos hardcoded da Mariana
    // (roda também em páginas com init — initDashboard já chama, mas garantimos
    // para outras páginas que esqueceram). É idempotente.
    if (STORE.token() && !initFn) applyUserToShell();
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
      navigator.serviceWorker.register('/site/service-worker.js', { scope: '/site/' })
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
