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

  var API = window.BLAXX_API || location.origin;
  var POLL_INTERVAL_MS = 4000;
  var POLL_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutos
  var CENTS_PER_POINT = 9; // 1 pt = R$ 0,09 — sincronizar com backend Config.CENTS_PER_POINT

  // ---- Util de token + safeNext (independente do blaxx-app.js) ----
  function getToken() { return sessionStorage.getItem('blaxx_token'); }

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
          // Token invalido/expirado: limpa storage e volta pro login com next
          sessionStorage.removeItem('blaxx_token');
          sessionStorage.removeItem('blaxx_user');
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
    var host = step2 && step2.style.display !== 'none' ? step2 : document.querySelector('.buy-wrap');
    if (!host) return;
    var box = document.getElementById('bx-err-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'bx-err-box';
      box.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:10px;font-size:14px;font-weight:600;';
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

  window.createCharge = function () {
    clearInlineError();
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
        // automatico apos verificacao bem sucedida.
        var data = e && e.data || {};
        var msg = (e && e.message || '').toLowerCase();
        var isEmailGate = (
          e.status === 403 &&
          (data.code === 'email_not_verified'
            || data.error_code === 'email_not_verified'
            || msg.indexOf('e-mail') >= 0 || msg.indexOf('email') >= 0
            || msg.indexOf('verifique') >= 0 || msg.indexOf('confirme') >= 0)
        );
        if (isEmailGate && typeof window.requireEmailVerifiedThen === 'function') {
          if (btn) { btn.disabled = false; btn.textContent = 'Gerar QR Code de pagamento'; }
          window.requireEmailVerifiedThen(function () {
            window.createCharge();
          });
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
        } else if (c.status === 'expired' || c.status === 'rejected') {
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

  function showStep3Success(charge) {
    var step2 = document.getElementById('step-2');
    var step3 = document.getElementById('step-3');
    if (step2) step2.style.display = 'none';
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
    var pkg = getQueryPkg();
    if (!pkg) {
      // Fluxo valor livre — aguarda usuario digitar
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
