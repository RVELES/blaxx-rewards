/* Configuração do front Blaxx Pontos.
 *
 * Lógica:
 *  - Em localhost / 127.0.0.1 / IP da LAN → usa location.origin (Flask local)
 *  - Em produção (netlify.app, blaxxpontos.com) → usa Fly.io
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
    // Modo produção (Netlify) — edite a URL do seu backend Fly.io aqui
    window.BLAXX_API = "https://blaxx-pontos-backend.fly.dev";
  }

  // ---------------- Google OAuth ----------------
  // Client ID Web do projeto "Blaxx Pontos" no Google Cloud Console.
  // Esse valor é PÚBLICO por design — pode aparecer no JS do browser sem risco
  // (a segurança vem da validação do ID token no backend, não do Client ID).
  window.BLAXX_GOOGLE_CLIENT_ID = "105341431878-tj5vi2is40n8gbugugj9bgvi2b67v0el.apps.googleusercontent.com";

  if (window.console && console.log) console.log('[Blaxx] API:', window.BLAXX_API);
})();
