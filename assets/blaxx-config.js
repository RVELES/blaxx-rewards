/* Configuração do front BlaXx.
 *
 * Lógica:
 *  - Em localhost / 127.0.0.1 / IP da LAN → backend dev local (porta 5000 ou 5050)
 *  - Em produção (netlify.app, blaxxpontos.com) → Render.com (migrado do Fly.io)
 *
 * O blaxx-app.js lê window.BLAXX_API. Se não definida, cai em location.origin.
 */
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);

  if (isLocal) {
    // Modo dev:
    //  - Se o front esta sendo servido pelo Flask (porta 5000 por default),
    //    location.origin ja eh o backend → sem CORS.
    //  - Se o front esta em outra porta (ex: python -m http.server 8000),
    //    aponta explicitamente para o Flask em :5000.
    // Porta do backend em dev = 5050 (mesma do .claude/launch.json e do
    // runbook: `cd blaxx_exe/backend && FLASK_ENV=development python3 run.py`).
    // Antes apontava para 5000, que não bate com nada que rodamos.
    // Override manual: window.BLAXX_API_PORT antes deste script.
    var port = location.port;
    var devApiPort = window.BLAXX_API_PORT || '5050';
    if (!port || port === devApiPort) {
      window.BLAXX_API = location.origin;
    } else {
      window.BLAXX_API = location.protocol + '//' + location.hostname + ':' + devApiPort;
    }
  } else {
    // Modo produção — migrado do Fly.io pra Render.com em 2026-05-27.
    // Render builda nativo Python na cloud deles (sem Docker), o que evita
    // o problema crônico de DNS no buildkit local em ambientes WSL2.
    // Backend canônico de produção (único liberado na CSP connect-src).
    // O host antigo "-backend" foi desligado; usar "-exe".
    window.BLAXX_API = "https://blaxx-pontos-exe.onrender.com";
  }

  // ---------------- Google OAuth ----------------
  // Client ID Web do projeto "BlaXx" no Google Cloud Console.
  // Esse valor é PÚBLICO por design — pode aparecer no JS do browser sem risco
  // (a segurança vem da validação do ID token no backend, não do Client ID).
  // Atualizado em 02/08/2026 com o valor lido direto do Google Cloud Console.
  // O anterior (105341431878-tj5vi2is…) foi aposentado. Se mudar aqui, mude
  // também GOOGLE_WEB_CLIENT_ID_DEFAULT em blaxx_exe/backend/app/config.py —
  // o backend só aceita ID token cujo `aud` esteja na lista dele, e o
  // test_google_oauth.py::test_17 falha se os dois divergirem.
  window.BLAXX_GOOGLE_CLIENT_ID = "602998235238-ab43odgkvqjph1l0tgu8n49iafgkrcke.apps.googleusercontent.com";

  if (window.console && console.log) console.log('[Blaxx] API:', window.BLAXX_API);
})();
