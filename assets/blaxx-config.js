/* Configuracao do front Blaxx Pontos.
 *
 * Em desenvolvimento (servidor Flask servindo /site/) usa origem propria.
 * No Netlify (frontend separado) APONTE PARA O FLY.IO:
 *
 *   window.BLAXX_API = "https://blaxx-pontos-backend.fly.dev";
 *
 * O blaxx-app.js le esta variavel global. Se nao definida, cai em
 * location.origin (modo dev).
 */
(function () {
  // ============================================================
  // EDITE AQUI A URL DO SEU BACKEND FLY.IO APOS O DEPLOY:
  // ============================================================
  // window.BLAXX_API = "https://blaxx-pontos-backend.fly.dev";

  // Auto-detect: se estamos em netlify.app/.com, exige backend remoto
  if (!window.BLAXX_API) {
    var host = location.hostname;
    if (host.indexOf("netlify.app") >= 0 || host.indexOf(".com") >= 0) {
      console.warn(
        "[Blaxx] window.BLAXX_API nao foi definida em assets/blaxx-config.js. " +
        "Aponte para a URL do seu backend Fly.io."
      );
    }
  }
})();
