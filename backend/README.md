# Blaxx Pontos — Backend (Fase 1)

> ⚠️ **Este NÃO é o backend de produção.** É a referência da Fase 1 (auth).
> O backend que roda em produção (carteira, PIX, resgates, parceiros, cartão)
> está no repo **`RVELES/blaxx-pontos-exe`**, servido em
> `https://blaxx-pontos-exe.onrender.com`. Ver `../ARCHITECTURE.md`.

Backend Flask que serve a API de autenticação e perfil de usuário do Blaxx Pontos.

**Estado atual (Fase 1):** fluxos de cadastro, login, confirmação de email,
recuperação/redefinição de senha, perfil e gestão de sessões.
**Fase 2 (planejada):** Google OAuth com validação real do ID token,
JWT + refresh token rotation, vinculação de contas, 2FA.

---

## Setup local

### 1. Pré-requisitos
- Python 3.11+ (testado em 3.13)
- pip

### 2. Criar venv e instalar deps

Importante: **não** crie o venv dentro de uma pasta sincronizada por Dropbox/OneDrive —
o sync interfere na instalação. Use `%LOCALAPPDATA%` no Windows ou `~/.venvs` no Linux.

```powershell
# Windows
python -m venv "$env:LOCALAPPDATA\blaxx-backend\venv"
& "$env:LOCALAPPDATA\blaxx-backend\venv\Scripts\python.exe" -m pip install -r requirements.txt
```

```bash
# Linux/macOS
python -m venv ~/.venvs/blaxx-backend
~/.venvs/blaxx-backend/bin/pip install -r requirements.txt
```

### 3. Configurar `.env`

Copie `.env.example` para `.env` e ajuste. Em dev, os defaults funcionam.

```bash
cp .env.example .env
```

### 4. Rodar o servidor

```powershell
# Windows (powershell)
& "$env:LOCALAPPDATA\blaxx-backend\venv\Scripts\python.exe" run.py
```

```bash
# Linux/macOS
python run.py
```

Por default escuta em `http://localhost:5000`. Em dev, o Flask também serve
os HTMLs estáticos da pasta `blaxx/` (configurável via `FRONTEND_DIR`), então
você pode abrir `http://localhost:5000/login.html` sem precisar de um segundo
servidor.

### 5. Rodar os testes

```bash
python -m pytest -v
```

---

## Endpoints

Todas as rotas começam com `/auth/*` ou `/user/*`. Respostas são JSON.

### Públicas (não exigem autenticação)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/register` | Cria conta (status `pending_verification`) + envia email |
| `POST` | `/auth/login` | Login email+senha, retorna `token` opaco |
| `POST` | `/auth/verify-email` | Valida token de confirmação de email |
| `POST` | `/auth/resend-verification` | Reenvia link de confirmação (cooldown 60s) |
| `POST` | `/auth/forgot-password` | Solicita reset (sempre genérico) |
| `POST` | `/auth/reset-password` | Redefine senha via token |
| `GET`  | `/health` | Health check |

### Autenticadas (Bearer token no header)

| Método | Rota | Descrição |
|---|---|---|
| `GET`    | `/auth/me` | Retorna usuário logado |
| `POST`   | `/auth/logout` | Revoga sessão atual |
| `POST`   | `/auth/logout-all` | Revoga todas as sessões |
| `PATCH`  | `/user/profile` | Atualiza nome, avatar, opt-in |
| `PATCH`  | `/user/password` | Troca senha (exige senha atual) |
| `PATCH`  | `/user/email` | Inicia troca de email (exige senha) |
| `GET`    | `/user/sessions` | Lista sessões ativas |
| `DELETE` | `/user/sessions/<id>` | Encerra sessão específica |

### Formato dos erros

Todas as respostas de erro seguem este formato:

```json
{ "error": "Mensagem legível", "code": "machine_readable_code" }
```

Códigos comuns: `invalid_email`, `weak_password`, `password_mismatch`,
`terms_not_accepted`, `invalid_name`, `email_exists`, `invalid_credentials`,
`email_not_verified`, `account_inactive`, `invalid_token`, `token_used`,
`token_expired`, `wrong_password`, `same_password`, `same_email`,
`rate_limited`, `unauthorized`, `invalid_session`.

---

## Variáveis de ambiente

Documentadas em [.env.example](.env.example). Resumo:

