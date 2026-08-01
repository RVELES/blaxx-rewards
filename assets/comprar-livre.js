/* Comprar pontos · valor livre · fluxo PIX automatizado via Mercado Pago.
 *
 * Substitui o antigo fluxo manual (admin confirmava) por chamada direta
 * a /pix/charge com amount_brl. Backend integra com MP e devolve QR Code
 * real (PNG base64) + BR Code copia-e-cola.
 *
 * Confirmação é automática via webhook MP → polling a cada 4s pra
 * detectar quando charge.status === 'paid'.
 *
 * Resiliência:
 *  - Pre-check de auth na entrada (sem token → login com ?next= preservado).
 *  - Polling com timeout de 30 minutos (TTL da charge).
 *  - 401 mid-flow → redireciona pra login mantendo destino.
 *  - Erros inline (sem alert).
 *  - Race do auto-pkg corrigida (checa readyState).
 *  - Botão "voltar" no step-2.
 */
(function () {
  'use strict';

  // Mesma ordem de resolução do resto do site (login.html, vender-pontos):
  // override manual blaxx_api_url → BLAXX_API (blaxx-config.js) → origin.
  var API = (function () {
    try { var o = localStorage.getItem('blaxx_api_url'); if (o) return o.replace(/\/+$/, ''); } catch (e) {}
    return window.BLAXX_API || location.origin;
  })();
  var POLL_INTERVAL_MS = 4000;
  var POLL_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutos
  var CENTS_PER_POINT = 9; // 1 pt = R$ 0,09 — sincronizar com backend Config.CENTS_PER_POINT

  // ---- Util de token + safeNext (independente do blaxx-app.js) ----
  // Lê token de localStorage (atual, sessão persistente) com fallback pra
  // sessionStorage (legacy). blaxx-app.js usa STORE que salva em localStorage,
  // então JAMAIS olhar só sessionStorage — quebra a compra inteira.
  function getToken() {
    try {
      var t = localStorage.getItem('blaxx_token');
      if (t) return t;
    } catch (e) { /* localStorage indisponível em iframe sandbox raro */ }
    try {
      var st = sessionStorage.getItem('blaxx_token');
      if (st) return st;
    } catch (e) {}
    // Fallback pro formato legado blaxx_session (mesmo padrão do resto do
    // site) — senão sessões antigas não conseguem comprar.
    try { return (JSON.parse(localStorage.getItem('blaxx_session') || 'null') || {}).token || null; }
    catch (e) { return null; }
  }
  function clearStoredCreds() {
    // Limpa os DOIS formatos — se sobrasse blaxx_session, o login veria a
    // sessão remanescente e devolveria pro app: loop de redirect no 401.
    try {
      localStorage.removeItem('blaxx_token');
      localStorage.removeItem('blaxx_user');
      localStorage.removeItem('blaxx_session');
    } catch (e) {}
    try {
      sessionStorage.removeItem('blaxx_token');
      sessionStorage.removeItem('blaxx_user');
    } catch (e) {}
  }

  function safeNext(raw, fallback) {
    fallback = fallback || '/dashboard';
    if (!raw || typeof raw !== 'string') return fallback;
    if (raw[0] !== '/' || raw[1] === '/' || raw.indexOf(':') !== -1) return fallback;
    return raw;
  }

  function redirectToLoginPreservingHere() {
    var here = location.pathname + location.search;
    location.href = '/login.html?next=' + encodeURIComponent(here);
  }

  // Pre-check antes de qualquer coisa
  if (!getToken()) { redirectToLoginPreservingHere(); return; }

  var currentCharge = null;
  var pollHandle = null;
  var pollStartedAt = 0;

  // ---- Cartão de crédito (MercadoPago Brick) ----
  // Config vem de GET /payments/card/config (público). Se enabled=false o
  // seletor de método nem aparece e o fluxo segue 100% PIX como antes.
  var cardCfg = { enabled: false, public_key: '', max_installments: 1, provider: 'mercadopago' };
  var currentMethod = 'pix';
  var brickController = null;
  var cardIdemKey = null;

  function newIdemKey() {
    cardIdemKey = 'web-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
    return cardIdemKey;
  }

  // ---- fetch wrapper com tratamento de 401 mid-flow ----
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken(),
    }, opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      return res.text().then(function (raw) {
        var data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) {
          var snippet = (raw || '').slice(0, 80).replace(/\s+/g, ' ').trim();
          var pe = new Error('Resposta inválida do servidor (' + res.status + (snippet ? ': ' + snippet : '') + ')');
          pe.status = res.status;
          throw pe;
        }
        if (res.status === 401) {
          // Token invalido/expirado: limpa AMBOS os storages e volta pro
          // login com next preservado.
          clearStoredCreds();
          redirectToLoginPreservingHere();
          var err401 = new Error('Sessão expirada — redirecionando.');
          err401.status = 401;
          throw err401;
        }
        if (!res.ok) {
          var err = new Error(data.error || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function fmtBRL(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  function parseInputAmount(str) {
    // "R$ 100,50" → 100.50
    var clean = String(str || '').replace(/[^\d,.-]/g, '').replace(',', '.');
    var n = parseFloat(clean);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function getQueryPkg() {
    var m = location.search.match(/[?&]pkg=([a-z0-9]+)/i);
    return m ? m[1].toLowerCase() : null;
  }

  // ---- UI helpers ----
  function showInlineError(msg, kind) {
    kind = kind || 'err';
    var step2 = document.getElementById('step-2');
    var stepCard = document.getElementById('step-2-card');
    // Host visível na ordem: passo do cartão → passo do QR PIX → wrap.
    // Sem incluir o step-2-card, a mensagem de recusa do cartão era anexada
    // ao fim da página, fora da vista do usuário no fluxo de cartão.
    var host = (stepCard && stepCard.style.display !== 'none') ? stepCard
             : (step2 && step2.style.display !== 'none') ? step2
             : document.querySelector('.buy-wrap');
    if (!host) return;
    var box = document.getElementById('bx-err-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'bx-err-box';
      box.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:10px;font-size:14px;font-weight:600;overflow-wrap:anywhere;word-break:break-word;';
      host.appendChild(box);
    }
    var colors = {
      err: ['#ffede8', '#a83417'],
      warn: ['#fff7df', '#8a6500'],
      info: ['#e8f3ff', '#1c4f87']
    };
    var c = colors[kind] || colors.err;
    box.style.background = c[0];
    box.style.color = c[1];
    box.textContent = msg;
  }

  function clearInlineError() {
    var box = document.getElementById('bx-err-box');
    if (box) box.remove();
  }

  function setStatusPill(text, kind) {
    var pills = document.querySelectorAll('.status-pill');
    pills.forEach(function (p) {
      p.classList.remove('status-pending', 'status-confirming', 'status-paid', 'status-rejected');
      p.classList.add('status-' + (kind || 'confirming'));
      p.textContent = text;
    });
  }

  // ---- Etapa 1 — valor digitado ----
  window.onAmountChange = function (val) {
    var amount = parseInputAmount(val);
    var cents = Math.round(amount * 100);
    var pts = Math.floor(cents / CENTS_PER_POINT);
    var ptsEl = document.getElementById('points-preview');
    if (ptsEl) ptsEl.textContent = pts.toLocaleString('pt-BR');
    var btn = document.getElementById('btn-create');
    if (btn) btn.disabled = amount < 10;
  };

  // ---- Seletor de método (PIX | Cartão) ----
  window.setMethod = function (m) {
    currentMethod = (m === 'card' && cardCfg.enabled) ? 'card' : 'pix';
    var bp = document.getElementById('method-pix');
    var bc = document.getElementById('method-card');
    // Roving tabindex: só o radio selecionado fica no fluxo de tab (0); o outro
    // sai (-1). Navegação entre eles é via seta (setupMethodKeys).
    if (bp) { bp.classList.toggle('sel', currentMethod === 'pix'); bp.setAttribute('aria-checked', String(currentMethod === 'pix')); bp.tabIndex = currentMethod === 'pix' ? 0 : -1; }
    if (bc) { bc.classList.toggle('sel', currentMethod === 'card'); bc.setAttribute('aria-checked', String(currentMethod === 'card')); bc.tabIndex = currentMethod === 'card' ? 0 : -1; }
    var btn = document.getElementById('btn-create');
    if (btn) btn.textContent = currentMethod === 'card'
      ? 'Pagar com cartão' : 'Gerar QR Code de pagamento';
    var title = document.getElementById('page-title');
    if (title) title.textContent = currentMethod === 'card'
      ? 'Comprar pontos no cartão' : 'Comprar pontos via PIX';
  };

  function getQueryMethod() {
    var m = location.search.match(/[?&]method=(card|pix)/i);
    return m ? m[1].toLowerCase() : null;
  }

  // A11y: navegação por seta no radiogroup de método (WAI-ARIA radio pattern).
  // Setas ←/→/↑/↓ alternam PIX↔Cartão; Home/End vão pros extremos. Attach único.
  var methodKeysWired = false;
  function setupMethodKeys() {
    if (methodKeysWired) return;
    var row = document.getElementById('method-row');
    if (!row) return;
    methodKeysWired = true;
    row.addEventListener('keydown', function (e) {
      var k = e.key;
      var next = null;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'End') next = 'card';
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Home') next = 'pix';
      else return;
      e.preventDefault();
      window.setMethod(next);
      var el = document.getElementById(next === 'card' ? 'method-card' : 'method-pix');
      if (el) el.focus();
    });
  }

  function loadCardConfig() {
    // Público — sem Authorization (não passa pelo api() de propósito:
    // 401 aqui não pode derrubar a sessão).
    return fetch(API + '/payments/card/config')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        var enabled = !!(cfg && cfg.enabled && cfg.public_key);
        if (enabled) {
          cardCfg = cfg;
          var row = document.getElementById('method-row');
          if (row) row.classList.add('on');
          setupMethodKeys();
          if (getQueryMethod() === 'card') window.setMethod('card');
        } else if (getQueryMethod() === 'card') {
          // Veio de comprar-pontos.html?method=card mas o cartão está
          // desligado (CARD_ENABLED=0) — avisa e segue com PIX em vez de
          // deixar um método morto selecionado.
          showInlineError('Pagamento com cartão indisponível no momento — use PIX.', 'info');
        }
      })
      .catch(function () { /* cartão indisponível → segue PIX-only */ });
  }

  window.createCharge = function () {
    clearInlineError();
    if (currentMethod === 'card') { startCardFlow(); return; }
    var pkg = getQueryPkg();
    var body;
    if (pkg) {
      body = { package: pkg };
    } else {
      var amount = parseInputAmount(document.getElementById('amount-input').value);
      if (amount < 10) {
        showInlineError('Valor mínimo: R$ 10,00', 'warn');
        return;
      }
      body = { amount_brl: amount };
    }

    var btn = document.getElementById('btn-create');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando QR…'; }

    api('/pix/charge', { method: 'POST', body: JSON.stringify(body) })
      .then(function (charge) {
        currentCharge = charge;
        showStep2(charge);
        startPolling(charge.id);
      })
      .catch(function (e) {
        if (e.status === 401) return; // já redirecionou
        // Backend exige email verificado pra comprar — abre modal e retry
        // automatico apos verificacao bem sucedida. Comparacao case-insensitive
        // (backend devolve "EMAIL_NOT_VERIFIED" uppercase).
        var data = e && e.data || {};
        var codeNorm = String(data.code || data.error_code || '').toLowerCase();
        var msg = String((e && e.message) || '').toLowerCase();
        var isEmailGate = (
          e.status === 403 &&
          (codeNorm === 'email_not_verified'
            || msg.indexOf('e-mail') >= 0 || msg.indexOf('email') >= 0
            || msg.indexOf('verifique') >= 0 || msg.indexOf('confirme') >= 0)
        );
        try { console.warn('[buy] /pix/charge erro status=' + e.status, data, 'msg=' + msg, 'isEmailGate=' + isEmailGate); } catch (_) {}
        if (isEmailGate && typeof window.requireEmailVerifiedThen === 'function') {
          if (btn) { btn.disabled = false; btn.textContent = 'Gerar QR Code de pagamento'; }
          window.requireEmailVerifiedThen(function () {
            window.createCharge();
          });
          return;
        }
        if (isEmailGate && typeof window.requireEmailVerifiedThen !== 'function') {
          // blaxx-app.js nao carregado ou helper sumiu: mostra erro com instrucao
          showInlineError('Confirme seu email antes de comprar. Volte ao painel → Perfil → Confirmar email.');
          if (btn) { btn.disabled = false; btn.textContent = 'Gerar QR Code de pagamento'; }
          return;
        }
        showInlineError(e.message || 'Falha ao gerar QR Code');
        if (btn) { btn.disabled = false; btn.textContent = 'Gerar QR Code de pagamento'; }
        // Se chegou aqui via ?pkg= e deu erro, mostra step-1 pra o usuario tentar valor livre
        var step1 = document.getElementById('step-1');
        if (step1) step1.style.display = 'block';
        var loading = document.getElementById('pkg-loading');
        if (loading) loading.remove();
      });
  };

  // =====================================================================
  // Cartão de crédito — MercadoPago CardPayment Brick
  //
  // PCI (SAQ-A): o Brick tokeniza o cartão NO NAVEGADOR com a public key;
  // o backend recebe apenas card_token single-use. Nunca enviar número de
  // cartão/CVV para a API BlaXx — o endpoint recusa (RAW_CARD_DATA).
  // =====================================================================

    // Restaura o passo de valor livre e volta pra PIX — evita a tela
    // ficar num beco sem saída (step-1 escondido, sem Brick).
    function recoverToStep1() {
      var s1 = document.getElementById('step-1');
      if (s1) s1.style.display = 'block';
      var loading = document.getElementById('pkg-loading');
      if (loading) loading.remove();
      currentMethod = 'pix';
      var bc = document.getElementById('method-card');
      var bp = document.getElementById('method-pix');
      if (bc) bc.classList.remove('sel');
      if (bp) bp.classList.add('sel');
    }

  function startCardFlow() {
    var pkg = getQueryPkg();
    if (pkg) {
      // Pacote: preço vem do catálogo do backend
      api('/pix/packages').then(function (packages) {
        var p = packages && packages[pkg];
        if (!p || !p.price_brl) {
          showInlineError('Pacote desconhecido — escolha um valor livre.', 'warn');
          recoverToStep1();
          return;
        }
        mountCardBrick(Number(p.price_brl), { package: pkg });
      }).catch(function (e) {
        if (e.status !== 401) {
          showInlineError(e.message || 'Falha ao carregar o pacote — tente PIX.');
          recoverToStep1();
        }
      });
      return;
    }
    var amount = parseInputAmount(document.getElementById('amount-input').value);
    if (amount < 10) {
      showInlineError('Valor mínimo: R$ 10,00', 'warn');
      return;
    }
    mountCardBrick(amount, { amount_brl: amount });
  }

  // Roteador de checkout de cartão. Arquitetura 2026-08-01: cartão é STRIPE
  // (Elements tokeniza no browser → o PAN nunca chega ao nosso backend).
  // MercadoPago fica como legado enquanto não for removido.
  function mountCardBrick(amountBRL, chargeBody) {
    if ((cardCfg.provider || 'mercadopago') === 'stripe') {
      return mountStripeCard(amountBRL, chargeBody);
    }
    if (typeof MercadoPago !== 'function') {
      showInlineError('SDK de pagamento não carregou — recarregue a página.', 'err');
      return;
    }
    var step1 = document.getElementById('step-1');
    var stepCard = document.getElementById('step-2-card');
    if (step1) step1.style.display = 'none';
    if (stepCard) stepCard.style.display = 'block';
    newIdemKey(); // protege retry por timeout SEM travar retry pós-recusa

    // Botão voltar do passo do cartão
    var back = document.getElementById('bx-card-back');
    if (!back && stepCard) {
      back = document.createElement('button');
      back.id = 'bx-card-back';
      back.type = 'button';
      back.className = 'button ghost';
      back.style.cssText = 'margin-top:14px;width:100%;';
      back.textContent = '← Voltar';
      back.addEventListener('click', function () {
        if (brickController) { try { brickController.unmount(); } catch (e) {} brickController = null; }
        stepCard.style.display = 'none';
        if (step1) step1.style.display = 'block';
        clearInlineError();
      });
      stepCard.appendChild(back);
    }

    if (brickController) { try { brickController.unmount(); } catch (e) {} brickController = null; }

    // Watchdog: o SDK do MP às vezes só loga "initialization failed" no
    // console SEM rejeitar a promise nem chamar onError (ex.: public key
    // inválida). Se o form não montar em 6s, mostramos o erro amigável.
    var brickWatchdog = setTimeout(function () {
      var box = document.getElementById('cardPaymentBrick_container');
      if (box && box.childElementCount === 0) {
        showInlineError('Não foi possível carregar o formulário do cartão. ' +
          'Recarregue a página ou pague via PIX.', 'err');
      }
    }, 6000);

    var mp = new MercadoPago(cardCfg.public_key, { locale: 'pt-BR' });
    mp.bricks().create('cardPayment', 'cardPaymentBrick_container', {
      initialization: { amount: amountBRL },
      customization: {
        paymentMethods: { maxInstallments: cardCfg.max_installments || 1 },
      },
      callbacks: {
        onReady: function () { clearTimeout(brickWatchdog); clearInlineError(); },
        onError: function (err) {
          clearTimeout(brickWatchdog);
          try { console.warn('[card] brick error', err); } catch (e) {}
          showInlineError('Não foi possível carregar o formulário do cartão. ' +
            'Recarregue a página ou pague via PIX.', 'err');
        },
        onSubmit: function (formData) {
          return submitCardPayment(formData, chargeBody);
        },
      },
    }).then(function (controller) {
      brickController = controller;
    }).catch(function (err) {
      clearTimeout(brickWatchdog);
      try { console.warn('[card] brick create fail', err); } catch (e) {}
      showInlineError('Falha ao iniciar o pagamento com cartão. Tente PIX.', 'err');
    });
  }

  // ---------------- Stripe Elements ---------------- #
  var stripeObj = null, stripeElements = null, stripeCardEl = null;

  function loadStripeJs() {
    if (window.Stripe) return Promise.resolve();
    if (window.__bxStripeLoading) return window.__bxStripeLoading;
    window.__bxStripeLoading = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'https://js.stripe.com/v3/';
      sc.async = true;
      sc.onload = resolve;
      sc.onerror = function () { reject(new Error('stripe_js_load_failed')); };
      document.head.appendChild(sc);
    });
    return window.__bxStripeLoading;
  }

  function mountStripeCard(amountBRL, chargeBody) {
    var step1 = document.getElementById('step-1');
    var stepCard = document.getElementById('step-2-card');
    if (step1) step1.style.display = 'none';
    if (stepCard) stepCard.style.display = 'block';
    newIdemKey();

    var box = document.getElementById('cardPaymentBrick_container');
    if (!box) return;
    box.innerHTML = '';

    // Botão voltar (mesmo comportamento do fluxo antigo)
    var back = document.getElementById('bx-card-back');
    if (!back && stepCard) {
      back = document.createElement('button');
      back.id = 'bx-card-back';
      back.type = 'button';
      back.className = 'button ghost';
      back.style.cssText = 'margin-top:14px;width:100%;';
      back.textContent = '\u2190 Voltar';
      back.addEventListener('click', function () {
        try { if (stripeCardEl) stripeCardEl.unmount(); } catch (e) {}
        stripeCardEl = null;
        stepCard.style.display = 'none';
        if (step1) step1.style.display = 'block';
        clearInlineError();
      });
      stepCard.appendChild(back);
    }

    loadStripeJs().then(function () {
      if (!cardCfg.public_key) throw new Error('sem chave publicavel');
      stripeObj = window.Stripe(cardCfg.public_key, { locale: 'pt-BR' });
      stripeElements = stripeObj.elements();

      var holder = document.createElement('div');
      holder.id = 'bx-stripe-card';
      // Neo-Brutal: borda preta grossa, sem raio, fundo claro.
      holder.style.cssText = 'border:3px solid #0A0B0E;background:#F4F4F0;' +
        'padding:14px;margin-bottom:14px;';
      box.appendChild(holder);

      stripeCardEl = stripeElements.create('card', {
        hidePostalCode: true,
        style: {
          base: {
            color: '#0A0B0E', fontFamily: '"Space Grotesk", Arial, sans-serif',
            fontSize: '16px', '::placeholder': { color: '#8A929E' },
          },
          invalid: { color: '#D64545' },
        },
      });
      stripeCardEl.mount('#bx-stripe-card');

      // Nomeia o processador correto na tela (o texto do HTML é neutro).
      var note = document.getElementById('bx-card-psp-note');
      if (note) {
        note.textContent = 'Pagamento processado pela Stripe. Os dados do ' +
          'cartão são criptografados no seu navegador e não passam pelos ' +
          'servidores BlaXx.';
      }

      var msg = document.createElement('div');
      msg.id = 'bx-stripe-msg';
      msg.style.cssText = 'font-size:13px;color:#D64545;min-height:18px;margin-bottom:10px;';
      box.appendChild(msg);
      stripeCardEl.on('change', function (ev) {
        msg.textContent = (ev.error && ev.error.message) ? ev.error.message : '';
      });

      var pay = document.createElement('button');
      pay.type = 'button';
      pay.className = 'button';
      pay.style.cssText = 'width:100%;';
      pay.textContent = 'PAGAR R$ ' + Number(amountBRL).toFixed(2).replace('.', ',');
      box.appendChild(pay);

      pay.addEventListener('click', function () {
        pay.disabled = true;
        var original = pay.textContent;
        pay.textContent = 'PROCESSANDO…';
        clearInlineError();

        // Tokenização NO BROWSER: devolve pm_… e o número do cartão nunca
        // passa pelo nosso servidor (escopo PCI SAQ-A).
        stripeObj.createPaymentMethod({
          type: 'card',
          card: stripeCardEl,
          billing_details: { name: (chargeBody && chargeBody.payer_name) || undefined },
        }).then(function (res) {
          if (res.error) {
            msg.textContent = res.error.message || 'Cartão inválido.';
            var e = new Error('stripe_pm_error'); e.bxHandled = true; throw e;
          }
          return submitCardPayment({
            token: res.paymentMethod.id,   // pm_… no lugar do token do MP
            payment_method_id: (res.paymentMethod.card || {}).brand || 'card',
            installments: 1,               // Stripe BR não parcela
            issuer_id: '',
          }, chargeBody);
        }).catch(function (e) {
          if (!e || !e.bxHandled) {
            showInlineError((e && e.message) || 'Falha no pagamento.', 'err');
          }
        }).then(function () {
          pay.disabled = false;
          pay.textContent = original;
        });
      });

      clearInlineError();
    }).catch(function (err) {
      try { console.warn('[card] stripe mount fail', err); } catch (e) {}
      showInlineError('Não foi possível carregar o formulário do cartão. ' +
        'Recarregue a página ou pague via PIX.', 'err');
    });
  }

  function submitCardPayment(formData, chargeBody) {
    var body = Object.assign({}, chargeBody, {
      card_token: formData.token,
      payment_method_id: formData.payment_method_id,
      installments: formData.installments || 1,
      issuer_id: formData.issuer_id ? String(formData.issuer_id) : '',
    });
    return api('/payments/card/charge', {
      method: 'POST',
      headers: { 'Idempotency-Key': cardIdemKey },
      body: JSON.stringify(body),
    }).then(function (charge) {
      // Resposta FINAL do servidor recebida (aprovado/análise) → a próxima
      // tentativa é uma compra nova, então rotaciona a key.
      newIdemKey();
      if (charge.status === 'approved') {
        showStep3Success(charge, 'card');
        return;
      }
      if (charge.status === 'in_process') {
        showCardProcessing(charge);
        return;
      }
      // Status terminal negativo devolvido como HTTP 2xx (ex.: rejected/cancelled).
      // Precisa REJEITAR a promise do onSubmit — se resolvesse, o Brick do MP
      // mostraria a própria tela de sucesso contradizendo o aviso.
      if (charge.status === 'rejected' || charge.status === 'cancelled') {
        showInlineError('O pagamento não foi aprovado pelo emissor. ' +
          'Tente outro cartão ou PIX.', 'err');
        var errNeg = new Error('card_' + charge.status);
        errNeg.bxHandled = true; // aviso já exibido — catch não deve sobrescrever
        throw errNeg;
      }
      showInlineError('Pagamento em estado ' + String(charge.status || '') + ' — acompanhe na carteira.', 'warn');
      var errUnk = new Error('card_status_' + String(charge.status || 'unknown'));
      errUnk.bxHandled = true;
      throw errUnk;
    }).catch(function (e) {
      if (e.status === 401) throw e; // já redirecionou pro login
      // CRÍTICO: só rotaciona a Idempotency-Key quando o servidor deu uma
      // resposta DEFINITIVA (HTTP com status → o cartão foi decidido). Em
      // falha de REDE/timeout (sem e.status) mantém a MESMA key: o retry
      // dedupe no backend e no MP, evitando dupla cobrança do cartão.
      if (e.status) newIdemKey();
      // bxHandled = status terminal negativo já tratado no .then acima (mensagem
      // amigável com o kind certo). Não reexibir com e.message técnico.
      if (!e.bxHandled) {
        showInlineError(e.message || 'Pagamento recusado. Tente outro cartão ou PIX.', 'err');
      }
      throw e; // rejeita a promise → Brick reabilita o botão de pagar
    });
  }

  function showCardProcessing(charge) {
    var stepCard = document.getElementById('step-2-card');
    if (stepCard) {
      stepCard.innerHTML =
        '<h3 style="margin-bottom:12px;"><span class="step-num">2</span> Pagamento em análise</h3>' +
        '<div style="text-align:center;padding:18px;">' +
          '<span class="status-pill status-confirming">⏱ Aguardando aprovação do emissor…</span>' +
          '<div style="font-size:13px;color:#5f665e;margin-top:10px;">' +
            'Isso pode levar alguns instantes. Assim que aprovar, os pontos ' +
            'entram automaticamente na sua carteira.' +
          '</div>' +
        '</div>';
    }
    pollCardCharge(charge.id);
  }

  function pollCardCharge(chargeId) {
    if (pollHandle) clearInterval(pollHandle);
    pollStartedAt = Date.now();
    pollHandle = setInterval(function () {
      if (Date.now() - pollStartedAt > POLL_MAX_DURATION_MS) {
        clearInterval(pollHandle); pollHandle = null;
        showInlineError('A análise está demorando — acompanhe o status na sua carteira.', 'warn');
        return;
      }
      api('/payments/card/charge/' + chargeId).then(function (c) {
        if (c.status === 'approved') {
          clearInterval(pollHandle); pollHandle = null;
          showStep3Success(c, 'card');
        } else if (c.status === 'rejected' || c.status === 'cancelled') {
          clearInterval(pollHandle); pollHandle = null;
          showInlineError('O pagamento não foi aprovado pelo emissor. ' +
            'Tente outro cartão ou PIX.', 'err');
        }
      }).catch(function () { /* tenta de novo no próximo tick */ });
    }, POLL_INTERVAL_MS);
  }

  function showStep2(charge) {
    var step1 = document.getElementById('step-1');
    var step2 = document.getElementById('step-2');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';

    var amtEl = document.getElementById('pix-amount-display');
    if (amtEl) amtEl.textContent = fmtBRL(charge.amount_brl);

    var img = document.getElementById('qr-img');
    if (img) {
      if (charge.qr_code_image) {
        img.src = charge.qr_code_image;
        img.style.display = 'block';
      } else {
        img.style.display = 'none';
      }
    }

    // Caixa BR Code copia-e-cola
    var qrBox = document.querySelector('#step-2 .qr-box');
    var brBox = document.getElementById('br-code-box');
    if (!brBox && qrBox) {
      brBox = document.createElement('div');
      brBox.id = 'br-code-box';
      brBox.style.cssText = 'margin-top:16px;text-align:left;';
      brBox.innerHTML =
        '<div style="font-size:12px;color:#5f665e;margin-bottom:6px;">Ou copie o código PIX:</div>' +
        '<div style="display:flex;gap:8px;align-items:stretch;">' +
          '<textarea id="br-code-text" readonly style="flex:1;height:64px;font-family:ui-monospace,monospace;font-size:11px;background:#f5f7f0;border:1px solid #e6eadf;border-radius:8px;padding:8px;resize:none;"></textarea>' +
          '<button id="br-code-copy" class="button secondary" type="button" style="white-space:nowrap;">Copiar</button>' +
        '</div>';
      qrBox.appendChild(brBox);
      document.getElementById('br-code-copy').addEventListener('click', function () {
        var ta = document.getElementById('br-code-text');
        ta.select();
        try {
          document.execCommand('copy');
          this.textContent = '✓ Copiado';
          var self = this;
          setTimeout(function () { self.textContent = 'Copiar'; }, 2000);
        } catch (e) { /* silent */ }
      });
    }
    var brText = document.getElementById('br-code-text');
    if (brText) brText.value = charge.br_code || '';

    // Resumo lateral
    var summary = document.getElementById('charge-summary');
    if (!summary && qrBox) {
      summary = document.createElement('div');
      summary.id = 'charge-summary';
      summary.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid #e6eadf;font-size:13px;text-align:left;';
      summary.innerHTML =
        '<div style="display:flex;justify-content:space-between;padding:6px 0;">' +
          '<span style="color:#5f665e;">Valor</span>' +
          '<span style="font-weight:600;" id="sum-amt">—</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;">' +
          '<span style="color:#5f665e;">Pontos</span>' +
          '<span style="font-weight:600;" id="sum-pts">—</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;">' +
          '<span style="color:#5f665e;">Expira em</span>' +
          '<span style="font-weight:600;">30 minutos</span>' +
        '</div>';
      qrBox.appendChild(summary);
    }
    var sumAmt = document.getElementById('sum-amt');
    if (sumAmt) sumAmt.textContent = fmtBRL(charge.amount_brl);
    var sumPts = document.getElementById('sum-pts');
    if (sumPts) sumPts.textContent = (charge.points_to_credit || 0).toLocaleString('pt-BR') + ' pts';

    // Botao "Cancelar / Voltar" no step-2
    var cancelBtn = document.getElementById('bx-cancel');
    if (!cancelBtn && step2) {
      cancelBtn = document.createElement('button');
      cancelBtn.id = 'bx-cancel';
      cancelBtn.type = 'button';
      cancelBtn.className = 'button ghost';
      cancelBtn.style.cssText = 'margin-top:14px;width:100%;';
      cancelBtn.textContent = '← Cancelar e voltar';
      cancelBtn.addEventListener('click', function () {
        if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
        // Se vier de pacote, volta pra listagem; senao volta pro step-1
        if (getQueryPkg()) {
          location.href = '/comprar-pontos.html';
        } else {
          step2.style.display = 'none';
          if (step1) step1.style.display = 'block';
          var amtInput = document.getElementById('amount-input');
          if (amtInput) { amtInput.value = ''; window.onAmountChange(''); }
          clearInlineError();
        }
      });
      step2.appendChild(cancelBtn);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Polling — checa status da charge a cada 4s; para após 30 min (TTL).
  function startPolling(chargeId) {
    if (pollHandle) clearInterval(pollHandle);
    pollStartedAt = Date.now();
    pollHandle = setInterval(function () {
      // Timeout duro: 30 min sem confirmação
      if (Date.now() - pollStartedAt > POLL_MAX_DURATION_MS) {
        clearInterval(pollHandle); pollHandle = null;
        setStatusPill('⏱ QR expirado', 'rejected');
        showInlineError('O QR Code expirou. Volte e gere uma nova cobrança.', 'warn');
        return;
      }
      api('/pix/charge/' + chargeId).then(function (c) {
        if (c.status === 'paid') {
          clearInterval(pollHandle); pollHandle = null;
          showStep3Success(c);
        } else if (c.status === 'expired' || c.status === 'rejected' || c.status === 'cancelled') {
          clearInterval(pollHandle); pollHandle = null;
          setStatusPill(c.status === 'expired' ? '⏱ Expirado' : '✗ Rejeitado', 'rejected');
          showInlineError(
            c.status === 'expired'
              ? 'Esta cobrança expirou. Gere uma nova.'
              : 'O pagamento foi rejeitado. Tente novamente.',
            'err'
          );
        }
      }).catch(function (e) {
        // 401 já foi tratado em api(). Outros erros: log silencioso pra retry no proximo tick.
        if (e.status && e.status !== 401) {
          // mostra dica discreta sem alarmar
          var pill = document.querySelector('.status-pill');
          if (pill && pill.classList.contains('status-confirming')) {
            pill.textContent = '⏱ Tentando atualizar status…';
          }
        }
      });
    }, POLL_INTERVAL_MS);
  }

  function showStep3Success(charge, method) {
    var step2 = document.getElementById('step-2');
    var step2card = document.getElementById('step-2-card');
    var step3 = document.getElementById('step-3');
    if (step2) step2.style.display = 'none';
    if (step2card) step2card.style.display = 'none';
    if (brickController) { try { brickController.unmount(); } catch (e) {} brickController = null; }
    if (!step3) return;
    step3.style.display = 'block';
    step3.innerHTML =
      '<h3 style="margin-bottom:12px;"><span class="step-num">3</span> Pagamento confirmado!</h3>' +
      '<p style="font-size:18px;">+' + (charge.points_to_credit || 0).toLocaleString('pt-BR') +
        ' pts adicionados à sua carteira.</p>' +
      '<div style="text-align:center;margin-top:16px;">' +
        '<span class="status-pill status-paid">✓ Pontos liberados</span>' +
      '</div>' +
      '<button class="button full lg" type="button" onclick="goWallet()" style="margin-top:18px;">' +
        'Ir para minha carteira' +
      '</button>';

    // Atualiza /me em background para refletir novo saldo em STORE
    api('/wallet/').then(function (w) {
      try { sessionStorage.setItem('blaxx_wallet', JSON.stringify(w)); } catch (e) { /* ignore */ }
    }).catch(function () { /* nao critico */ });
  }

  window.goWallet = function () { location.href = '/carteira.html'; };

  // ---- Bootstrap: roda quando DOM estiver pronto, sem race ----
  function boot() {
    // Config do cartão primeiro: decide se o seletor aparece e se
    // ?method=card é honrado (senão cai no PIX, comportamento antigo).
    loadCardConfig().then(bootAfterConfig);
  }

  function bootAfterConfig() {
    var pkg = getQueryPkg();
    if (!pkg) {
      // Fluxo valor livre — aguarda usuario digitar
      return;
    }
    if (currentMethod === 'card') {
      // Pacote no cartão: Brick monta com o preço do catálogo
      var s1 = document.getElementById('step-1');
      if (s1) s1.style.display = 'none';
      startCardFlow();
      return;
    }
    // Compra de pacote: esconde step-1 e auto-gera
    var step1 = document.getElementById('step-1');
    if (step1) step1.style.display = 'none';

    // Loading enquanto backend gera o QR
    var loading = document.getElementById('pkg-loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.id = 'pkg-loading';
      loading.style.cssText = 'text-align:center;padding:48px;color:#5f665e;';
      loading.textContent = 'Gerando seu QR Code…';
      var wrap = document.querySelector('.buy-wrap');
      if (wrap) wrap.insertBefore(loading, wrap.firstChild);
    }
    window.createCharge();

    // Remove loading quando step-2 aparecer
    var tryRemove = setInterval(function () {
      var s2 = document.getElementById('step-2');
      if (s2 && s2.style.display === 'block') {
        var el = document.getElementById('pkg-loading');
        if (el) el.remove();
        clearInterval(tryRemove);
      }
    }, 200);
    // Garantia: para tentar remover após 60s mesmo que falhe
    setTimeout(function () { clearInterval(tryRemove); }, 60000);
  }

  // Race fix: se DOMContentLoaded já passou, roda agora; senão espera.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
