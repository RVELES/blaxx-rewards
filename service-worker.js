/* ==========================================================================
 * Blaxx Pontos — Service Worker (PWA)
 *
 * Estrategia:
 *   - HTML/CSS/JS estaticos: cache-first com revalidacao em background.
 *   - Chamadas a /auth, /wallet, /pix, /transfer, /redeem, /health: SEMPRE rede
 *     (nunca cacheia dados de saldo).
 *   - Sem internet + recurso nao cacheado: pagina offline elegante.
 * ========================================================================== */
const CACHE = 'blaxx-v1';
const PRECACHE = [
  '/site/',
  '/site/login.html',
  '/site/dashboard.html',
  '/site/carteira.html',
  '/site/extrato.html',
  '/site/comprar-pontos.html',
  '/site/pagamento-pix.html',
  '/site/compra-aprovada.html',
  '/site/enviar-pontos.html',
  '/site/confirmar-envio.html',
  '/site/envio-concluido.html',
  '/site/resgate-pix.html',
  '/site/app.html',
  '/site/assets/styles.css',
  '/site/assets/blaxx-app.js',
  '/site/assets/icons/icon.svg',
  '/site/assets/icons/icon-192.png',
  '/site/assets/icons/icon-512.png',
  '/site/manifest.json',
];

const API_PREFIXES = ['/auth', '/wallet', '/pix', '/transfer', '/redeem', '/health'];

self.addEventListener('install', (ev) => {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(PRECACHE.map((u) => c.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApi(pathname) {
  return API_PREFIXES.some((p) => pathname.startsWith(p));
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (url.origin !== location.origin) return;             // so mesma origem
  if (ev.request.method !== 'GET') return;                // POST/PUT vai direto

  // API: rede sempre, nunca cache
  if (isApi(url.pathname)) {
    ev.respondWith(fetch(ev.request).catch(() =>
      new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      })
    ));
    return;
  }

  // Estatico: cache-first com revalidacao
  ev.respondWith(
    caches.match(ev.request).then((cached) => {
      const networkPromise = fetch(ev.request).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copy));
        }
        return resp;
      }).catch(() => cached || offlinePage());
      return cached || networkPromise;
    })
  );
});

function offlinePage() {
  return new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Sem conexao | Blaxx</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;font-family:Inter,system-ui,sans-serif;background:#080907;color:#fff;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px;}
.card{background:#151515;padding:32px;border-radius:24px;max-width:360px;}
h1{color:#C6F432;margin:0 0 12px;}
p{color:#8a918a;line-height:1.6;}
button{background:#C6F432;color:#080907;border:0;padding:12px 24px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer;margin-top:16px;}
</style></head>
<body><div class="card">
<h1>Sem internet</h1>
<p>Voce esta offline. Reconecte e tente de novo.</p>
<button onclick="location.reload()">Tentar de novo</button>
</div></body></html>`, {
    status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ----- Push notifications (Web Push API) -----
self.addEventListener('push', (ev) => {
  let data = { title: 'Blaxx Pontos', body: 'Voce tem uma novidade.' };
  if (ev.data) {
    try { data = ev.data.json(); } catch (e) { data.body = ev.data.text(); }
  }
  ev.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/site/assets/icons/icon-192.png',
      badge: '/site/assets/icons/icon-192.png',
      data: { url: data.url || '/site/dashboard.html' },
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = (ev.notification.data && ev.notification.data.url) || '/site/dashboard.html';
  ev.waitUntil(clients.openWindow(url));
});
