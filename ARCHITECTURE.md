# Arquitetura — Blaxx Pontos

> Documento de topologia do sistema. Objetivo: deixar explícito **onde cada
> parte vive**, qual backend é o canônico e como o frontend resolve a URL da
> API — eliminando a confusão histórica entre os múltiplos backends.
>
> Última verificação: 2026-06-24 (endpoints sondados ao vivo).

---

## 1. Visão geral

O Blaxx Pontos hoje é um **programa de fidelidade** (compra de pontos via PIX,
carteira, resgates, parceiros, cartão/tiers). O frontend é estático e conversa
com um backend Flask hospedado no Render.

```
┌─────────────────────────────┐        HTTPS         ┌──────────────────────────────┐
│ Frontend (este repo)        │ ───────────────────▶ │ Backend de produção           │
│ HTML/CSS/Vanilla JS         │   window.BLAXX_API   │ blaxx-pontos-exe.onrender.com │
│ Netlify · blaxxpontos.com.br│ ◀─────────────────── │ (repo RVELES/blaxx-pontos-exe)│
└─────────────────────────────┘        JSON          └──────────────────────────────┘
```

---

## 2. Repositórios

| Repo | Conteúdo | Papel |
|---|---|---|
| **`RVELES/blaxx-rewards`** (este) | Frontend estático + `backend/` (auth Fase-1, **referência**) | Site público |
| **`RVELES/blaxx-pontos-exe`** | Backend Flask (Python) | **Backend de produção (canônico)** |
| `RVELES/blaxx-pontos-backend` | Backend Flask (privado) | Deploy **antigo/desligado** (host `-backend`) |
| `RVELES/blaxx-pontos-app` | App (TypeScript) | Mobile |
| `RVELES/blaxx_app` | App (Swift) | Mobile (iOS) |

> ⚠️ **O `backend/` deste repositório é apenas a Fase 1 (autenticação) e NÃO é o
> código que roda em produção.** O backend ativo (carteira, PIX, resgates,
> parceiros, cartão) está em `RVELES/blaxx-pontos-exe`. Ver `backend/README.md`.

---

## 3. Hospedagem

| Camada | Onde | Observação |
|---|---|---|
| Frontend | Netlify — projeto `blaxxpontos-old` | Domínio canônico: **`https://blaxxpontos.com.br`** |
| Backend prod | Render — `https://blaxx-pontos-exe.onrender.com` | `/healthz` → 200 |
| Backend antigo | `https://blaxx-pontos-backend.onrender.com` | **Desligado** (timeout; fora da CSP) |

O deploy preview de PRs sai em `deploy-preview-N--blaxxpontos-old.netlify.app`.

---

## 4. Resolução da URL da API (fonte única)

Toda a configuração de qual backend usar mora em **`assets/blaxx-config.js`**,
que define `window.BLAXX_API`:

- **Produção** (`blaxxpontos.com.br`, `*.netlify.app`) → `https://blaxx-pontos-exe.onrender.com`
- **Dev local** (`localhost`/`127.0.0.1`/IP de LAN) → Flask local (`:5000` ou `location.origin`)
- **Override manual** → `localStorage('blaxx_api_url')` tem precedência (útil para testes)

`assets/blaxx-app.js` lê `window.BLAXX_API`; as páginas standalone que ainda
têm um literal `-exe` o usam **apenas como fallback** (`window.BLAXX_API || '…'`).

> Histórico: até o PR #2, `blaxx-config.js` apontava para o host morto
> `blaxx-pontos-backend.onrender.com`, enquanto 10 páginas hardcodavam o host
> vivo `-exe`. Isso foi reconciliado para uma fonte única (`-exe`).

A CSP (`netlify.toml` / `_headers`) só libera `connect-src` para
`blaxx-pontos-exe.onrender.com` — manter sincronizado ao trocar de backend.

---

## 5. Contrato da API (endpoints consumidos pelo frontend)

> Verificado ao vivo contra `blaxx-pontos-exe.onrender.com` em 2026-06-24.
> Endpoints com `/` final fazem redirect 308 se chamados sem a barra.

### Saúde
- `GET /healthz` → status do serviço

### Autenticação (`/auth/*`)
- `POST /auth/register`, `POST /auth/login`, `POST /auth/login/2fa`
- `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`
- `POST /auth/google`
- `POST /auth/verify-email`, `POST /auth/verify-email/send`, `POST /auth/resend-verification`
- `POST /auth/forgot-password`, `POST /auth/reset-password`

### Usuário (`/user/*`)
- `GET/PUT /user/profile`, `PUT /user/password`
- `POST /user/phone`, `POST /user/phone/verify`
- `POST /user/2fa/sms/enable`, `POST /user/2fa/sms/disable`
- `GET /user/sessions`, `DELETE /user/sessions/:id`, `GET /user/access-log`

### Carteira & transações
- `GET /wallet/` → saldo
- `GET /wallet/transactions?limit=N`

### PIX (compra de pontos)
- `GET /pix/packages` → pacotes (ex.: `start`, `plus`, `prime`, `black`)
- `GET /pix/provider` → `{is_mock, name}` (produção: `mercadopago`)
- `POST /pix/charge`, `GET /pix/charge/:id`
- `POST /pix/simulate-payment` (ambiente de teste)

### Catálogo & operações
- `GET /benefits/`, `GET /partners/`, `GET /campaigns/`
- `GET /card/`, `GET /card/pass` (tiers: bronze/prata/ouro/black/VIP)
- `GET /notifications/`
- `/redeem/`, `/transfer/`

> Os schemas internos (modelos `Wallet`, `Transaction`, `PixCharge`,
> `PixPayout`, `Transfer`) podem ser consultados como **referência histórica**
> em `.archive-backend-antigo/app/models.py` — atenção: é o backend Onda 0
> (pré-refactor de auth), pode divergir do `-exe` atual.

---

## 6. Pendência conhecida

- **Sync do backend de produção:** o código de `blaxx-pontos-exe` ainda não está
  acessível a partir deste repositório/sessão. Decisão em aberto: manter os
  repos separados (com deploy independente) ou integrar (submodule/monorepo).
- **`backend/` local desatualizado:** cobre só auth Fase-1; não reflete os
  endpoints de carteira/PIX/resgate de produção.
