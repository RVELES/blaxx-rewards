/* Comprar pontos · valor livre · fluxo PIX manual com confirmação admin */
(function () {
  'use strict';

  var API = window.BLAXX_API || location.origin;
  var TOKEN = sessionStorage.getItem('blaxx_token');

  if (!TOKEN) { location.href = '/login'; return; }

  var currentCharge = null;

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

  // Etapa 1 — valor
  window.onAmountChange = function (val) {
    var amount = parseInputAmount(val);
    var pts = Math.round(amount * 100);
    document.getElementById('points-preview').textContent = pts.toLocaleString('pt-BR');
    document.getElementById('btn-create').disabled = amount < 10;
  };

  window.createCharge = function () {
    var amount = parseInputAmount(document.getElementById('amount-input').value);
    if (amount < 10) {
      alert('Valor mínimo: R$ 10,00');
      return;
    }
    var btn = document.getElementById('btn-create');
    btn.disabled = true; btn.textContent = 'Gerando QR...';

    api('/pix/custom-charge', {
      method: 'POST',
      body: JSON.stringify({ amount_brl: amount }),
    }).then(function (charge) {
      currentCharge = charge;
      // Etapa 2: mostra QR
      document.getElementById('pix-amount-display').textContent = fmtBRL(charge.amount_brl);
      document.getElementById('qr-img').src = API + '/static/pix-qr-blaxx.png';
      document.getElementById('step-1').style.display = 'none';
      document.getElementById('step-2').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) {
      alert('Erro: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Gerar QR Code de pagamento';
    });
  };

  window.claimPaid = function () {
    if (!currentCharge) return;
    var btn = document.getElementById('btn-claim');
    btn.disabled = true; btn.textContent = 'Enviando...';

    api('/pix/custom-charge/' + currentCharge.id + '/claim-paid', {
      method: 'POST',
      body: '{}',
    }).then(function () {
      document.getElementById('step-2').style.display = 'none';
      document.getElementById('step-3').style.display = 'block';
      // Polling: a cada 10s checa se admin já confirmou
      pollChargeStatus(currentCharge.id);
    }).catch(function (e) {
      alert('Erro: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Já paguei pelo banco';
    });
  };

  function pollChargeStatus(chargeId) {
    var interval = setInterval(function () {
      api('/pix/my-charges').then(function (r) {
        var c = (r.items || []).find(function (x) { return x.id === chargeId; });
        if (!c) return;
        var pill = document.getElementById('status-pill');
        if (c.status === 'paid') {
          pill.className = 'status-pill status-paid';
          pill.textContent = '✓ Pontos liberados!';
          clearInterval(interval);
          setTimeout(function () { location.href = '/carteira'; }, 2000);
        } else if (c.status === 'rejected') {
          pill.className = 'status-pill status-rejected';
          pill.textContent = '✗ Pagamento rejeitado';
          clearInterval(interval);
        }
      });
    }, 10000);
  }

  window.goWallet = function () { location.href = '/carteira'; };
})();
