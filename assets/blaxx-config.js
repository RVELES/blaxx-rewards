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
    // Modo dev: mesma origem do Flask (sem CORS issue)
    window.BLAXX_API = location.origin;
  } else {
    // Modo produção (Netlify) — edite a URL do seu backend Fly.io aqui
    window.BLAXX_API = "https://blaxx-pontos-backend.fly.dev";
  }

  if (window.console && console.log) console.log('[Blaxx] API:', window.BLAXX_API);
})();
