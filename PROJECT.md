# Blaxx Pontos — Visão Geral do Projeto

> Documento-índice do sistema Blaxx Pontos: o que existe, onde vive, como se
> conecta e o estado atual de cada frente. Consolida o conhecimento espalhado
> em `ARCHITECTURE.md` (topologia/API) e `DEPLOY.md` (infra) + decisões e
> mudanças recentes.
>
> **Última verificação: 2026-06-25** — estado de hospedagem/domínio confirmado
> ao vivo via Netlify API nesta data.

---

## 0. TL;DR (estado atual)

- **Domínio de produção `https://blaxxpontos.com.br` serve hoje o SPA React**
  (`RVELES/blaxx-pontos-app`), no projeto Netlify **`blaxx-pontos-app`**.
  ✅ Verificado via Netlify API (`primarySiteUrl`) em 2026-06-25.
- **Existe um segundo frontend, estático** (`RVELES/blaxx-rewards`, este repo),
  publicado em **`blaxxpontos-old.netlify.app`** — 80 páginas HTML/CSS/JS puro.
  A home dele agora é a **landing neon** (`blaxx-neon.html`), via rewrite no
  `netlify.toml` (PR #6, merged).
- **Backend de produção (canônico):** Flask em
  **`https://blaxx-pontos-exe.onrender.com`** (`RVELES/blaxx-pontos-exe`).
- **Verde de marca:** lime `#7CFF00` (design system). O piloto neon usa um verde
  mais elétrico `#39FF14`.

> ⚠️ **Divergência com `ARCHITECTURE.md` (24/06):** aquele doc lista
> `blaxx-pontos-app` como "Mobile" e diz que o domínio aponta para o site
> estático (`blaxxpontos-old`). Pela checagem de 25/06, o domínio está no **SPA
> web** `blaxx-pontos-app`. Este documento reflete o estado verificado mais
> recente; `ARCHITECTURE.md` precisa de correção nessa linha.

---

## 1. Topologia atual

```
                         blaxxpontos.com.br (apex + www)
                                    │
                                    ▼
              ┌──────────────────────────────────────────┐   HTTPS    ┌───────────────────────────────┐
              │ SPA de produção  ·  Netlify "blaxx-pontos-app"         │ Backend de produção           │
              │ React + Vite + Tailwind (TypeScript)        │ ───────▶ │ blaxx-pontos-exe.onrender.com │
              │ repo RVELES/blaxx-pontos-app                │ ◀─────── │ Flask · /healthz 200          │
              └──────────────────────────────────────────┘   JSON     └───────────────────────────────┘

   ┌──────────────────────────────────────────┐
   │ Site estático  ·  Netlify "blaxxpontos-old"│  ← blaxxpontos-old.netlify.app (NÃO é mais o domínio)
   │ HTML/CSS/JS puro · repo RVELES/blaxx-rewards│     home = blaxx-neon.html (landing neon)
   └──────────────────────────────────────────┘
```

---

## 2. Repositórios

| Repo | Stack | Papel | Hospedagem |
|---|---|---|---|
| **`RVELES/blaxx-pontos-app`** | React 18 + Vite + Tailwind + TS (react-router, framer-motion, zustand, chart.js) | **Frontend web de produção (SPA)** | Netlify `blaxx-pontos-app` → `blaxxpontos.com.br` |
| **`RVELES/blaxx-rewards`** (este) | HTML/CSS/Vanilla JS estático (80 páginas) + `backend/` (auth Fase-1, referência) | Site estático / landing neon | Netlify `blaxxpontos-old` → `blaxxpontos-old.netlify.app` |
| **`RVELES/blaxx-pontos-exe`** | Flask (Python) | **Backend de produção (canônico)** | Render → `blaxx-pontos-exe.onrender.com` |
| `RVELES/blaxx-pontos-backend` | Flask (privado) | Deploy **antigo/desligado** (host `-backend`) | — |
| `RVELES/blaxx_app` | Swift | App iOS | — |

> O `backend/` deste repo é só a **Fase 1 (autenticação)**, material de
> referência — **não** é o que roda em produção (esse é o `-exe`).

---

## 3. Hospedagem, domínio e CSP

| Camada | Onde | Observação |
|---|---|---|
| Frontend (domínio) | Netlify `blaxx-pontos-app` | Serve **`https://blaxxpontos.com.br`** (apex + www) |
| Frontend (estático) | Netlify `blaxxpontos-old` | `blaxxpontos-old.netlify.app`; home = neon |
| Backend prod | Render `blaxx-pontos-exe.onrender.com` | `/healthz` → 200 |
| Backend antigo | `blaxx-pontos-backend.onrender.com` | **Desligado** (fora da CSP) |

- `www` → non-www: canônico é **sem www**.
- Deploy preview de PRs do estático: `deploy-preview-N--blaxxpontos-old.netlify.app`.
- **CSP** (`netlify.toml`/`_headers`): `connect-src` libera só
  `blaxx-pontos-exe.onrender.com`. Ao trocar de backend, sincronizar aqui.

---

## 4. Os dois frontends e suas homes

### 4.1 SPA `blaxx-pontos-app` (o que está no domínio)
- Rotas em `src/router.tsx` (40+ páginas: auth, carteira, PIX, resgates,
  parceiros, cartão, admin, etc.).
- **Home (`/`)** = `src/pages/Home.tsx`, que monta uma landing nativa:
  injeta `src/home/blaxx-home.shell.html` (markup) + `src/home/blaxx-home.css`
  e carrega o **engine do globo** `public/blaxx-home.js`, com
  **d3/topojson/world-atlas vendorizados** em `public/vendor/` (zero CDN).
- A home **já é** dark + globo D3 + verde de marca `#7CFF00` (`var(--accent)`,
  definido em `blaxx-home.js:10` → `CONFIG.accent`).
- Tokens Tailwind (`tailwind.config.js`): `black #0A0A0A`, `lime #7CFF00`;
  fontes Inter/Playfair/JetBrains Mono.

### 4.2 Estático `blaxx-rewards` (este repo)
- 80 páginas HTML retematizadas (dark). **Home = `blaxx-neon.html`**
  (preto + neon `#39FF14` + globo D3 + logo oficial), via rewrite:
  ```toml
  # netlify.toml
  [[redirects]]  from = "/"           to = "/blaxx-neon.html"  status = 200  force = true
  [[redirects]]  from = "/index.html" to = "/"                 status = 301  force = true
  ```
  > `force = true` é obrigatório: sem ele o Netlify **ignora** o rewrite de `/`
  > porque `index.html` é um arquivo real (shadowing).
- Componente de globo reutilizável em `blaxx-globe/`.

---

## 5. Trabalho "neon" — estado

| Frente | Onde | Status |
|---|---|---|
| Landing neon (estático) | `blaxx-neon.html` + `netlify.toml` | ✅ **No ar** em `blaxxpontos-old.netlify.app/` (PR #6 merged) |
| Retheme neon do SPA | patch p/ `blaxx-pontos-app` | 🟡 **Pronto, não aplicado** (entregue como `.patch` + tarball; precisa de acesso de escrita ao repo do SPA) |

### Patch neon do SPA (resumo)
Troca de hue **lime → neon** + glows + preto mais profundo, em 3 arquivos:
- `public/blaxx-home.js`: `CONFIG.accent '#7CFF00' → '#39FF14'` (re-tinge tudo
  via `var(--accent)`) + anel/atmosfera do globo em neon.
- `src/home/blaxx-home.css`: fundo `#050506`, radial glow neon, seleção.
- `src/home/blaxx-home.shell.html`: sombras dos CTAs, borda do simulador,
  range slider e gradiente do CTA band em neon.

Validado com `git apply --check` (OK) e renderizado via Chromium headless.
Aplicação: `git apply blaxx-neon-home.patch` no repo do SPA, ou descompactar o
tarball drop-in (`src/home/...`, `public/...`).

---

## 6. Backend e contrato de API (referência)

Configuração de qual backend usar: **`assets/blaxx-config.js`** define
`window.BLAXX_API`:
- Produção (`blaxxpontos.com.br`, `*.netlify.app`) → `https://blaxx-pontos-exe.onrender.com`
- Dev local (`localhost`/`127.0.0.1`/LAN) → Flask local (`:5000`)
- Override: `localStorage('blaxx_api_url')` tem precedência.

Endpoints consumidos (auth, user, wallet, pix, benefits/partners/campaigns,
card, notifications, redeem, transfer) estão detalhados em
**`ARCHITECTURE.md` §5** (verificados ao vivo em 24/06). Infra/deploy passo a
passo em **`DEPLOY.md`**.

---

## 7. Mapa de arquivos-chave

**Estático (`blaxx-rewards`, este repo)**
```
blaxx-neon.html            # landing neon (home via rewrite)
blaxx-globe/               # componente de globo reutilizável
netlify.toml               # rewrites (home neon), headers, CSP, aliases de rota
_headers                   # headers/CSP adicionais
assets/blaxx-config.js     # fonte única da URL da API (window.BLAXX_API)
assets/blaxx-app.js        # app/runtime das páginas estáticas
ARCHITECTURE.md            # topologia + contrato de API
DEPLOY.md                  # infra (backend + Netlify) passo a passo
PROJECT.md                 # (este) índice geral
```

**SPA (`blaxx-pontos-app`)**
```
src/router.tsx                  # rotas (40+ páginas)
src/pages/Home.tsx              # home: injeta shell+css, carrega engine do globo
src/home/blaxx-home.shell.html  # markup da landing
src/home/blaxx-home.css         # estilos da landing
public/blaxx-home.js            # engine (CONFIG.accent, globo d3)  ← cor de marca
public/vendor/                  # d3 / topojson / countries-110m.json (sem CDN)
tailwind.config.js              # tokens (#0A0A0A, #7CFF00)
src/lib/api-client.ts           # cliente da API
```

---

## 8. Decisões em aberto

1. **Domínio: SPA vs estático.** Hoje `blaxxpontos.com.br` = SPA. Se a intenção
   for usar o estático neon no domínio, é preciso **repointar** o domínio no
   Netlify do site `blaxx-pontos-app` para o `blaxxpontos-old` (ação manual no
   painel). Alternativa: manter o SPA e aplicar o **patch neon** nele.
2. **Rollout do neon no SPA.** Patch pronto; falta acesso de escrita ao repo
   `blaxx-pontos-app` (esta sessão tem escopo só de `blaxx-rewards`).
3. **Sync do backend de produção** (`-exe`) e **`backend/` local desatualizado**
   — ver `ARCHITECTURE.md` §6.
4. **Corrigir `ARCHITECTURE.md`** (linha do `blaxx-pontos-app` e §3 de
   hospedagem) para refletir que o SPA web é quem serve o domínio.

---

## 9. Histórico recente relevante

- **PR #2:** reconciliação da URL da API (fonte única `-exe`; correção do host
  morto `-backend`); retheme dark das páginas estáticas; `blaxx-neon.html`.
- **PR #6 (merged):** `blaxx-neon.html` vira a home do site estático
  (`netlify.toml` rewrite com `force = true`).
- **Patch neon do SPA:** preparado e entregue (não aplicado — sem acesso de
  escrita ao repo do SPA nesta sessão).
