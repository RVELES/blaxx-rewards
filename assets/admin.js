/* Admin · script da página /admin
 *
 * Liga a tabela e os toggles VIP ao backend /admin/* (precisa user.role==='admin').
 * Sem framework, sem dependências — só fetch + DOM puro.
 */
(function () {
  'use strict';

  var API = (function () {
    try { var o = localStorage.getItem('blaxx_api_url'); if (o) return o.replace(/\/+$/, ''); } catch (e) {}
    return window.BLAXX_API || location.origin;
  })();
  // Sessão: STORE do blaxx-app.js grava em localStorage (e apaga do
  // sessionStorage na migração). Ler só sessionStorage deixava o /admin
  // permanentemente inacessível. Ordem: localStorage → sessionStorage →
  // formato legado blaxx_session.
  var TOKEN = (function () {
    try {
      var t = localStorage.getItem('blaxx_token') || sessionStorage.getItem('blaxx_token');
      if (t) return t;
      return (JSON.parse(localStorage.getItem('blaxx_session') || 'null') || {}).token || null;
    } catch (e) { return null; }
  })();
  var USER = (function () {
    try {
      var u = localStorage.getItem('blaxx_user') || sessionStorage.getItem('blaxx_user');
      if (u) return JSON.parse(u);
      return (JSON.parse(localStorage.getItem('blaxx_session') || 'null') || {}).user || null;
    } catch (e) { return null; }
  })();

  // ── Guard ──────────────────────────────────────────────────────────────
  if (!TOKEN || !USER) {
    location.href = '/login';
    return;
  }
  if (USER.role !== 'admin') {
    // Não-admin tentando acessar /admin: manda pra dashboard
    alert('Acesso restrito. Apenas administradores.');
    location.href = '/dashboard';
    return;
  }

  document.getElementById('admin-name').textContent = (USER.name || '').split(' ')[0];

  // ── Helpers ────────────────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json',
                                  'Authorization': 'Bearer ' + TOKEN },
                                opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      return res.text().then(function (raw) {
        var data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) { throw new Error('Servidor respondeu HTTP ' + res.status + ' não-JSON'); }
        if (!res.ok) {
          var err = new Error(data.error || ('HTTP ' + res.status));
          err.status = res.status; err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function shortDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ── Stats (KPIs no topo) ───────────────────────────────────────────────
  function loadStats() {
    api('/admin/stats').then(function (s) {
      var grid = document.getElementById('stats-grid');
      var vol = s.volume_last_30d_by_type || {};
      var totalVol = Object.keys(vol).reduce(function (acc, k) { return acc + (vol[k] || 0); }, 0);
      grid.innerHTML = [
        kpi('Usuários', fmt(s.total_users), 'cadastrados no total'),
        kpi('Admins', fmt(s.total_admins), 'com acesso ao painel'),
        kpi('VIPs', fmt(s.total_vips), 'sem limite diário'),
        kpi('E-mail verificado', fmt(s.email_verified_users), 'usuários ativos'),
        kpi('Saldo total', fmt(s.total_balance_pts) + ' pts', 'pontos em circulação'),
        kpi('Volume 30d', fmt(totalVol) + ' pts', 'movimentado'),
      ].join('');
    }).catch(function (e) {
      console.error('stats:', e);
    });
  }
  function kpi(label, value, subtitle) {
    return '<div class="stat-card">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      '<div class="subtitle">' + subtitle + '</div>' +
      '</div>';
  }

  // ── Users tab ──────────────────────────────────────────────────────────
  var USERS_PAGE = 0;
  var USERS_LIMIT = 25;
  var USERS_TOTAL = 0;
  var _debounce;

  window.debouncedLoadUsers = function () {
    clearTimeout(_debounce);
    _debounce = setTimeout(function () { USERS_PAGE = 0; loadUsers(); }, 300);
  };

  window.loadUsers = function () {
    var q = document.getElementById('user-search').value.trim();
    var role = document.getElementById('user-role-filter').value;
    var vip = document.getElementById('user-vip-filter').value;
    var params = ['limit=' + USERS_LIMIT, 'offset=' + (USERS_PAGE * USERS_LIMIT)];
    if (q) params.push('q=' + encodeURIComponent(q));
    if (role) params.push('role=' + role);
    if (vip) params.push('vip=' + vip);

    api('/admin/users?' + params.join('&')).then(function (r) {
      USERS_TOTAL = r.total;
      var tbody = document.getElementById('users-tbody');
      if (!r.items.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum usuário encontrado.</td></tr>';
      } else {
        tbody.innerHTML = r.items.map(renderUserRow).join('');
      }
      document.getElementById('users-info').textContent =
        'Mostrando ' + (r.items.length ? (USERS_PAGE * USERS_LIMIT + 1) : 0) +
        '–' + (USERS_PAGE * USERS_LIMIT + r.items.length) + ' de ' + USERS_TOTAL;
      document.getElementById('users-prev').disabled = USERS_PAGE === 0;
      document.getElementById('users-next').disabled = (USERS_PAGE + 1) * USERS_LIMIT >= USERS_TOTAL;
    }).catch(function (e) {
      console.error('loadUsers:', e);
      document.getElementById('users-tbody').innerHTML =
        '<tr><td colspan="6" class="empty-state">Erro ao carregar: ' + e.message + '</td></tr>';
    });
  };

  function renderUserRow(u) {
    var roleBadge = u.role === 'admin' ? '<span class="badge admin">ADMIN</span> ' : '';
    var vipBadge = u.is_vip ? '<span class="badge vip">VIP</span> ' : '';
    var verifBadge = u.email_verified
      ? '<span class="badge verified">✓ verificado</span>'
      : '<span class="badge unverified">não verificado</span>';
    return '<tr>' +
      '<td>' + roleBadge + escapeHtml(u.name) + '</td>' +
      '<td>' + escapeHtml(u.email) + '</td>' +
      '<td>' + escapeHtml(u.cpf || '—') + '</td>' +
      '<td>' + fmt(u.balance_pts) + ' pts</td>' +
      '<td>' + vipBadge + verifBadge + '</td>' +
      '<td style="text-align:center;">' +
        '<label class="vip-toggle">' +
        '<input type="checkbox" ' + (u.is_vip ? 'checked' : '') +
        ' onchange="toggleVip(\'' + u.id + '\', this.checked, this)">' +
        '<span class="slider"></span>' +
        '</label>' +
      '</td>' +
      '</tr>';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" }[c];
    });
  }

  window.toggleVip = function (userId, newValue, checkbox) {
    api('/admin/users/' + userId + '/vip', {
      method: 'PATCH',
      body: JSON.stringify({ is_vip: newValue }),
    }).then(function (r) {
      loadStats(); // atualiza contador de VIPs
    }).catch(function (e) {
      // Reverte UI em caso de erro
      checkbox.checked = !newValue;
      alert('Falha ao atualizar VIP: ' + e.message);
    });
  };

  window.changePage = function (delta) {
    USERS_PAGE = Math.max(0, USERS_PAGE + delta);
    loadUsers();
  };

  // ── Transactions tab ───────────────────────────────────────────────────
  var TX_PAGE = 0;
  var TX_LIMIT = 50;
  var TX_TOTAL = 0;

  window.loadTransactions = function () {
    var type = document.getElementById('tx-type-filter').value;
    var params = ['limit=' + TX_LIMIT, 'offset=' + (TX_PAGE * TX_LIMIT)];
    if (type) params.push('type=' + type);

    api('/admin/transactions?' + params.join('&')).then(function (r) {
      TX_TOTAL = r.total;
      var tbody = document.getElementById('tx-tbody');
      if (!r.items.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma transação.</td></tr>';
      } else {
        tbody.innerHTML = r.items.map(function (t) {
          var sign = t.amount_pts > 0 ? 'pos' : 'neg';
          var prefix = t.amount_pts > 0 ? '+' : '';
          return '<tr>' +
            '<td>' + shortDate(t.created_at) + '</td>' +
            '<td>' + escapeHtml(t.user_name || '—') + '<br><small style="color:#8a918a;">' + escapeHtml(t.user_email || '') + '</small></td>' +
            '<td>' + escapeHtml(t.type) + '</td>' +
            '<td>' + escapeHtml(t.description || '—') + '</td>' +
            '<td style="text-align:right;" class="tx-amount ' + sign + '">' + prefix + fmt(t.amount_pts) + '</td>' +
            '</tr>';
        }).join('');
      }
      document.getElementById('tx-info').textContent =
        'Mostrando ' + (r.items.length ? (TX_PAGE * TX_LIMIT + 1) : 0) +
        '–' + (TX_PAGE * TX_LIMIT + r.items.length) + ' de ' + TX_TOTAL;
      document.getElementById('tx-prev').disabled = TX_PAGE === 0;
      document.getElementById('tx-next').disabled = (TX_PAGE + 1) * TX_LIMIT >= TX_TOTAL;
    }).catch(function (e) {
      console.error('loadTransactions:', e);
    });
  };

  window.changeTxPage = function (delta) {
    TX_PAGE = Math.max(0, TX_PAGE + delta);
    loadTransactions();
  };

  // ── Payments tab (PIX manual pendente) ─────────────────────────────────
  function loadPendingPayments() {
    api('/admin/charges/pending').then(function (r) {
      var tbody = document.getElementById('payments-tbody');
      if (!r.items || !r.items.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum pagamento aguardando.</td></tr>';
      } else {
        tbody.innerHTML = r.items.map(function (c) {
          var when = c.claimed_paid_at ? shortDate(c.claimed_paid_at) : '—';
          var brl = Number(c.amount_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return '<tr>' +
            '<td>' + when + '</td>' +
            '<td>' + escapeHtml(c.user_name || '—') + '<br><small style="color:#8a918a;">' + escapeHtml(c.user_email || '') + '</small></td>' +
            '<td>R$ ' + brl + '</td>' +
            '<td>' + fmt(c.points_to_credit) + ' pts</td>' +
            '<td style="text-align:center;">' +
              '<button class="button" onclick="confirmCharge(\'' + c.id + '\')" style="font-size:12px;padding:6px 12px;margin-right:4px;">Confirmar</button>' +
              '<button class="button ghost" onclick="rejectCharge(\'' + c.id + '\')" style="font-size:12px;padding:6px 12px;color:#a83417;">Rejeitar</button>' +
            '</td>' +
            '</tr>';
        }).join('');
      }
      var badge = document.getElementById('pending-count');
      if (r.items.length > 0) {
        badge.textContent = r.items.length; badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    });
  }

  window.confirmCharge = function (chargeId) {
    if (!confirm('Confirma o recebimento do PIX e libera os pontos?')) return;
    api('/admin/charges/' + chargeId + '/confirm', { method: 'POST', body: '{}' })
      .then(function () { loadPendingPayments(); loadStats(); })
      .catch(function (e) { alert('Erro: ' + e.message); });
  };

  window.rejectCharge = function (chargeId) {
    var reason = prompt('Motivo da rejeição:', 'PIX não localizado no extrato');
    if (!reason) return;
    api('/admin/charges/' + chargeId + '/reject', {
      method: 'POST',
      body: JSON.stringify({ reason: reason }),
    })
      .then(function () { loadPendingPayments(); loadStats(); })
      .catch(function (e) { alert('Erro: ' + e.message); });
  };

  // ── Payouts tab (venda/resgate PIX aguardando execução manual) ─────────
  function loadProcessingPayouts() {
    api('/admin/payouts/processing').then(function (r) {
      var tbody = document.getElementById('payouts-tbody');
      var items = r.items || [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum resgate aguardando.</td></tr>';
      } else {
        tbody.innerHTML = items.map(function (p) {
          var when = p.created_at ? shortDate(p.created_at) : (p.requested_at ? shortDate(p.requested_at) : '—');
          var brl = Number(p.amount_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return '<tr>' +
            '<td>' + when + '</td>' +
            '<td>' + escapeHtml(p.user_name || '—') + '<br><small style="color:#8a918a;">' + escapeHtml(p.user_email || '') + '</small></td>' +
            '<td><code>' + escapeHtml(p.pix_key || '—') + '</code></td>' +
            '<td>R$ ' + brl + '</td>' +
            '<td>' + fmt(p.points_debited) + ' pts</td>' +
            '<td style="text-align:center;">' +
              '<button class="button" onclick="confirmPayout(\'' + p.id + '\')" style="font-size:12px;padding:6px 12px;margin-right:4px;">Confirmar</button>' +
              '<button class="button ghost" onclick="failPayout(\'' + p.id + '\')" style="font-size:12px;padding:6px 12px;color:#a83417;">Falhou</button>' +
            '</td>' +
            '</tr>';
        }).join('');
      }
      var badge = document.getElementById('payouts-count');
      if (items.length > 0) { badge.textContent = items.length; badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    }).catch(function (e) {
      var tbody = document.getElementById('payouts-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Erro ao carregar: ' + escapeHtml(e.message) + '</td></tr>';
    });
  }

  window.confirmPayout = function (payoutId) {
    var e2e = prompt('EndToEndID do comprovante PIX (opcional, mas recomendado):', '');
    if (e2e === null) return; // cancelou
    if (!confirm('Confirma que o PIX foi transferido? Isso finaliza o resgate.')) return;
    api('/admin/payouts/' + payoutId + '/confirm', {
      method: 'POST',
      body: JSON.stringify({ end_to_end_id: (e2e || '').trim() }),
    })
      .then(function () { loadProcessingPayouts(); loadStats(); })
      .catch(function (e) { alert('Erro: ' + e.message); });
  };

  window.failPayout = function (payoutId) {
    var reason = prompt('Motivo da falha (os pontos serão estornados ao usuário):', 'Chave PIX inválida ou não localizada');
    if (!reason) return;
    if (!confirm('Marcar como falho e ESTORNAR os pontos ao usuário?')) return;
    api('/admin/payouts/' + payoutId + '/fail', {
      method: 'POST',
      body: JSON.stringify({ reason: reason }),
    })
      .then(function () { loadProcessingPayouts(); loadStats(); })
      .catch(function (e) { alert('Erro: ' + e.message); });
  };

  // ── Packages tab (preços editáveis: rascunho → Publicar) ───────────────
  var _pkgInput = 'width:110px;padding:8px 10px;border:1px solid #e6eadf;border-radius:8px;background:#0c110c;font-size:14px;text-align:right;';

  function loadPackages() {
    var tbody = document.getElementById('packages-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Carregando...</td></tr>';
    api('/admin/packages').then(function (r) {
      var items = r.items || [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum pacote cadastrado.</td></tr>';
        updatePkgToolbar(0);
        return;
      }
      tbody.innerHTML = items.map(renderPackageRow).join('');
      var pending = items.filter(function (p) { return p.has_draft; }).length;
      updatePkgToolbar(pending);
    }).catch(function (e) {
      console.error('loadPackages:', e);
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Erro ao carregar: ' + escapeHtml(e.message) + '</td></tr>';
    });
  }

  function updatePkgToolbar(pending) {
    var pub = document.getElementById('pkg-publish-btn');
    var disc = document.getElementById('pkg-discard-btn');
    var info = document.getElementById('pkg-pending');
    if (pub) { pub.disabled = pending === 0; pub.textContent = pending ? 'Publicar alterações (' + pending + ')' : 'Publicar alterações'; }
    if (disc) disc.disabled = pending === 0;
    if (info) info.textContent = pending ? '● ' + pending + ' alteração(ões) não publicada(s) — o site ainda mostra o preço publicado' : 'Tudo publicado.';
  }

  function renderPackageRow(p) {
    var key = escapeHtml(p.key);
    // valor a EDITAR = rascunho pendente (se houver), senão o publicado
    var eff = (p.has_draft && p.draft) ? p.draft : p;
    var label = eff.label != null ? eff.label : p.label;
    var points = Number(eff.points != null ? eff.points : p.points);
    var priceBrl = Number(eff.price_brl != null ? eff.price_brl : (eff.price_cents || 0) / 100);
    var active = eff.active != null ? eff.active : p.active;
    var draftTag = p.has_draft
      ? '<div style="font-size:11px;color:#c89a2a;font-weight:600;margin-top:4px;">● rascunho · publicado: R$ ' +
          Number(p.price_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
          ' / ' + Number(p.points).toLocaleString('pt-BR') + ' pts</div>'
      : '';
    return '<tr data-key="' + key + '"' + (p.has_draft ? ' style="background:#14100633;"' : '') + '>' +
      '<td><code>' + key + '</code>' + draftTag + '</td>' +
      '<td><input type="text" class="pkg-label" value="' + escapeHtml(label || '') +
        '" style="width:100%;padding:8px 10px;border:1px solid #e6eadf;border-radius:8px;background:#0c110c;font-size:14px;"></td>' +
      '<td style="text-align:right;"><input type="number" class="pkg-points" min="1" step="1" value="' + points + '" style="' + _pkgInput + '"></td>' +
      '<td style="text-align:right;"><input type="number" class="pkg-price" min="1" step="0.01" value="' + priceBrl.toFixed(2) + '" style="' + _pkgInput + '"></td>' +
      '<td style="text-align:center;">' +
        '<label class="vip-toggle"><input type="checkbox" class="pkg-active" ' + (active ? 'checked' : '') + '><span class="slider"></span></label>' +
      '</td>' +
      '<td style="text-align:center;">' +
        '<button class="button" onclick="savePackage(\'' + key + '\', this)" style="font-size:12px;padding:6px 12px;">Salvar rascunho</button>' +
        '<div class="pkg-status" style="font-size:11px;margin-top:4px;min-height:14px;"></div>' +
      '</td>' +
      '</tr>';
  }

  window.savePackage = function (key, btn) {
    var row = btn.closest('tr');
    var status = row.querySelector('.pkg-status');
    var label = row.querySelector('.pkg-label').value.trim();
    var points = parseInt(row.querySelector('.pkg-points').value, 10);
    var priceBrl = parseFloat(row.querySelector('.pkg-price').value);
    var active = row.querySelector('.pkg-active').checked;

    if (isNaN(priceBrl) || priceBrl <= 0) { status.textContent = 'Preço inválido'; status.style.color = '#a83417'; return; }
    if (isNaN(points) || points < 1) { status.textContent = 'Pontos inválidos'; status.style.color = '#a83417'; return; }

    btn.disabled = true;
    status.textContent = 'Salvando rascunho...'; status.style.color = '#8a918a';
    api('/admin/packages/' + encodeURIComponent(key), {
      method: 'PUT',
      body: JSON.stringify({ price_brl: priceBrl, points: points, label: label, active: active }),
    }).then(function () {
      loadPackages();  // recarrega → mostra selo de rascunho + habilita Publicar
    }).catch(function (e) {
      status.textContent = '✗ ' + e.message; status.style.color = '#a83417';
      alert('Falha ao salvar rascunho: ' + e.message);
      btn.disabled = false;
    });
  };

  window.publishPackages = function (btn) {
    if (!confirm('Publicar as alterações de preço? A partir de agora o site e a cobrança PIX passam a usar os novos valores.')) return;
    btn.disabled = true;
    api('/admin/packages/publish', { method: 'POST', body: '{}' }).then(function (r) {
      alert('Publicado: ' + (r.count || 0) + ' pacote(s). O site já reflete no próximo carregamento.');
      loadPackages();
    }).catch(function (e) {
      alert('Falha ao publicar: ' + e.message); btn.disabled = false;
    });
  };

  window.discardDrafts = function (btn) {
    if (!confirm('Descartar todos os rascunhos não publicados? Os preços voltam ao que está publicado.')) return;
    btn.disabled = true;
    api('/admin/packages/discard', { method: 'POST', body: '{}' }).then(function () {
      loadPackages();
    }).catch(function (e) {
      alert('Falha ao descartar: ' + e.message); btn.disabled = false;
    });
  };

  // ── Tabs ───────────────────────────────────────────────────────────────
  // ── Redes B2B ──────────────────────────────────────────────────────────
  //
  // O número que importa aqui é "A receber": pontos já emitidos que a rede deve
  // pagar. E o selo "insolvente" marca contrato que paga por ponto menos do que
  // custa resgatá-lo — essas redes param de emitir sozinhas (o backend recusa),
  // e sem o aviso o operador só veria o caixa em silêncio, sem saber por quê.
  var CUSTO_RESGATE = null;

  function brlFmt(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function loadMerchants() {
    api('/admin/merchants').then(function (d) {
      CUSTO_RESGATE = d.redemption_cost_cents;
      var t = d.totals || {};
      document.getElementById('b2b-stats').innerHTML =
        kpi('Redes cadastradas', fmt(t.merchants), 'com contrato ativo') +
        kpi('Pontos emitidos', fmt(t.points_issued), 'desde o início') +
        kpi('GMV pontuado', brlFmt(t.gmv_brl), 'vendas que geraram ponto') +
        kpi('A receber', brlFmt(t.receivable_brl), 'total devido pelas redes');

      var alerta = document.getElementById('b2b-alerta');
      if (t.insolvent > 0) {
        alerta.textContent = t.insolvent + ' rede(s) com contrato abaixo do custo de resgate ('
          + CUSTO_RESGATE + ' centavos por ponto). Estão bloqueadas para emissão até renegociar: '
          + 'cada ponto emitido nasceria com prejuízo.';
        alerta.style.display = '';
      } else {
        alerta.style.display = 'none';
      }

      var tb = document.getElementById('merchants-tbody');
      tb.innerHTML = (d.items || []).length ? d.items.map(renderMerchantRow).join('')
        : '<tr><td colspan="7" class="empty-state">Nenhuma rede cadastrada.</td></tr>';
    }).catch(function (e) { console.error('merchants:', e); });
  }

  function renderMerchantRow(m) {
    var contrato = m.accrual_label + ' \u00b7 rede paga R$ '
      + (m.bill_cents_per_point / 100).toFixed(2).replace('.', ',') + '/pt';
    var selo = m.solvent ? '' : '<span class="badge unverified" style="margin-left:6px;">insolvente</span>';
    var inativa = m.is_active ? '' : '<span class="badge unverified" style="margin-left:6px;">inativa</span>';
    return '<tr>'
      + '<td><b>' + escapeHtml(m.name) + '</b>' + selo + inativa
        + '<div style="font-size:11px;color:#5f665e;">' + escapeHtml(m.cnpj) + ' \u00b7 '
        + m.active_keys + ' chave(s) \u00b7 ' + m.panel_users + ' acesso(s)</div></td>'
      + '<td>' + escapeHtml(m.vertical) + '</td>'
      + '<td style="font-size:12px;">' + escapeHtml(contrato) + '</td>'
      + '<td style="text-align:right;">' + fmt(m.points_issued) + '</td>'
      + '<td style="text-align:right;">' + brlFmt(m.gmv_brl) + '</td>'
      + '<td style="text-align:right;"><b>' + brlFmt(m.amount_due_brl) + '</b></td>'
      + '<td style="text-align:center;white-space:nowrap;">'
        + '<button class="button ghost" style="font-size:12px;padding:4px 10px;" onclick="emitirChave(&quot;'
        + m.id + '&quot;)">chave</button> '
        + '<button class="button ghost" style="font-size:12px;padding:4px 10px;" onclick="criarAcesso(&quot;'
        + m.id + '&quot;)">acesso</button> '
        + '<button class="button ghost" style="font-size:12px;padding:4px 10px;" onclick="fecharFatura(&quot;'
        + m.id + '&quot;)">faturar</button>'
      + '</td></tr>';
  }

  window.toggleNovaRede = function () {
    var el = document.getElementById('nova-rede');
    el.style.display = el.style.display === 'none' ? '' : 'none';
  };

  window.criarRede = function (btn) {
    var corpo = {
      name: document.getElementById('nr-nome').value.trim(),
      cnpj: document.getElementById('nr-cnpj').value.trim(),
      vertical: document.getElementById('nr-vertical').value,
      accrual_cents_per_point: parseInt(document.getElementById('nr-acumulo').value, 10),
      bill_cents_per_point: parseInt(document.getElementById('nr-cobranca').value, 10)
    };
    btn.disabled = true;
    api('/admin/merchants', { method: 'POST', body: JSON.stringify(corpo) })
      .then(function (r) {
        document.getElementById('nr-aviso').textContent = r.insolvent
          ? 'Cadastrada, mas o contrato está abaixo do custo de resgate \u2014 não vai emitir.'
          : '';
        document.getElementById('nr-nome').value = '';
        document.getElementById('nr-cnpj').value = '';
        loadMerchants();
      })
      .catch(function (e) { document.getElementById('nr-aviso').textContent = e.message; })
      .then(function () { btn.disabled = false; });
  };

  window.emitirChave = function (id) {
    api('/admin/merchants/' + id + '/keys', { method: 'POST', body: '{}' })
      .then(function (r) {
        document.getElementById('credencial-valor').textContent = r.key;
        document.getElementById('credencial-nova').style.display = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        loadMerchants();
      }).catch(function (e) { alert(e.message); });
  };

  window.criarAcesso = function (id) {
    var email = prompt('E-mail de acesso ao painel desta rede:');
    if (!email) return;
    var senha = prompt('Senha inicial (mínimo 8 caracteres):');
    if (!senha || senha.length < 8) { alert('Senha muito curta.'); return; }
    api('/admin/merchants/' + id + '/users', {
      method: 'POST', body: JSON.stringify({ email: email.trim(), password: senha })
    }).then(function () {
      alert('Acesso criado. A rede entra em /parceiro.html com este e-mail.');
      loadMerchants();
    }).catch(function (e) { alert(e.message); });
  };

  function loadInvoices() {
    api('/admin/invoices').then(function (d) {
      document.getElementById('inv-total').textContent =
        brlFmt((d.totals || {}).unpaid_brl) + ' a receber';
      var rotulo = { open: 'a pagar', paid: 'paga', void: 'anulada' };
      document.getElementById('invoices-tbody').innerHTML = (d.items || []).length
        ? d.items.map(function (f) {
            var per = (f.period_start || '').slice(0, 10).split('-').reverse().join('/')
                    + ' \u2013 ' + (f.period_end || '').slice(0, 10).split('-').reverse().join('/');
            var acoes = f.status === 'open'
              ? '<button class="button ghost" style="font-size:12px;padding:4px 10px;" onclick="pagarFatura(&quot;'
                + f.id + '&quot;)">baixar</button> '
                + '<button class="button ghost" style="font-size:12px;padding:4px 10px;" onclick="anularFatura(&quot;'
                + f.id + '&quot;)">anular</button>'
              : '';
            return '<tr><td><code>' + escapeHtml(f.number) + '</code></td>'
              + '<td>' + escapeHtml(f.merchant_name || '') + '</td>'
              + '<td>' + escapeHtml(per) + '</td>'
              + '<td style="text-align:right;">' + fmt(f.points_issued) + '</td>'
              + '<td style="text-align:right;">' + brlFmt(f.credit_brl) + '</td>'
              + '<td style="text-align:right;"><b>' + brlFmt(f.amount_brl) + '</b></td>'
              + '<td style="text-align:center;"><span class="badge '
                + (f.status === 'paid' ? 'verified' : (f.status === 'void' ? 'vip' : 'unverified'))
                + '">' + escapeHtml(rotulo[f.status] || f.status) + '</span></td>'
              + '<td style="text-align:center;white-space:nowrap;">' + acoes + '</td></tr>';
          }).join('')
        : '<tr><td colspan="8" class="empty-state">Nenhuma fatura fechada.</td></tr>';
    }).catch(function (e) { console.error('invoices:', e); });
  }

  window.fecharFatura = function (id) {
    // Sem datas o backend fecha o mês anterior inteiro, que é o caso normal.
    if (!confirm('Fechar o período desta rede? Os totais ficam congelados na fatura.')) return;
    api('/admin/merchants/' + id + '/invoices/close', { method: 'POST', body: '{}' })
      .then(function (f) {
        alert('Fatura ' + f.number + ' fechada: ' + brlFmt(f.amount_brl));
        loadMerchants(); loadInvoices();
      }).catch(function (e) { alert(e.message); });
  };

  window.pagarFatura = function (id) {
    var nota = prompt('Referência do pagamento (opcional):') || '';
    api('/admin/invoices/' + id + '/pay', { method: 'POST', body: JSON.stringify({ note: nota }) })
      .then(function () { loadInvoices(); }).catch(function (e) { alert(e.message); });
  };

  window.anularFatura = function (id) {
    if (!confirm('Anular esta fatura? As vendas voltam para o estado em aberto e '
               + 'entram no próximo fechamento.')) return;
    api('/admin/invoices/' + id + '/void', { method: 'POST', body: '{}' })
      .then(function () { loadMerchants(); loadInvoices(); }).catch(function (e) { alert(e.message); });
  };

  window.switchTab = function (tab) {
    document.querySelectorAll('.tab-row button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.getElementById('tab-users').style.display = tab === 'users' ? '' : 'none';
    document.getElementById('tab-transactions').style.display = tab === 'transactions' ? '' : 'none';
    document.getElementById('tab-payments').style.display = tab === 'payments' ? '' : 'none';
    document.getElementById('tab-payouts').style.display = tab === 'payouts' ? '' : 'none';
    document.getElementById('tab-packages').style.display = tab === 'packages' ? '' : 'none';
    document.getElementById('tab-merchants').style.display = tab === 'merchants' ? '' : 'none';
    if (tab === 'transactions' && TX_TOTAL === 0) loadTransactions();
    if (tab === 'payments') loadPendingPayments();
    if (tab === 'payouts') loadProcessingPayouts();
    if (tab === 'packages') loadPackages();
    if (tab === 'merchants') { loadMerchants(); loadInvoices(); }
  };

  window.adminLogout = function () {
    // Limpa os DOIS formatos em localStorage (o guard lê de localStorage
    // primeiro); só sessionStorage.clear() deixava a sessão viva e o
    // "Sair" não deslogava de fato. Revoga o token no servidor também.
    var _done = function () {
      ['blaxx_token', 'blaxx_user', 'blaxx_session'].forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      try { sessionStorage.clear(); } catch (e) {}
      location.href = '/login';
    };
    try {
      fetch(API + '/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + TOKEN }
      }).catch(function () {}).then(_done, _done);
    } catch (e) { _done(); }
  };

  // ── Boot ───────────────────────────────────────────────────────────────
  loadStats();
  loadUsers();
  // Atualiza badge de pendentes a cada 30s
  loadPendingPayments();
  setInterval(loadPendingPayments, 30000);
})();
