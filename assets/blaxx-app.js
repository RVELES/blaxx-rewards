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
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('HTTP ' + res.status));
          err.data = data; err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function requireAuth() {
    if (!STORE.token()) {
      location.href = 'login.html';
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
    var saldoStr = fmt(w.balance_pts);
    var brlStr = w.balance_brl_equiv.toFixed(2).replace('.', ',');
    document.body.innerHTML = document.body.innerHTML; // no-op
    // Substitui textos exatos "84.750" e "R$ 847,50" presentes no protótipo
    function walk(node) {
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        if (t.indexOf('84.750') >= 0) node.nodeValue = t.replace(/84\.750/g, saldoStr);
        if (t.indexOf('R$ 847,50') >= 0) node.nodeValue = node.nodeValue.replace(/R\$ 847,50/g, 'R$ ' + brlStr);
      } else if (node.nodeType === 1 && ['SCRIPT','STYLE','INPUT','TEXTAREA'].indexOf(node.nodeName) === -1) {
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    }
    walk(document.body);
  }

  // =========================================================================
  // PER-PAGE INIT
  // =========================================================================

  function initLogin() {
    var form = document.querySelector('form[action="dashboard.html"]');
    if (!form) return;

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
          location.href = 'dashboard.html';
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
      'background:#080907;color:#cfff1a;border:0;border-radius:50%;font-size:24px;' +
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
            location.href = 'pagamento-pix.html';
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
      setTimeout(function () { location.href = 'comprar-pontos.html'; }, 1500);
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
          location.href = 'compra-aprovada.html';
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
      location.href = 'confirmar-envio.html';
    });
  }

  function initConfirmarEnvio() {
    if (!requireAuth()) return;
    applyUserToShell();
    var p = STORE.getFlow('transfer_pending');
    if (!p) {
      notify('Nenhum envio pendente - voltando', 'warn');
      setTimeout(function () { location.href = 'enviar-pontos.html'; }, 1200);
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

    $('#bx-cancel').addEventListener('click', function () { location.href = 'enviar-pontos.html'; });
    $('#bx-confirm').addEventListener('click', function () {
      var btn = $('#bx-confirm'); btn.disabled = true; btn.textContent = 'Enviando...';
      api('/transfer/', { method: 'POST', body: JSON.stringify(p) })
        .then(function (t) {
          STORE.setFlow('transfer_done', t);
          sessionStorage.removeItem('blaxx_flow_transfer_pending');
          location.href = 'envio-concluido.html';
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
  // Router
  // =========================================================================
  var PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var INITS = {
    'login.html': initLogin,
    'dashboard.html': initDashboard,
    'carteira.html': initDashboard,
    'extrato.html': initDashboard,
    'comprar-pontos.html': initComprarPontos,
    'pagamento-pix.html': initPagamentoPix,
    'compra-aprovada.html': initCompraAprovada,
    'enviar-pontos.html': initEnviarPontos,
    'confirmar-envio.html': initConfirmarEnvio,
    'envio-concluido.html': initEnvioConcluido,
    'resgate-pix.html': initResgatePix
  };

  function bootstrap() {
    var initFn = INITS[PAGE];
    if (initFn) initFn();
    // Em qualquer página logada, atualiza textos hardcoded da Mariana
    if (STORE.token() && !INITS[PAGE]) applyUserToShell();
  }

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
      'position:fixed;bottom:20px;right:20px;z-index:9000;background:#cfff1a;color:#080907;' +
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
      'position:fixed;bottom:0;left:0;right:0;z-index:9000;background:#080907;color:#cfff1a;' +
      'padding:14px 18px;font-family:Inter,sans-serif;font-size:13px;display:flex;align-items:center;gap:8px;';
    bar.innerHTML =
      '<span style="flex:1;line-height:1.4;">Para instalar como app: toque em <strong>Compartilhar</strong> ' +
      'e depois em <strong>Adicionar à Tela de Início</strong>.</span>' +
      '<button style="background:transparent;border:1px solid #cfff1a;color:#cfff1a;padding:6px 12px;border-radius:8px;font-weight:700;">OK</button>';
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
      '<div style="font-size:14px;margin-bottom:10px;color:#cfff1a;">Escanear QR Code</div>' +
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
