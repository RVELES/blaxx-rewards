# Auditoria de Contrato de API — Frontend ↔ Backend

> Cruzamento entre o frontend (`blaxx-rewards`) e o backend (`rveles-blaxx/blaxx-pontos`,
> deploy `blaxx-pontos-exe.onrender.com`). Verificado ao vivo em 2026-06-25.
> Resultado: **55 chamadas do front → 44 ✅ · 5 quebradas (corrigidas/abaixo) · demais OK ao vivo**.

## Observações estruturais (verificadas ao vivo)
- **Sem prefixo `/api`**: os paths respondem direto (`/auth/me`, `/wallet/`…). A ressalva de um possível `api_bp` pai foi descartada (probe ao vivo).
- O blueprint **`security` é montado em `/user`** → a maioria dos `/user/*` (phone, 2fa-sms, sessions, access-log) **existe**.
- `GET /healthz`, `GET /partners/categories`, `POST /auth/login/2fa` → **OK ao vivo** (200/200/400). Eram falsos-positivos da análise estática.

---

## ✅ Corrigido no frontend (este PR)
Chamadas que usavam nomes errados para endpoints que **já existem**:

| Feature | Antes (404/405) | Agora |
|---|---|---|
| Trocar senha | `PATCH /user/password` `{current_password,…}` | `POST /auth/change-password` `{old_password, new_password}` |
| Sair de todos os dispositivos | `POST /auth/logout-all` | `POST /auth/sessions/revoke-all` |

Ambas em `assets/blaxx-app.js`, contexto autenticado (settings) → seguras.

---

## 🔧 Patch necessário no BACKEND (`rveles-blaxx/blaxx-pontos`)
Duas features do front chamam endpoints **inexistentes**. Em vez de mudar o front,
recomendo **adicionar os endpoints com o contrato que o front já espera** (assim o
front funciona sem novas mudanças).

### 1. Editar perfil — `PATCH /user/profile`
Front chama: `PATCH /user/profile` body `{ name }` (autenticado). Hoje → **404**.
Adicionar em `app/api/security.py` (blueprint `security`, montado em `/user`).
**Imports já presentes no arquivo** (`Blueprint, g, jsonify, request`, `db`, `User`) — nada a adicionar.

```python
@bp.patch("/profile")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    user: User = g.current_user
    name = (data.get("name") or "").strip()
    if len(name) < 2 or len(name) > 120:          # User.name é String(120)
        return jsonify({"error": "Nome deve ter entre 2 e 120 caracteres"}), 400
    user.name = name
    db.session.commit()
    return jsonify(user.to_dict())
```

### 2. Reenviar verificação de e-mail (pré-login) — `POST /auth/resend-verification`
Front chama: `POST /auth/resend-verification` body `{ email }` **sem token**
(no fluxo de login/validação). Hoje → **404**.
Adicionar em `app/api/auth.py` (blueprint `auth`), **não autenticado**, anti-enumeração
(sempre 200), reusando a MESMA lógica de `verify-email/send`.
**Imports já presentes** (`User, EmailVerification, db, generate_numeric_code,
send_email_verification, limiter, datetime, timezone, timedelta, current_app`) — nada a adicionar.

```python
@bp.post("/resend-verification")
@limiter.limit("3 per minute; 10 per hour")
def resend_verification_public():
    """Reenvia código de verificação SEM exigir login (fluxo pré-autenticação).
    Resposta neutra — não revela se o e-mail existe (anti-enumeração)."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if user and not user.is_email_verified:
        # invalida códigos pendentes (mesmo passo do verify-email/send)
        db.session.query(EmailVerification).filter_by(
            user_id=user.id, consumed_at=None
        ).update({"consumed_at": datetime.now(timezone.utc)})
        code = generate_numeric_code(6)
        db.session.add(EmailVerification(
            user_id=user.id,
            code_hash=EmailVerification.hash_code(code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        ))
        db.session.commit()
        try:
            send_email_verification(user.email, user.name, code)
        except Exception as e:
            current_app.logger.warning("Falha ao reenviar (público): %s", e)
    return jsonify({"ok": True, "message": "Se o e-mail existir e não estiver verificado, enviamos um novo código."}), 200
```
> Contrato idêntico ao que o front já envia (`{email}` / `{name}`) → **nenhuma mudança no front** é necessária para estes dois, basta aplicar o backend.

---

## 💡 Capacidades prontas no backend, sem UI no front (quick wins)
Já existem no servidor, só falta integrar:
- **LGPD:** `DELETE /auth/account` (excluir conta), `GET /auth/account/export` (exportar dados).
- **Resgate:** `GET /redeem/quote` (cotação antes de resgatar), `GET /redeem/<id>` (status do payout).
- **Notificações:** `GET /notifications/unread-count` (badge), `POST /notifications/read-all`.
- **Cartão:** `GET /card/tiers`, `GET /card/pass/status`.
- **Campanhas:** `GET /campaigns/<id>` (detalhe), `GET /campaigns/mine`.
- **Push web (PWA):** `POST /push/subscribe`, `POST /push/unsubscribe`.
- **Admin avançado:** roles/status de usuário, estorno de transferência, export CSV, alertas, experiments.
- **Termos:** `GET /auth/terms/current`, `POST /auth/terms/reaccept`.

---

## ⚠️ Ambiguidades a revisar no backend (não bloqueiam, mas confundem)
- `GET /benefits/<id>`: há dois handlers com a mesma assinatura (`<benefit_id>` público e
  `<voucher_id>` autenticado). Sugiro mover vouchers para `/vouchers/<id>`.
- `GET /partners/categories` vs `/partners/<id>`: garantir a rota estática registrada
  antes da paramétrica (ao vivo está OK, mas é frágil).
