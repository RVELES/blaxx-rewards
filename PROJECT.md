# Blaxx Rewards — Visão do Projeto

> Programa de fidelidade **Blaxx Pontos**: compra de pontos via PIX, carteira,
> resgates (Pix, milhas, hotéis, salas VIP), parceiros, cartão/tiers e envio
> P2P. Este repositório (`RVELES/blaxx-rewards`) abriga o **frontend estático**
> publicado em `https://blaxxpontos.com.br` e o backend de referência da Fase 1
> (autenticação). O backend de produção mora em outro repo.

Última atualização: 2026-06-26

---

## 1. Topologia

```
┌─────────────────────────────┐        HTTPS         ┌──────────────────────────────┐
│ Frontend (este repo)        │ ───────────────────▶ │ Backend de produção           │
│ HTML/CSS/Vanilla JS         │   window.BLAXX_API   │ blaxx-pontos-exe.onrender.com │
│ Netlify · blaxxpontos.com.br│ ◀─────────────────── │ (repo RVELES/blaxx-pontos-exe)│
└─────────────────────────────┘        JSON          └──────────────────────────────┘
```

| Repo | Conteúdo | Papel |
|---|---|---|
| **`RVELES/blaxx-rewards`** (este) | Frontend estático + `backend/` (auth, referência) | Site público |
| `RVELES/blaxx-pontos-exe` | Backend Flask (Python) | **Backend de produção (canônico)** |
| `RVELES/blaxx-pontos-backend` | Backend Flask (privado) | Deploy antigo/desligado |
| `RVELES/blaxx-pontos-app` | App TypeScript | Mobile |
| `RVELES/blaxx_app` | App Swift | Mobile (iOS) |

| Camada | Onde | Observação |
|---|---|---|
| Frontend | Netlify — projeto `blaxxpontos-old` | `https://blaxxpontos.com.br` |
| Backend prod | Render — `https://blaxx-pontos-exe.onrender.com` | `/healthz` → 200 |
| Backend antigo | `https://blaxx-pontos-backend.onrender.com` | Desligado |

