/* ==========================================================================
 * Sprint 4 (S4-5) · TOTP UI (App autenticador)
 * ==========================================================================
 * Expoe a UI minima do MFA TOTP que o backend ja tinha implementado (e
 * estava sem frontend — "dead code" pela avaliacao CTO). Auto-instala em
 * qualquer pagina que tenha `#bx-totp-status`.
 *
 * Endpoints usados:
 *   GET  /auth/me              -> ja chamado, sabe se mfa_method=='totp'
 *   POST /auth/mfa/setup       -> retorna {secret, uri}
 *   POST /auth/mfa/enable      -> body {code: '123456'}
 *   POST /auth/mfa/disable     -> body {password, code}
 * ========================================================================== */
(function () {
    'use strict';

    function $(sel) { return document.querySelector(sel); }
    function api(path, opts) {
        var token = sessionStorage.getItem('blaxx_token');
        opts = opts || {};
        var headers = Object.assign(
            { 'Content-Type': 'application/json' },
            token ? { 'Authorization': 'Bearer ' + token } : {},
            opts.headers || {}
        );
        var API = window.BLAXX_API || location.origin;
        return fetch(API + path, {
            method: opts.method || 'GET',
            headers: headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        }).then(function (res) {
            return res.text().then(function (raw) {
                var data;
                try { data = raw ? JSON.parse(raw) : {}; }
                catch (_) { throw new Error('Resposta invalida (' + res.status + ')'); }
                if (!res.ok) {
                    var err = new Error(data.error || data.message || ('HTTP ' + res.status));
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }

    function getUser() {
        try { return JSON.parse(sessionStorage.getItem('blaxx_user') || 'null'); }
        catch (_) { return null; }
    }

    // QR code via API publica (mesmo padrao que o backend usa internamente)
    function qrUrl(text) {
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='
            + encodeURIComponent(text);
    }

    function renderActions(state) {
        var actions = $('#bx-totp-actions');
        if (!actions) return;
        actions.innerHTML = '';
        if (state.enabled) {
            var btnDisable = document.createElement('button');
            btnDisable.type = 'button';
            btnDisable.className = 'button danger';
            btnDisable.textContent = 'Desativar TOTP';
            btnDisable.onclick = disableTotp;
            actions.appendChild(btnDisable);
        } else {
            var btnSetup = document.createElement('button');
            btnSetup.type = 'button';
            btnSetup.className = 'button';
            btnSetup.textContent = 'Configurar app autenticador';
            btnSetup.onclick = startSetup;
            actions.appendChild(btnSetup);
        }
    }

    function setStatus(text, cls) {
        var s = $('#bx-totp-status');
        if (!s) return;
        s.textContent = text;
        s.className = 'status mt-2 ' + (cls || '');
    }

    function refreshState() {
        var u = getUser();
        var isTotp = u && u.mfa_method === 'totp';
        setStatus(isTotp ? 'TOTP ativo ✓' : 'Inativo', isTotp ? 'ok' : '');
        renderActions({ enabled: !!isTotp });
    }

    function startSetup() {
        setStatus('Gerando QR...', '');
        api('/auth/mfa/setup', { method: 'POST', body: {} })
            .then(function (r) {
                $('#bx-totp-setup').style.display = 'block';
                $('#bx-totp-qr').innerHTML = '<img alt="QR Code TOTP" '
                    + 'src="' + qrUrl(r.uri) + '" width="200" height="200">';
                $('#bx-totp-secret-text').textContent = r.secret;
                $('#bx-totp-actions').innerHTML = '';
                setStatus('Aguardando confirmacao', '');
            })
            .catch(function (e) { setStatus('Erro: ' + e.message, 'danger'); });
    }

    function cancelSetup() {
        $('#bx-totp-setup').style.display = 'none';
        refreshState();
    }

    function enableTotp(ev) {
        ev.preventDefault();
        var code = ($('#bx-totp-code') || {}).value || '';
        if (!/^\d{6}$/.test(code)) {
            setStatus('Codigo deve ter 6 digitos', 'danger'); return;
        }
        api('/auth/mfa/enable', { method: 'POST', body: { code: code } })
            .then(function () {
                // Atualiza user local: mfa_method = totp
                var u = getUser() || {};
                u.mfa_method = 'totp';
                u.mfa_enabled = true;
                try { sessionStorage.setItem('blaxx_user', JSON.stringify(u)); }
                catch (_) {}
                $('#bx-totp-setup').style.display = 'none';
                setStatus('TOTP ativado com sucesso ✓', 'ok');
                refreshState();
            })
            .catch(function (e) {
                setStatus('Falha: ' + (e.message || 'codigo invalido'), 'danger');
            });
    }

    function disableTotp() {
        var pwd = prompt('Para desativar o TOTP, informe sua senha:');
        if (!pwd) return;
        var code = prompt('E um codigo TOTP atual do app:');
        if (!code) return;
        api('/auth/mfa/disable', { method: 'POST', body: { password: pwd, code: code } })
            .then(function () {
                var u = getUser() || {};
                u.mfa_method = null;
                u.mfa_enabled = false;
                try { sessionStorage.setItem('blaxx_user', JSON.stringify(u)); }
                catch (_) {}
                setStatus('TOTP desativado', '');
                refreshState();
            })
            .catch(function (e) {
                setStatus('Falha: ' + (e.message || 'desativar falhou'), 'danger');
            });
    }

    function init() {
        if (!$('#bx-totp-status')) return;  // pagina nao tem TOTP UI
        var f = $('#form-totp-enable');
        if (f) f.addEventListener('submit', enableTotp);
        var c = $('#bx-totp-cancel');
        if (c) c.addEventListener('click', cancelSetup);
        refreshState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