| Variável | Default | Notas |
|---|---|---|
| `SECRET_KEY` | dev fallback | **Obrigatório em produção**. Use `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `APP_URL` | `http://localhost:8000` | Base usada nos links de email. |
| `DATABASE_URL` | `sqlite:///instance/blaxx.db` | SQLite por arquivo. |
| `CORS_ORIGINS` | `http://localhost:8000` | CSV de origens permitidas. |
| `EMAIL_BACKEND` | `console` | `console` (loga) ou `smtp`. |
| `EMAIL_FROM` | `noreply@blaxx.com.br` | Remetente. |
| `SMTP_HOST/PORT/USERNAME/PASSWORD/USE_TLS` | — | Necessários se `EMAIL_BACKEND=smtp`. |
| `EMAIL_VERIFICATION_TOKEN_TTL` | 86400 (24h) | Em segundos. |
| `PASSWORD_RESET_TOKEN_TTL` | 3600 (1h) | Em segundos. |
| `SESSION_TTL` | 2592000 (30d) | Vida do token de sessão. |
| `LOGIN_RATE_LIMIT_PER_IP` | 20 | Tentativas / janela. |
| `LOGIN_RATE_LIMIT_WINDOW` | 600 | Janela em segundos. |
| `RESEND_VERIFICATION_COOLDOWN` | 60 | Mínimo entre reenvios. |
| `GOOGLE_CLIENT_ID` | — | Reservado para Fase 2. |

---

## Banco de dados

Esquema atual (SQLAlchemy, [models.py](app/models.py)):

- `users` — User com `email_verified`, `status`, `provider`, `google_sub`, etc.
- `auth_sessions` — Sessões opacas por dispositivo (hash do token).
- `email_verification_tokens` — Tokens de confirmação (single-use, expirável).
- `password_reset_tokens` — Tokens de reset.
- `auth_audit_logs` — Eventos de auth (login, logout, reset, etc.).
- `account_providers` — Para Fase 2 (federação Google/etc).

Em dev/CI o esquema é criado via `db.create_all()` no startup. Para produção
recomenda-se Alembic (TODO Fase 2).

---

## Logs e auditoria

- Cada evento de auth é gravado em `auth_audit_logs` com `event_type`, `user_id`,
  `ip_address`, `user_agent`, `metadata_json`, `created_at`.
- Tipos de evento em [services/audit.py](app/services/audit.py).
- Logs são best-effort: falha de gravação não quebra o fluxo do usuário.

---

## Deploy (Fly.io)

> ⚠️ Antes de deployar, decidir migração da produção atual. O domínio
> `blaxx-pontos-backend.fly.dev` tem código diferente do deste repositório
> (versão antiga com auth incompleta). Cutover precisa ser planejado.

### Passos resumidos

```bash
# 1. Editar APP_NAME em backend/fly.toml (criar arquivo)
# 2. fly volumes create blaxx_data --region gru --size 1
# 3. fly secrets set SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
# 4. fly secrets set CORS_ORIGINS="https://blaxx-pontos.netlify.app"
# 5. fly secrets set EMAIL_BACKEND=smtp SMTP_HOST=... SMTP_USERNAME=... SMTP_PASSWORD=...
# 6. fly secrets set APP_URL="https://blaxx-pontos.netlify.app"
# 7. fly deploy
```

`fly.toml` e `Dockerfile` ainda não foram criados — virão na Fase 2 junto com
o JWT/refresh proper.

---

## O que está faltando para "production-ready" pleno

A lista do requirements (20 seções) é grande e foi escopada em fases.
**Fase 1 entregou** os fluxos UX faltantes. **Fase 2** atacará:

- [ ] JWT com refresh token rotation (hoje: sessão opaca single-token)
- [ ] Google OAuth — validação real do ID token no backend, vinculação de contas
- [ ] Argon2id em vez de bcrypt (decisão do timeline)
- [ ] Rate limit baseado em Redis (hoje: dict em memória, ok para 1 worker)
- [ ] Alembic migrations
- [ ] Email com fila assíncrona (hoje: síncrono best-effort)
- [ ] Sentry / observabilidade (hoje: logs estruturados básicos)
- [ ] CSP no frontend
- [ ] Testes E2E com Playwright

---

## Estrutura

```
backend/
├── app/
│   ├── __init__.py            # Application factory + CORS + security headers
│   ├── config.py              # Config dataclass lendo env vars
│   ├── extensions.py          # db = SQLAlchemy()
│   ├── models.py              # User, AuthSession, tokens, audit log
│   ├── api/
│   │   ├── _helpers.py        # validação + Bearer middleware
│   │   ├── auth.py            # /auth/* endpoints
│   │   └── user.py            # /user/* endpoints
│   └── services/
│       ├── audit.py           # log_event() + Event constants
│       ├── email.py           # Console + SMTP backends, templates HTML
│       ├── rate_limit.py      # Bucket em memória (TODO: Redis)
│       ├── session.py         # create/find/revoke AuthSession
│       └── tokens.py          # generate / hash / expires
├── tests/
│   ├── conftest.py
│   └── test_auth.py           # 23 testes cobrindo os fluxos principais
├── instance/                  # SQLite DB (gitignored)
├── .env.example
├── requirements.txt
├── run.py
└── README.md
```