Detalhes completos em [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 2. Stack

- **Frontend:** HTML/CSS/Vanilla JS puros, sem build step. Fontes via Google
  Fonts, ícones inline SVG, globo interativo com `d3` + `topojson` (vendorizados
  em `vendor/`).
- **Backend (este repo, Fase 1):** Flask + SQLite (referência de autenticação).
- **Backend de produção:** Flask em Render (`blaxx-pontos-exe`) — carteira,
  PIX, resgates, parceiros, cartão/tiers.
- **Mobile:** TypeScript (`blaxx-pontos-app`) e Swift (`blaxx_app`).
- **Hospedagem do site:** Netlify, com `netlify.toml` controlando headers,
  cache e rewrites de URLs amigáveis.

---

## 3. Estrutura do repositório

```
blaxx-rewards/
├── index.html                  # Command Center (dashboard logado)
├── blaxx-neon.html             # Landing pública (servida em /)
├── login.html, cadastro.html   # Auth UI
├── dashboard.html, carteira.html, extrato.html
├── parceiros.html, resgates.html, campanhas.html, cartao.html
├── comprar*.html, enviar*.html, resgate-*.html, pagamento-*.html
├── perfil.html, admin.html, ajuda.html, faq.html
├── 404.html, manutencao.html
├── styles.css                  # Design system global
├── chrome.js                   # Header/nav compartilhado
├── service-worker.js, manifest.json
├── netlify.toml                # Headers + redirects (URLs bonitas)
├── _headers                    # Headers complementares
├── robots.txt, sitemap.xml
├── assets/
│   ├── blaxx-config.js         # Fonte única do window.BLAXX_API
│   ├── blaxx-app.js            # SDK do frontend
│   ├── admin.js, comprar-livre.js, cookie-banner.js, totp-ui.js
│   ├── styles.css, fonts/, icons/
│   └── logos/, favicons, pix-qr-blaxx.png
├── vendor/                     # d3.min.js, topojson-client.min.js, countries-110m.json
├── app/                        # Protótipos React/JSX do app mobile
│   ├── App Blaxx.html
│   ├── app-kit.jsx, app-screens-a.jsx, app-screens-b.jsx
│   └── design-canvas.jsx, ios-frame.jsx
├── backend/                    # Backend Flask de referência (Fase 1, auth)
│   ├── app/, run.py, requirements.txt
│   ├── pytest.ini, tests/
│   └── README.md
├── docs/                       # Conteúdo interno (NÃO servido publicamente)
│   ├── marketplace-pontos-prd.md
│   ├── pitch-deck-outline.md
│   ├── sorteio-regulamento-rascunho.md
│   └── instagram-*.md
├── blaxx-globe/                # Assets do globo interativo
├── Resultado Site/             # Snapshots/exports
├── ARCHITECTURE.md             # Topologia detalhada
├── DEPLOY.md                   # Guia Fly.io + Netlify
├── lighthouserc.json
└── deploy.sh
```

São 80 páginas `.html` ao todo cobrindo: dashboard, carteira, extrato, compra
de pontos, envio P2P, resgates, parceiros, campanhas, cartão/tiers, perfil,
admin, central de ajuda, FAQ, termos, privacidade e fluxos de erro.

---

## 4. Frontend — landing pública

A raiz `/` do site é **reescrita** para `blaxx-neon.html` (não para `index.html`):

```toml
[[redirects]]
  from = "/"
  to = "/blaxx-neon.html"
  status = 200
  force = true
```

`blaxx-neon.html` é a landing neon (preto + verde `#59FD27`) com:

- Hero "COMPRE. GANHE. TROQUE. ENVIE."
- Stats: 350+ salas VIP, 60 países, 12s Pix, sem taxas.
- Marquee de parceiros (Smiles, LATAM Pass, Azul, Accor ALL, Marriott,
  Priority Pass, Livelo, Esfera, Itaú, Nubank).
- Globo interativo (d3 ortográfico + topojson) com nós dos parceiros.
- Seções "Como funciona", "Resgates", banda "+120% bônus", FAQ e CTA final.

`index.html` é o **Command Center** (dashboard logado) — patrimônio em pontos,
níveis Blaxx, parceiros, campanhas, últimas movimentações, score ilustrativo e
exchange showcase. Consome `/wallet/`, `/card/`, `/partners/`, `/campaigns/`,
`/wallet/transactions` do backend de produção, com fallback de dados demo
quando não há sessão.

---

## 5. URLs bonitas (Netlify rewrites)

Configuradas em `netlify.toml`. Rewrites status 200 mantêm a URL na barra:

| URL pública | Página servida |
|---|---|
| `/` | `blaxx-neon.html` |
| `/login` | `login.html` |
| `/cadastro` | `cadastro.html` |
| `/dashboard` | `dashboard.html` |
| `/carteira` | `carteira.html` |
| `/extrato` | `extrato.html` |
| `/parceiros` | `parceiros.html` |
| `/resgates` | `resgates.html` |
| `/comprar-pontos` | `comprar-pontos.html` |
| `/vender-pontos` | `vender-pontos.html` |
| `/como-funciona` | `como-funciona.html` |
| `/faq` | `faq.html` |
| `/regras-pontos` | `regras-pontos.html` |
| `/politica-reembolso` | `politica-reembolso.html` |
| `/sitemap` | `sitemap.html` |
| `/central-ajuda` | `central-ajuda.html` |

Aliases 301 (SEO/legados): `/entrar`, `/painel`, `/privacidade`,
`/politica-privacidade`, `/mapa-do-site`, `/central-de-ajuda`, `/ajuda`,
`/perguntas-frequentes`, `/regras`, `/reembolso`, `/cancelamento`,
`/lander`, `/lander/*`, `/index.html → /`.

`/docs/*` e qualquer outra rota não mapeada caem em `404.html`.

---

## 6. Resolução da URL da API

Toda a configuração de qual backend usar mora em **`assets/blaxx-config.js`**,
que define `window.BLAXX_API`:

- **Produção** (`blaxxpontos.com.br`, `*.netlify.app`) →
  `https://blaxx-pontos-exe.onrender.com`
- **Dev local** (`localhost`/`127.0.0.1`/IP LAN) → Flask local (`:5000`).
- **Override manual** → `localStorage('blaxx_api_url')` tem precedência.

A CSP em `netlify.toml` / `_headers` só libera `connect-src` para
`blaxx-pontos-exe.onrender.com` — manter sincronizado ao trocar de backend.

---

## 7. Headers, cache e segurança (`netlify.toml`)

- Imagens em `/assets/*.{png,jpg,svg,webp}` → `max-age=86400`.
- JS/CSS em `/assets/*.{js,css}` → `no-cache, must-revalidate` (ETag).
- `/*.html` → `max-age=300, must-revalidate`.
- `service-worker.js` → `max-age=0`.
- `manifest.json` → `max-age=3600`.
- Globais: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 8. Backend de referência (`backend/`)

Flask + SQLite cobrindo a **Fase 1** (autenticação):

- Cadastro, login, confirmação de email.
- Recuperação/redefinição de senha.
- Perfil e gestão de sessões.

**Fase 2 (planejada):** Google OAuth com validação real de ID token,
JWT + refresh token rotation, vinculação de contas, 2FA.

Setup local: Python 3.11+ (testado em 3.13). Detalhes em
[`backend/README.md`](backend/README.md).

> Este backend **não** é o que roda em produção. Carteira, PIX, resgates,
> parceiros e cartão vivem em `RVELES/blaxx-pontos-exe`.

---

## 9. Deploy

- **Frontend:** push para `main` → Netlify publica. Preview de PR sai em
  `deploy-preview-N--blaxxpontos-old.netlify.app`.
- **Backend de produção:** Render (`blaxx-pontos-exe`).
- **Backend de auth (Fase 1):** instruções para Fly.io em
  [`DEPLOY.md`](DEPLOY.md) (~30 min, free tier).
- Script auxiliar local: `deploy.sh`.

---

## 10. Documentação interna (`docs/`)

Conteúdo de estratégia, copy e PRD — versionado, **mas não servido pelo site**
(`/docs/*` retorna 404 via `netlify.toml`):

- `marketplace-pontos-prd.md`
- `pitch-deck-outline.md`
- `sorteio-regulamento-rascunho.md`
- `instagram-ads-copy.md`, `instagram-conteudo-lote-2.md`,
  `instagram-deck-outline.md`, `instagram-growth-blaxx-pontos.md`,
  `instagram-post-boas-vindas.md`, `instagram-roteiro-video-lancamento.md`,
  `instagram-stories-copy.md`.

---

## 11. Branding

- **Cor neon:** `#59FD27` (verde) sobre fundo `#0a0a0a`.
- **Tipografia:** Space Grotesk (display), Sora (texto), JetBrains Mono
  (monoespaçada).
- **Logo:** símbolo "B" estilizado + wordmark "BlaXx Rewards" (SVG inline na
  landing; arquivos em `assets/`).
- **Tagline:** "Pontos que viram o mundo".

---

## 12. Referências

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — topologia, contrato de API, histórico.
- [`DEPLOY.md`](DEPLOY.md) — guia passo a passo de deploy.
- [`backend/README.md`](backend/README.md) — backend Fase 1.
- `lighthouserc.json` — orçamento de performance.
- `netlify.toml`, `_headers` — configuração do site.
