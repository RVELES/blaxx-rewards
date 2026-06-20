/* ==========================================================================
 * Sprint 3 (S3-7) · Cookie banner LGPD
 * ==========================================================================
 * Atende a obrigacao LGPD (art. 8) de consentimento livre, informado e
 * inequivoco para tracking/analytics. Categorias separadas:
 *   - essencial: sempre on (login, seguranca) — nao precisa de aceite
 *   - analytics: aceite explicito (GA, PostHog, Mixpanel)
 *   - marketing: aceite explicito (Meta Pixel, ads remarketing)
 *
 * Preferencias salvas em localStorage como blaxx_cookie_consent_v1.
 * Para revogar: link no footer "Configuracoes de cookies".
 *
 * Trigger: o site nao chama analytics direto — outros scripts checam
 * window.blaxxConsent({category}) antes de carregar tags.
 * ========================================================================== */
(function () {
    'use strict';
    var KEY = 'blaxx_cookie_consent_v1';
    var DEFAULT = { essential: true, analytics: false, marketing: false, ts: null };

    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) { return null; }
    }

    function save(prefs) {
        prefs.ts = new Date().toISOString();
        try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {}
        // Dispara evento pros listeners (scripts de analytics)
        try {
            document.dispatchEvent(new CustomEvent('blaxx:consent-changed', {
                detail: prefs,
            }));
        } catch (_) {}
    }

    // API publica — outros scripts chamam pra checar consentimento
    window.blaxxConsent = function (category) {
        var prefs = load() || DEFAULT;
        return !!prefs[category];
    };
    window.blaxxConsentPrefs = function () {
        return load() || DEFAULT;
    };
    window.blaxxConsentOpenSettings = function () {
        renderBanner(true);  // modo "configuracoes" com opcoes detalhadas
    };

    function el(tag, attrs, children) {
        var e = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'style') e.style.cssText = attrs[k];
            else if (k === 'html') e.innerHTML = attrs[k];
            else e.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) {
            if (typeof c === 'string') e.appendChild(document.createTextNode(c));
            else if (c) e.appendChild(c);
        });
        return e;
    }

    function renderBanner(settingsMode) {
        // Remove banner existente se ja estiver montado
        var existing = document.getElementById('bx-cookie-banner');
        if (existing) existing.remove();

        var prefs = load() || DEFAULT;
        var simpleMode = !settingsMode && load() === null;

        var bar = el('div', {
            id: 'bx-cookie-banner',
            role: 'dialog',
            'aria-modal': 'false',
            'aria-label': 'Configuracoes de cookies',
            style: 'position:fixed;bottom:0;left:0;right:0;z-index:9500;'
                 + 'background:#0A0A0A;color:#fff;padding:18px 24px;'
                 + 'box-shadow:0 -8px 24px rgba(0,0,0,0.25);'
                 + 'display:flex;flex-wrap:wrap;align-items:center;gap:16px;'
                 + 'font-family:-apple-system,Inter,Segoe UI,system-ui,sans-serif;font-size:14px;'
        });

        if (simpleMode) {
            // Banner inicial: aceita tudo / so essenciais / configurar
            var txt = el('div', { style: 'flex:1;min-width:240px;line-height:1.5;' });
            txt.innerHTML = 'Usamos cookies essenciais para o funcionamento do site e, '
                + 'mediante seu consentimento, cookies de analytics e marketing. '
                + '<a href="documentos-termos.html" style="color:#7CFF00;">Saiba mais</a>.';

            var btns = el('div', {
                style: 'display:flex;gap:8px;flex-wrap:wrap;'
            });
            var btnConfig = el('button', {
                type: 'button',
                style: 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.30);'
                     + 'padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;'
            }, ['Configurar']);
            var btnEssOnly = el('button', {
                type: 'button',
                style: 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.30);'
                     + 'padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;'
            }, ['Apenas essenciais']);
            var btnAccept = el('button', {
                type: 'button',
                style: 'background:#7CFF00;color:#0A0A0A;border:none;'
                     + 'padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;'
            }, ['Aceitar todos']);

            btnConfig.addEventListener('click', function () { renderBanner(true); });
            btnEssOnly.addEventListener('click', function () {
                save({ essential: true, analytics: false, marketing: false });
                bar.remove();
            });
            btnAccept.addEventListener('click', function () {
                save({ essential: true, analytics: true, marketing: true });
                bar.remove();
            });

            btns.appendChild(btnConfig);
            btns.appendChild(btnEssOnly);
            btns.appendChild(btnAccept);

            bar.appendChild(txt);
            bar.appendChild(btns);
        } else {
            // Modo configuracao: 3 checkboxes
            var ttl = el('div', { style: 'flex:1 1 100%;font-weight:700;font-size:16px;margin-bottom:4px;' },
                ['Configuracoes de cookies']);
            bar.appendChild(ttl);

            function row(id, label, hint, locked, checked) {
                var wrap = el('label', {
                    style: 'display:flex;align-items:flex-start;gap:10px;flex:1 1 220px;cursor:pointer;'
                });
                var inp = el('input', { type: 'checkbox', id: id });
                if (locked) {
                    inp.checked = true;
                    inp.disabled = true;
                    inp.style.cssText = 'accent-color:#7CFF00;opacity:0.6;margin-top:3px;';
                } else {
                    inp.checked = !!checked;
                    inp.style.cssText = 'accent-color:#7CFF00;margin-top:3px;';
                }
                var txt = el('span', { style: 'font-size:13px;line-height:1.4;' });
                txt.innerHTML = '<strong>' + label + '</strong><br>'
                              + '<span style="color:rgba(255,255,255,0.65);">' + hint + '</span>';
                wrap.appendChild(inp);
                wrap.appendChild(txt);
                return wrap;
            }

            bar.appendChild(row('bx-cc-ess', 'Essenciais',
                'Login, seguranca e funcoes basicas. Sempre ativos.', true, true));
            bar.appendChild(row('bx-cc-ana', 'Analytics',
                'Nos ajudam a entender como voce usa o site (sem identificar voce).',
                false, prefs.analytics));
            bar.appendChild(row('bx-cc-mkt', 'Marketing',
                'Personalizacao de campanhas e ofertas. Pode incluir tracking de terceiros.',
                false, prefs.marketing));

            var bsave = el('button', {
                type: 'button',
                style: 'background:#7CFF00;color:#0A0A0A;border:none;'
                     + 'padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;'
            }, ['Salvar preferencias']);
            bsave.addEventListener('click', function () {
                save({
                    essential: true,
                    analytics: document.getElementById('bx-cc-ana').checked,
                    marketing: document.getElementById('bx-cc-mkt').checked,
                });
                bar.remove();
            });
            bar.appendChild(bsave);
        }

        document.body.appendChild(bar);
    }

    // Auto-mostra na primeira visita (sem prefs salvas)
    function init() {
        if (load() === null) {
            // Pequeno delay pra nao competir com o load inicial da pagina
            setTimeout(function () { renderBanner(false); }, 600);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
