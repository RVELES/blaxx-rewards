/* Comprar pontos · valor livre · fluxo PIX automatizado via Mercado Pago.
 *
 * Substitui o antigo fluxo manual (admin confirmava) por chamada direta
 * a /pix/charge com amount_brl. Backend integra com MP e devolve QR Code
 * real (PNG base64) + BR Code copia-e-cola.
 *
 * Confirmação é automática via webhook MP → polling a cada 4s pra
 * detectar quando charge.status === 'paid'.
 */
(function () {
  'use strict';

  var API = window.BLAXX_API || location.origin;
  var TOKEN = sessionStorage.getItem('blaxx_token');

  if (!TOKEN) { location.href = '/login'; return; }

  var currentCharge = null;
  var pollHandle = null;

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + TOKEN,
    }, opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      return res.text().then(function (raw) {
        var data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) { throw new Error('Resposta inválida do servidor (' + res.status + ')'); }
        if (!res.ok) {
          var err = new Error(data.error || ('HTTP ' + res.status));
          err.status = res.status;
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

  // Conversao R$ <-> pontos · 1 pt = R$ 0,09 = 9 centavos
  // Sincronizar com backend Config.CENTS_PER_POINT.
  var CENTS_PER_POINT = 9;

  // Etapa 1 — valor
  window.onAmountChange = function (val) {
    var amount = parseInputAmount(val);
    var cents = Math.round(amount * 100);
    var pts = Math.floor(cents / CENTS_PER_POINT);
    document.getElementById('points-preview').textContent = pts.toLocaleString('pt-BR');
    document.getElementById('btn-create').disabled = amount < 10;
  };

  // Se a URL trouxer ?pkg=plus, troca pro fluxo de pacote
  function getQueryPkg() {
    var m = location.search.match(/[?&]pkg=([a-z]+)/i);
    return m ? m[1].toLowerCase() : null;
  }

  window.createCharge = function () {
    var amount = parseInputAmount(document.getElementById('amount-input').value);
    if (amount < 10) {
      alert('Valor mínimo: R$ 10,00');
      return;
    }
    var btn = document.getElementById('btn-create');
    btn.disabled = true; btn.textContent = 'Gerando QR...';

    var body = { amount_brl: amount };
    var pkg = getQueryPkg();
    if (pkg) {
      // Compra de pacote: ignora amount digitado e usa o pkg da URL
      body = { package: pkg };
    }

    api('/pix/charge', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(function (charge) {
      currentCharge = charge;
      showStep2(charge);
      startPolling(charge.id);
    }).catch(function (e) {
      alert('Erro: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Gerar QR Code de pagamento';
    });
  };

  function showStep2(charge) {
    document.getElementById('pix-amount-display').textContent = fmtBRL(charge.amount_brl);

    var img = document.getElementById('qr-img');
    if (charge.qr_code_image) {
      // MP devolveu data-URI base64 do PNG do QR — usa direto.
      img.src = charge.qr_code_image;
      img.style.display = 'block';
    } else {
      // Fallback: provider sem QR PNG (ex: alguns mocks). Esconde a img
      // e oferece só o copia-e-cola.
      img.style.display = 'none';
    }

    // Adiciona caixa com BR Code copia-e-cola
    var brBox = document.getElementById('br-code-box');
    if (!brBox) {
      brBox = document.createElement('div');
      brBox.id = 'br-code-box';
      brBox.style.cssText = 'margin-top:16px;text-align:left;';
      brBox.innerHTML =
        '<div style="font-size:12px;color:#5f665e;margin-bottom:6px;">Ou copie o código PIX:</div>' +
        '<div style="display:flex;gap:8px;align-items:stretch;">' +
          '<textarea id="br-code-text" readonly style="flex:1;height:64px;font-family:ui-monospace,monospace;font-size:11px;background:#f5f7f0;border:1px solid #e6eadf;border-radius:8px;padding:8px;resize:none;"></textarea>' +
          '<button id="br-code-copy" class="button secondary" type="button" style="white-space:nowrap;">Copiar</button>' +
        '</div>';
      document.querySelector('#step-2 .qr-box').appendChild(brBox);
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
    document.getElementById('br-code-text').value = charge.br_code || '';

    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Polling automático — checa status da charge a cada 4s.
  // Quando webhook MP confirma e marca como PAID, esse polling detecta
  // e redireciona pra carteira automaticamente.
  function startPolling(chargeId) {
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = setInterval(function () {
      api('/pix/charge/' + chargeId).then(function (c) {
        if (c.status === 'paid') {
          clearInterval(pollHandle);
          showStep3Success(c);
        } else if (c.status === 'expired' || c.status === 'rejected') {
          clearInterval(pollHandle);
          alert('Charge ' + c.status + '. Gere uma nova cobrança.');
          location.reload();
        }
      }).catch(function () { /* silent retry */ });
    }, 4000);
  }

  function showStep3Success(charge) {
    document.getElementById('step-2').style.display = 'none';
    var step3 = document.getElementById('step-3');
    step3.style.display = 'block';
    step3.innerHTML =
      '<h3 style="margin-bottom:12px;"><span class="step-num">3</span> Pagamento confirmado!</h3>' +
      '<p style="font-size:18px;">+' + (charge.points_to_credit || 0).toLocaleString('pt-BR') +
        ' pts adicionados à sua carteira.</p>' +
      '<div style="text-align:center;margin-top:16px;">' +
        '<span class="status-pill status-paid">✓ Pontos liberados</span>' +
      '</div>' +
      '<button class="button full lg" onclick="goWallet()" style="margin-top:18px;">' +
        'Ir para minha carteira' +
      '</button>';
  }

  window.goWallet = function () { location.href = '/carteira'; };

  // Se chegou aqui com ?pkg=plus, dispara o fluxo de pacote automaticamente
  // (sem precisar digitar valor). Backend usa Config.POINT_PACKAGES[pkg].
  document.addEventListener('DOMContentLoaded', function () {
    var pkg = getQueryPkg();
    if (!pkg) return;
    // Esconde a etapa de digitar valor — vai direto pro QR
    var step1 = document.getElementById('step-1');
    if (step1) step1.style.display = 'none';
    // Mostra um spinner enquanto o backend gera
    var loading = document.createElement('div');
    loading.id = 'pkg-loading';
    loading.style.cssText = 'text-align:center;padding:48px;color:#5f665e;';
    loading.textContent = 'Gerando seu QR Code…';
    document.querySelector('.buy-wrap').insertBefore(loading, step1);
    window.createCharge();
    var tryRemove = setInterval(function () {
      if (document.getElementById('step-2').style.display === 'block') {
        var el = document.getElementById('pkg-loading');
        if (el) el.remove();
        clearInterval(tryRemove);
      }
    }, 200);
  });
})();
