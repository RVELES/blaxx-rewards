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
    var port = location.port;
    if (!port || port === '5000') {
      window.BLAXX_API = location.origin;
    } else {
      window.BLAXX_API = location.protocol + '//' + location.hostname + ':5000';
    }
  } else {
    // Modo produção — migrado do Fly.io pra Render.com em 2026-05-27.
    // Render builda nativo Python na cloud deles (sem Docker), o que evita
    // o problema crônico de DNS no buildkit local em ambientes WSL2.
    // Backend antigo no Fly continua rodando paralelo até cutover completo.
    window.BLAXX_API = "https://blaxx-pontos-backend.onrender.com";
  }

  // ---------------- Google OAuth ----------------
  // Client ID Web do projeto "BlaXx" no Google Cloud Console.
  // Esse valor é PÚBLICO por design — pode aparecer no JS do browser sem risco
  // (a segurança vem da validação do ID token no backend, não do Client ID).
  window.BLAXX_GOOGLE_CLIENT_ID = "105341431878-tj5vi2is40n8gbugugj9bgvi2b67v0el.apps.googleusercontent.com";

  if (window.console && console.log) console.log('[Blaxx] API:', window.BLAXX_API);
})();
