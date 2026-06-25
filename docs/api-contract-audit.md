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
Adicionar em `app/api/security.py` (blueprint `security`, montado em `/user`):

```python
@bp.patch("/profile")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    user: User = g.current_user
    name = (data.get("name") or "").strip()
    if not name or len(name) < 2:
        return jsonify({"error": "Nome inválido"}), 400
    user.name = name            # confirmar o campo real no modelo User
    db.session.commit()
    audit_svc.log(user.id, "profile.update")   # opcional
    return jsonify(user.to_dict())
```
> Confirme o nome do campo no modelo `User` (`name` / `full_name`). Ajuste se preciso.

### 2. Reenviar verificação de e-mail (pré-login) — `POST /auth/resend-verification`
Front chama: `POST /auth/resend-verification` body `{ email }` **sem token**
(no fluxo de login/validação, onde o usuário ainda não está autenticado). Hoje → **404**.
O `verify-email/send` existente exige login, então não cobre esse caso.

Adicionar em `app/api/auth.py` (blueprint `auth`), **não autenticado**, com proteção
contra enumeração de e-mail (sempre 200):

```python
@bp.post("/resend-verification")
@limiter.limit("3 per minute; 10 per hour")
def resend_verification():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if user and not user.is_email_verified:
        _send_verification_email(user)   # reusar a MESMA lógica de /verify-email/send
    # resposta neutra — não revela se o e-mail existe
    return jsonify({"message": "Se o e-mail existir e não estiver verificado, enviamos um novo link."}), 200
```
> Reaproveite a geração de token + envio de e-mail já usados em `verify-email/send`.
> Alternativa (sem patch de back): fazer o registro **sempre** retornar token (auto-login)
> e usar `verify-email/send` autenticado — decisão de produto.

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
